import type { MonthPlan } from "@/lib/engine/types";
import type { Profile, StoredPlan } from "./types";

/** Engine plan = stored plan + the profile's currency and time zone. Shared by the app and the MCP server. */
export const enginePlan = (plan: StoredPlan, profile: Profile): MonthPlan => ({
  ...plan,
  currency: profile.currency,
  timeZone: profile.timeZone,
});
