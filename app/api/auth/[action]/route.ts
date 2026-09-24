import { randomUUID, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { execute, row, transaction } from "@/db";
import {
  AuthError,
  authFailure,
  checkOrigin,
  readInput,
  rateLimit,
  session,
  requireSession,
  issueSession,
  verifySecondFactor,
  SESSION_COOKIE,
  now,
  type AuthUser,
} from "@/lib/auth";
import {
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  newTotpSecret,
  makeTotp,
  totpStep,
  digest,
} from "@/lib/auth-crypto";
export const runtime = "nodejs";
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const passwordSchema = z
  .string()
  .min(12, "Password minimal 12 karakter.")
  .max(128, "Password maksimal 128 karakter.");
const response = (body: unknown) =>
  NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    if ((await params).action !== "status")
      return response({ error: "Tidak ditemukan." });
    const s = await session(true);
    return response({
      authenticated: Boolean(s?.verified),
      pendingMfa: Boolean(s && !s.verified),
      mfaEnabled: Boolean(s?.verified && s.totp_secret),
    });
  } catch (e) {
    return authFailure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    if (action === "logout") {
      checkOrigin(req);
      const s = await session(true);
      if (s)
        await execute("DELETE FROM auth_sessions WHERE token_hash=?", [
          s.token_hash,
        ]);
      const result = req.headers.get("accept")?.includes("application/json")
        ? response({ok:true,next:"/login"})
        : NextResponse.redirect(new URL("/login", req.headers.get("origin")!),303);
      result.cookies.set(SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      result.headers.set("Cache-Control", "no-store");
      return result;
    }
    const input = await readInput(req);
    if (action === "register" || action === "login") {
      await rateLimit("auth-global", "all", 100);
      const email = emailSchema.parse(input.email);
      await rateLimit("credentials", email, 10);
      const password = passwordSchema.parse(input.password);
      if (action === "register") {
        const name = z.string().trim().min(2).max(80).parse(input.name);
        const encoded = await hashPassword(password);
        let user: AuthUser;
        try {
          const id = randomUUID();
          await execute(
            "INSERT INTO auth_users(id,email,name,password_hash,created) VALUES(?,?,?,?,?)",
            [id, email, name, encoded, now()],
          );
          user = (await row<AuthUser>("SELECT * FROM auth_users WHERE id=?", [
            id,
          ]))!;
        } catch (e) {
          if ((e as { code?: string }).code === "ER_DUP_ENTRY")
            throw new AuthError(
              400,
              "Akun tidak dapat didaftarkan. Gunakan halaman masuk jika sudah memiliki akun.",
            );
          throw e;
        }
        return await issueSession(
          user,
          true,
          response({ ok: true, next: "/" }),
        );
      }
      // Lock the user while checking credentials and issuing the session so MFA changes cannot race login.
      return await transaction(async (db) => {
        const user = await row<AuthUser>(
          "SELECT * FROM auth_users WHERE email=? FOR UPDATE",
          [email],
          db,
        );
        const valid = await verifyPassword(
          password,
          user?.password_hash ?? null,
        );
        if (!user || !valid)
          throw new AuthError(401, "Email atau password tidak sesuai.");
        const verified = !user.totp_secret;
        return issueSession(
          user,
          verified,
          response({ ok: true, next: verified ? "/" : "/verify-2fa" }),
          db,
        );
      });
    }
    if (action === "verify-2fa") {
      const s = await session(true);
      if (!s || s.verified)
        throw new AuthError(
          401,
          "Sesi verifikasi berakhir. Silakan masuk lagi.",
        );
      await rateLimit("mfa", s.id, 8);
      const code = z.string().trim().max(32).parse(input.code);
      return await transaction(async (db) => {
        const user = await row<AuthUser>(
          "SELECT * FROM auth_users WHERE id=? FOR UPDATE",
          [s.id],
          db,
        );
        const active = await row(
          "SELECT token_hash FROM auth_sessions WHERE token_hash=? AND expires>? AND verified=0 FOR UPDATE",
          [s.token_hash, now()],
          db,
        );
        if (!user || !active)
          throw new AuthError(401, "Sesi verifikasi berakhir.");
        await verifySecondFactor(user, code, db);
        return issueSession(user, true, response({ ok: true, next: "/" }), db);
      });
    }
    if (["mfa-setup", "mfa-enable", "mfa-disable"].includes(action)) {
      const s = await requireSession();
      await rateLimit("mfa-settings", s.id, 12);
      if (now() - s.session_created > 600)
        throw new AuthError(
          401,
          "Masuk ulang sebelum mengubah pengaturan keamanan.",
        );
      return await transaction(async (db) => {
        const user = await row<AuthUser>(
          "SELECT * FROM auth_users WHERE id=? FOR UPDATE",
          [s.id],
          db,
        );
        const active = await row(
          "SELECT * FROM auth_sessions WHERE token_hash=? AND verified=1 AND expires>? FOR UPDATE",
          [s.token_hash, now()],
          db,
        );
        if (!user || !active)
          throw new AuthError(401, "Silakan masuk kembali.");
        if (action === "mfa-setup") {
          if (user.totp_secret) throw new AuthError(400, "2FA sudah aktif.");
          const secret = newTotpSecret();
          await execute(
            "UPDATE auth_sessions SET pending_secret=?,pending_expires=? WHERE token_hash=?",
            [encrypt(secret), now() + 600, s.token_hash],
            db,
          );
          return response({
            secret,
            uri: makeTotp(secret, user.email).toString(),
          });
        }
        const code = z.string().trim().max(32).parse(input.code);
        if (action === "mfa-enable") {
          if (
            user.totp_secret ||
            !active.pending_secret ||
            Number(active.pending_expires) < now()
          )
            throw new AuthError(400, "Mulai ulang pengaturan 2FA.");
          const secret = decrypt(String(active.pending_secret));
          const step = totpStep(secret, code);
          if (step === null)
            throw new AuthError(400, "Kode authenticator tidak sesuai.");
          const codes = Array.from({ length: 10 }, () =>
            randomBytes(8).toString("hex"),
          );
          await execute(
            "UPDATE auth_users SET totp_secret=?,totp_last_step=? WHERE id=?",
            [encrypt(secret), step, user.id],
            db,
          );
          await execute(
            "DELETE FROM auth_recovery_codes WHERE user_id=?",
            [user.id],
            db,
          );
          for (const recovery of codes)
            await execute(
              "INSERT INTO auth_recovery_codes(user_id,code_hash) VALUES(?,?)",
              [user.id, digest(recovery)],
              db,
            );
          await execute(
            "DELETE FROM auth_sessions WHERE user_id=?",
            [user.id],
            db,
          );
          return issueSession(user, true, response({ ok: true, codes }), db);
        }
        await verifySecondFactor(user, code, db);
        await execute(
          "UPDATE auth_users SET totp_secret=NULL,totp_last_step=-1 WHERE id=?",
          [user.id],
          db,
        );
        await execute(
          "DELETE FROM auth_recovery_codes WHERE user_id=?",
          [user.id],
          db,
        );
        await execute(
          "DELETE FROM auth_sessions WHERE user_id=?",
          [user.id],
          db,
        );
        return issueSession(user, true, response({ ok: true }), db);
      });
    }
    throw new AuthError(404, "Halaman tidak ditemukan.");
  } catch (e) {
    if (e instanceof z.ZodError)
      return responseError(e.issues[0]?.message ?? "Periksa kembali isian.");
    return authFailure(e);
  }
}
function responseError(message: string) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
