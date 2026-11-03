import { describe, expect, it } from "vitest";
import { summarize } from "./engine/derive";
import { findDuplicate } from "./engine/inbox";
import { seedData } from "./seed";

describe("seedData", () => {
  it.each(["2026-11-01", "2026-11-03", "2026-11-18", "2027-02-28"])("produces a coherent month on %s", (today) => {
    const { data } = seedData(today);
    const s = summarize(data, today);
    expect(Number.isSafeInteger(s.projected)).toBe(true);
    expect(s.safeToday).toBeGreaterThanOrEqual(0);
    const pending = data.txns.filter((t) => t.status === "pending");
    expect(pending.length).toBeGreaterThanOrEqual(3);
  });

  it("flags the seeded duplicate", () => {
    const { data } = seedData("2026-11-18");
    const dup = data.txns.find((t) => t.status === "pending" && t.merchant === "Blinkit");
    expect(dup && findDuplicate(dup, data.txns.filter((t) => t.id !== dup.id))).toBeTruthy();
  });
});
