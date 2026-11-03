import { describe, expect, it } from "vitest";
import { type ReconcileCheck, reconcileGap, reconcileStreak } from "./reconcile";

const check = (date: string): ReconcileCheck => ({ date, computed: 0, actual: 0, resolution: "matched" });

describe("reconcile", () => {
  it("gap is actual minus computed", () => {
    expect(reconcileGap(7_996_000, 7_962_000)).toBe(-34_000);
  });

  it("counts consecutive days ending today", () => {
    expect(reconcileStreak([check("2026-11-01"), check("2026-11-02"), check("2026-11-03")], "2026-11-03")).toBe(3);
  });

  it("keeps yesterday's streak alive until today is checked", () => {
    expect(reconcileStreak([check("2026-11-01"), check("2026-11-02")], "2026-11-03")).toBe(2);
  });

  it("breaks on a missed day", () => {
    expect(reconcileStreak([check("2026-10-31"), check("2026-11-02")], "2026-11-03")).toBe(1);
    expect(reconcileStreak([check("2026-11-01")], "2026-11-03")).toBe(0);
  });
});
