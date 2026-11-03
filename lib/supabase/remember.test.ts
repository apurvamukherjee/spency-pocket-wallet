import { describe, expect, it } from "vitest";
import { cookieLifetime, REMEMBER_SECONDS } from "./remember";

describe("cookieLifetime", () => {
  const base = { path: "/", maxAge: 400 * 86400 };
  it("caps remembered sessions at 30 days", () => expect(cookieLifetime(base, true)).toEqual({ path: "/", maxAge: REMEMBER_SECONDS }));
  it("makes other sessions end with the browser", () => expect(cookieLifetime(base, false)).toEqual({ path: "/" }));
  it("leaves removals alone", () => expect(cookieLifetime({ path: "/", maxAge: 0 }, false)).toEqual({ path: "/", maxAge: 0 }));
});
