import { describe, expect, it } from "vitest";
import {
  absoluteCatalogArtwork,
  pausedNominationSeconds,
  restoredNominationDeadline,
} from "./nominations.js";

describe("nomination auto-start grace period", () => {
  it("stores seeded artwork as a protocol-valid absolute URL", () => {
    expect(absoluteCatalogArtwork("https://bracket.example/", "/artwork/seeded/438631.svg"))
      .toBe("https://bracket.example/artwork/seeded/438631.svg");
  });

  it("preserves the unused whole-second nomination time", () => {
    const now = new Date("2026-08-03T00:00:00.250Z");
    const deadline = new Date("2026-08-03T00:01:17.900Z");
    const paused = pausedNominationSeconds(deadline, now);

    expect(paused).toBe(78);
    expect(restoredNominationDeadline(now, paused).toISOString()).toBe(
      "2026-08-03T00:01:18.250Z",
    );
  });

  it("always restores at least one second for an edit action", () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    expect(pausedNominationSeconds(now, now)).toBe(1);
    expect(restoredNominationDeadline(now, 0).toISOString()).toBe(
      "2026-08-03T00:00:01.000Z",
    );
  });
});
