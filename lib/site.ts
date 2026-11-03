// Absolute base for share links and images. Vercel provides the production domain at build time.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const SITE_NAME = "Spency";
export const SITE_DESCRIPTION = "A calm spending tracker that keeps you on course for the month-end balance you planned, kept up to date by Claude.";
