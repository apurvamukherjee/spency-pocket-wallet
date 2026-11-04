import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell, Loading } from "@/components/shell/AppShell";
import { loadSeed } from "@/lib/data/seed";

/**
 * The skeleton is the static shell and paints at once; the signed-in user's data streams into it in the same
 * response, instead of the browser fetching it after hydration. The layout stays mounted across tab switches, so
 * this runs on full page loads only; React Query takes over from there.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <Seeded>{children}</Seeded>
    </Suspense>
  );
}

async function Seeded({ children }: { children: React.ReactNode }) {
  // Request-time only: the app below reads the clock (today, greetings), which can't be baked into a prerender.
  await connection();
  return <AppShell seed={await loadSeed()}>{children}</AppShell>;
}
