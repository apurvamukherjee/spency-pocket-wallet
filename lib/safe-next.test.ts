import { expect, it } from "vitest";
import { safeNext } from "./safe-next";

it("allows same-site paths only", () => {
  expect(safeNext("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
  expect(safeNext("https://evil.example")).toBe("/");
  expect(safeNext("//evil.example")).toBe("/");
  expect(safeNext("/\\evil.example")).toBe("/");
  expect(safeNext(null)).toBe("/");
});
