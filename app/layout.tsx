import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kantong Rantau — Uangmu, lebih terarah",
  description: "Catat pemasukan, amankan kebutuhan wajib, dan atur budget sampai gajian berikutnya.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
