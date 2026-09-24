import { redirect } from "next/navigation";
import { getUser, googleReady } from "@/lib/auth";
import AuthForm from "../auth-form";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      googleEnabled={googleReady()}
      development={process.env.NODE_ENV === "development"}
      initialError={
        error === "email-exists"
          ? "Email ini sudah memiliki akun. Masuk menggunakan password akun Anda."
          : error === "google-failed"
            ? "Login Google belum berhasil atau dibatalkan. Silakan coba lagi."
            : ""
      }
    />
  );
}
