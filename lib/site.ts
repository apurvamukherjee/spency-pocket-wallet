// Absolute base for share links and images. Vercel provides the production domain at build time.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const SITE_NAME = "Spency";
/** The promise every feature serves: end every month on the number you chose. */
export const SITE_TAGLINE = "End every month on the number you chose.";
export const SITE_DESCRIPTION = `${SITE_TAGLINE} One number each day tells you what's safe to spend; Claude keeps it up to date from your payment screenshots.`;
