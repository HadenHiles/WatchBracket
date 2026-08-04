import { describe, expect, it } from "vitest";
import {
  absoluteCatalogArtwork,
  pausedNominationSeconds,
  restoredNominationDeadline,
  selectVariedSuggestions,
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

  it("varies Plex suggestions between rooms but keeps a room stable", () => {
    const suggestions = Array.from({ length: 20 }, (_, index) => ({
      catalogKey: `tmdb:movie:${index + 1}`,
    }));

    const firstRoom = selectVariedSuggestions(suggestions, "room-one:viewer", 12);
    const sameRoom = selectVariedSuggestions(suggestions, "room-one:viewer", 12);
    const nextRoom = selectVariedSuggestions(suggestions, "room-two:viewer", 12);

    expect(sameRoom).toEqual(firstRoom);
    expect(nextRoom).not.toEqual(firstRoom);
    expect(new Set(firstRoom.map((item) => item.catalogKey))).toHaveLength(12);
    expect(suggestions[0]?.catalogKey).toBe("tmdb:movie:1");
  });
});
