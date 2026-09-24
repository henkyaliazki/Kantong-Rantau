import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { execute, row, transaction, type SqlExecutor } from "@/db";
import type { RowDataPacket } from "mysql2";
import { digest, token, decrypt, totpStep } from "./auth-crypto";
import { allowedRequestOrigin } from "./request-origin";
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-rantau-session"
    : "rantau-session";
export const now = () => Math.floor(Date.now() / 1000);
export type AuthUser = RowDataPacket & {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  google_sub: string | null;
  totp_secret: string | null;
  totp_last_step: number;
};
export type AuthSession = AuthUser & {
  token_hash: string;
  verified: number;
  session_created: number;
  expires: number;
  pending_secret: string | null;
  pending_expires: number | null;
};
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function authFailure(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    "Authentication request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return NextResponse.json(
    { error: "Autentikasi belum dapat diproses. Coba kembali." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
export function checkOrigin(req: Request) {
  if (!req.headers.get("origin") || !allowedRequestOrigin(req))
    throw new AuthError(
      403,
      "Permintaan tidak diizinkan. Buka aplikasi dari alamat yang sama.",
    );
}
export async function readInput(req: Request) {
  checkOrigin(req);
  const text = await req.text();
  if (text.length > 4096) throw new AuthError(413, "Isian terlalu panjang.");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AuthError(400, "Format isian tidak valid.");
  }
}
export async function rateLimit(
  scope: string,
  identity: string,
  limit = 8,
  seconds = 900,
) {
  const key = digest(`${scope}:${identity}:${Math.floor(now() / seconds)}`);
  await transaction(async (db) => {
    await execute(
      "INSERT INTO auth_rate_limits(bucket_key,attempts,expires) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=attempts+1",
      [key, now() + seconds],
      db,
    );
  });
  const current = await row<RowDataPacket & { attempts: number }>(
    "SELECT attempts FROM auth_rate_limits WHERE bucket_key=?",
    [key],
  );
  if ((current?.attempts ?? 0) > limit)
    throw new AuthError(
      429,
      "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.",
    );
}
export async function session(
  allowPending = false,
): Promise<AuthSession | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  return row<AuthSession>(
    `SELECT u.*,s.token_hash,s.verified,s.created session_created,s.expires,s.pending_secret,s.pending_expires FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? ${allowPending ? "" : "AND s.verified=1"}`,
    [digest(value), now()],
  );
}
export async function requireSession() {
  const current = await session();
  if (!current) throw new AuthError(401, "Silakan masuk kembali.");
  return current;
}
export async function getUser() {
  const s = await session();
  return s
    ? { userId: s.id, email: s.email, displayName: s.name, fullName: s.name }
    : null;
}
export function setSessionCookie(
  response: NextResponse,
  value: string,
  verified: boolean,
) {
  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: verified ? 43200 : 300,
  });
  response.headers.set("Cache-Control", "no-store");
}
export async function issueSession(
  user: AuthUser,
  verified: boolean,
  response: NextResponse,
  db?: SqlExecutor,
) {
  const value = token();
  const previous = (await cookies()).get(SESSION_COOKIE)?.value;
  if (previous)
    await execute(
      "DELETE FROM auth_sessions WHERE token_hash=?",
      [digest(previous)],
      db,
    );
  await execute(
    "INSERT INTO auth_sessions(token_hash,user_id,verified,created,expires) VALUES(?,?,?,?,?)",
    [
      digest(value),
      user.id,
      verified ? 1 : 0,
      now(),
      now() + (verified ? 43200 : 300),
    ],
    db,
  );
  setSessionCookie(response, value, verified);
  return response;
}
export async function verifySecondFactor(
  user: AuthUser,
  code: string,
  db: SqlExecutor,
) {
  if (!user.totp_secret)
    throw new AuthError(400, "Verifikasi dua langkah tidak aktif.");
  const step = totpStep(decrypt(user.totp_secret), code);
  if (step !== null && step > Number(user.totp_last_step)) {
    await execute(
      "UPDATE auth_users SET totp_last_step=? WHERE id=?",
      [step, user.id],
      db,
    );
    return;
  }
  if (/^[a-f0-9]{16}$/i.test(code)) {
    const result = await execute(
      "DELETE FROM auth_recovery_codes WHERE user_id=? AND code_hash=?",
      [user.id, digest(code.toLowerCase())],
      db,
    );
    if (result.affectedRows === 1) return;
  }
  throw new AuthError(
    401,
    "Kode tidak valid, sudah digunakan, atau kedaluwarsa.",
  );
}
export function googleReady() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
}
export function appOrigin() {
  const url = new URL(process.env.APP_URL || "http://127.0.0.1:3000");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("APP_URL tidak valid.");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("APP_URL produksi harus HTTPS.");
  return url.origin;
}
