import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  monthEnd,
  overlapDays,
  toLocalDate,
  weekEndOf,
  weekStartOf,
} from "./dates";

describe("dates", () => {
  it("converts instants to calendar dates in a time zone", () => {
    expect(toLocalDate("2026-11-02T19:00:00Z", "Asia/Kolkata")).toBe("2026-11-03");
    expect(toLocalDate("2026-11-02T18:00:00Z", "Asia/Kolkata")).toBe("2026-11-02");
    expect(toLocalDate("2026-11-03T03:00:00Z", "America/Los_Angeles")).toBe("2026-11-02");
  });

  it("does day math across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-10-27", "2026-11-02")).toBe(6);
  });

  it("finds Monday-start weeks", () => {
    expect(weekStartOf("2026-11-03", 1)).toBe("2026-11-02");
    expect(weekStartOf("2026-11-01", 1)).toBe("2026-10-26");
    expect(weekEndOf("2026-11-01", 1)).toBe("2026-11-01");
  });

  it("supports Sunday-start weeks", () => {
    expect(weekStartOf("2026-11-03", 0)).toBe("2026-11-01");
  });

  it("knows month lengths", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthEnd("2026-11")).toBe("2026-11-30");
  });

  it("counts overlap", () => {
    expect(overlapDays("2026-10-26", "2026-11-01", "2026-11-01", "2026-11-30")).toBe(1);
    expect(overlapDays("2026-10-01", "2026-10-05", "2026-11-01", "2026-11-30")).toBe(0);
  });

  it("steps months keeping the anchor day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});
