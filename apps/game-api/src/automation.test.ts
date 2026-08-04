import { describe, expect, it } from "vitest";
import { isAutomatedRequest } from "./app.js";

describe("automated catalog traffic", () => {
  it("recognizes the explicit Playwright marker", () => {
    expect(isAutomatedRequest({ headers: { "x-watch-bracket-automation": "playwright" } } as never)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 compatible; ExampleBot/1.0",
    "Mozilla/5.0 HeadlessChrome/140.0",
    "Lighthouse",
  ])("recognizes common automation user agents: %s", (userAgent) => {
    expect(isAutomatedRequest({ headers: { "user-agent": userAgent } } as never)).toBe(true);
  });

  it("leaves ordinary browsers on the live catalog path", () => {
    expect(isAutomatedRequest({ headers: { "user-agent": "Mozilla/5.0 Chrome/140.0 Safari/537.36" } } as never)).toBe(false);
  });
});
