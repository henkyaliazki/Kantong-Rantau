"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Wallet, ShieldCheck, ArrowRight } from "lucide-react";
export default function AuthForm({
  mode,
  googleEnabled,
  initialError = "",
  development = false,
}: {
  mode: "login" | "register" | "verify-2fa";
  googleEnabled: boolean;
  initialError?: string;
  development?: boolean;
}) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  const register = mode === "register",
    mfa = mode === "verify-2fa";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await fetch("/api/auth/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Permintaan gagal.");
      window.location.assign(body.next || "/");
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Wallet />
          </span>
          <span>
            Kantong<span className="brand-sub">Rantau</span>
          </span>
        </Link>
        <p className="eyebrow">RUMAH UNTUK RENCANA KEUANGANMU</p>
        <h1>
          Jauh dari rumah.
          <br />
          Tetap pegang kendali.
        </h1>
        <p>
          Catat pengeluaran, rencanakan gaji, dan bangun kebiasaan baik—satu
          hari demi satu hari.
        </p>
        <div className="auth-assurance">
          <ShieldCheck />
          <span>Akun pribadi. Catatan tersimpan untukmu.</span>
        </div>
      </section>
      <section className="auth-form-card">
        {development && <span className="badge">MODE DEVELOPMENT</span>}
        <h2>
          {mfa
            ? "Verifikasi dua langkah"
            : register
              ? "Mulai perjalananmu"
              : "Selamat datang kembali"}
        </h2>
        <p className="muted">
          {mfa
            ? "Masukkan kode dari aplikasi authenticator atau satu kode pemulihan."
            : register
              ? "Buat akun untuk mulai mengatur uang dengan lebih terarah."
              : "Masuk untuk melanjutkan rencana keuanganmu."}
        </p>
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {register && (
              <label className="field">
                Nama
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            {!mfa && (
              <>
                <label className="field">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
                <label className="field">
                  Password
                  <div className="password-field">
                    <input
                      name="password"
                      type={show ? "text" : "password"}
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      required
                      minLength={12}
                      maxLength={128}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-label={
                        show ? "Sembunyikan password" : "Tampilkan password"
                      }
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                {register && (
                  <p className="small muted">
                    Gunakan minimal 12 karakter. Gabungkan beberapa kata agar
                    mudah diingat.
                  </p>
                )}
              </>
            )}
            {mfa && (
              <label className="field">
                Kode verifikasi / pemulihan
                <input
                  name="code"
                  autoComplete="one-time-code"
                  required
                  maxLength={16}
                  spellCheck={false}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy
                ? "Memproses…"
                : mfa
                  ? "Verifikasi"
                  : register
                    ? "Daftar akun"
                    : "Masuk"}
              <ArrowRight size={18} />
            </button>
          </fieldset>
        </form>
        {!mfa && (
          <>
            <div className="auth-divider">atau</div>
            <form method="post" action="/api/auth/google">
              <button
                className="secondary auth-submit"
                disabled={!googleEnabled || busy}
              >
                <span aria-hidden="true">G</span> Lanjutkan dengan Google
              </button>
            </form>
            {!googleEnabled && (
              <p className="small muted">
                Login Google sedang disiapkan. Anda tetap bisa masuk dengan
                email dan password.
              </p>
            )}
            <p className="auth-switch">
              {register ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
              <Link href={register ? "/login" : "/register"}>
                {register ? "Masuk" : "Daftar sekarang"}
              </Link>
            </p>
          </>
        )}
        {mfa && (
          <Link className="subtle-button" href="/login">
            Kembali ke halaman masuk
          </Link>
        )}
        <p className="small muted">
          {mfa
            ? "Kode pemulihan hanya dapat digunakan satu kali."
            : "Anda dapat menambahkan verifikasi dua langkah setelah masuk."}
        </p>
      </section>
    </main>
  );
}
