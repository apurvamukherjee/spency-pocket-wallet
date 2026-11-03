import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmView } from "@/components/auth/ConfirmView";

export const metadata: Metadata = { title: "Confirm" };

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmView />
    </Suspense>
  );
}
