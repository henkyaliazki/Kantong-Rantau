# Login, Google, dan verifikasi dua langkah

## Menjalankan secara lokal

Gunakan Node 22.12.x, MySQL lokal, dan `npm.cmd run dev`. Next.js menjalankan mode development; tidak perlu memaksa NODE_ENV di .env.local. Buka http://127.0.0.1:3000 secara konsisten.

Jalankan `npm.cmd run db:migrate` untuk menambahkan tabel autentikasi, kemudian buka `/register`. Setelah punya akun, masuk melalui `/login`. Dashboard dan API keuangan memerlukan sesi terverifikasi.

Akun development otomatis dan identitas dari header ChatGPT sudah dinonaktifkan. Data budgeting lama tetap tersimpan dengan ID pemilik lamanya. Akun baru tidak otomatis mengambil data tersebut. Pemindahan data lama harus dilakukan secara eksplisit setelah pemilik akun ditentukan.

## Variabel lingkungan

Simpan konfigurasi di `.env.local`, bukan di Git atau chat:

```dotenv
APP_URL=http://127.0.0.1:3000
AUTH_SECRET=<64 karakter hex acak>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

AUTH_SECRET untuk lingkungan lokal ini sudah dibuat otomatis. Jangan menggantinya sembarangan: kunci ini mengenkripsi secret 2FA dan state Google. Pada instalasi baru, buat kunci dengan `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, lalu simpan hasilnya langsung ke konfigurasi rahasia instalasi tersebut. Gunakan kunci berbeda di setiap lingkungan. Mengganti kunci memerlukan rencana migrasi secret 2FA atau pemulihan akun.

## Mengaktifkan login Google

1. Buka Google Cloud Console dan pilih/buat proyek aplikasi.
2. Konfigurasikan OAuth consent screen/Google Auth Platform: nama aplikasi, kontak, audience, serta pengguna penguji jika aplikasi masih dalam mode testing.
3. Buat OAuth Client dengan tipe **Web application**.
4. Tambahkan Authorized redirect URI persis:

   `http://127.0.0.1:3000/api/auth/google/callback`

5. Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di `.env.local`, kemudian restart `npm.cmd run dev`.
6. Buka aplikasi pada alamat yang sama dengan APP_URL dan pilih **Lanjutkan dengan Google**.

Untuk hosting produksi gunakan HTTPS, APP_URL produksi, serta redirect URI yang cocok. Jangan menaruh client secret dalam variabel NEXT_PUBLIC. Aplikasi hanya meminta scope `openid email profile`; token Google tidak disimpan untuk mengakses layanan Google lain.

Google memverifikasi email akun Google. Jika email yang sama sudah dipakai akun password, aplikasi meminta pengguna masuk dengan password; akun tidak digabung otomatis. Penautan provider pada akun yang sudah ada belum disediakan.

Referensi: https://developers.google.com/identity/openid-connect/openid-connect

## Mengaktifkan 2FA

1. Masuk, buka **Paket & akun → Keamanan akun**.
2. Pilih aktifkan verifikasi dua langkah. Login harus berumur kurang dari 10 menit.
3. Di Google Authenticator atau aplikasi TOTP lain, tambahkan akun secara manual dengan kunci penyiapan yang ditampilkan. Pilih kode berbasis waktu.
4. Masukkan kode 6 digit untuk mengonfirmasi.
5. Simpan/unduh 10 kode pemulihan yang ditampilkan sekali. Setiap kode hanya dapat dipakai sekali.

Login password maupun Google akan meminta 2FA setelah fitur diaktifkan. Tantangan login berlaku 5 menit. Kode TOTP yang sudah diterima tidak bisa dipakai ulang; tunggu kode berikutnya. Untuk menonaktifkan 2FA diperlukan kode authenticator atau kode pemulihan serta sesi yang baru. Perubahan 2FA mencabut sesi lain.

## Lapisan perlindungan

- Hash password scrypt dengan salt acak; minimal 12 dan maksimal 128 karakter.
- Token sesi acak 256-bit, hanya hash token disimpan di database; sesi maksimal 12 jam.
- Cookie HttpOnly dan SameSite=Lax; produksi memakai Secure dan prefix __Host.
- Validasi Origin wajib untuk permintaan perubahan data. Alias loopback hanya diterima dalam development/test dengan protokol dan port yang sama.
- Pembatasan percobaan berbasis MySQL untuk login, pendaftaran, OAuth, dan 2FA.
- Secret TOTP dienkripsi dengan AES-256-GCM; kode pemulihan disimpan sebagai hash.
- OAuth state terikat browser, PKCE, nonce, validasi ID token melalui library Google, email terverifikasi, serta state sekali pakai.
- Tidak mempercayai header identitas pengguna yang dikirim browser.

Pendaftaran email/password belum menyediakan verifikasi email melalui SMTP atau fitur lupa password. Jangan menyatakan email pendaftaran sudah terverifikasi. Login Google memerlukan kredensial Google milik pengelola sebelum dapat diuji end-to-end.

## Pengujian

- `npm.cmd run test:auth-unit`: hashing, enkripsi, TOTP, dan origin.
- `npm.cmd run test:auth`: menggunakan kredensial TEST_DATABASE_URL lokal; membuat database sementara bernama kantong_auth_test_..., menguji HTTP pada port 3107, lalu menghapus hanya database sementara tersebut. Akun MySQL pengujian perlu hak membuat/menghapus database pengujian. Database aplikasi tidak diubah.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`.

Login Google nyata harus diuji manual setelah konfigurasi OAuth tersedia; jangan memakai kredensial produksi untuk tes lokal.
