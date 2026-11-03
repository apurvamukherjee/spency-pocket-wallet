import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsentView } from "@/components/auth/ConsentView";

export const metadata: Metadata = { title: "Connect an app" };

export default function ConsentPage() {
  return (
    <Suspense>
      <ConsentView />
    </Suspense>
  );
}
