import type { Metadata } from "next";
import { NewPasswordView } from "@/components/auth/NewPasswordView";

export const metadata: Metadata = { title: "New password" };

export default function ResetPasswordPage() {
  return <NewPasswordView />;
}
