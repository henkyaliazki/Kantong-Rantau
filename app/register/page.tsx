import { redirect } from "next/navigation";
import { getUser, googleReady } from "@/lib/auth";
import AuthForm from "../auth-form";
export const dynamic = "force-dynamic";
export default async function Register() {
  if (await getUser()) redirect("/");
  return (
    <AuthForm
      mode="register"
      googleEnabled={googleReady()}
      development={process.env.NODE_ENV === "development"}
    />
  );
}
