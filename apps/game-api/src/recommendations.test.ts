import { describe, expect, it } from "vitest";
import { prioritizeUnseenCandidates } from "./recommendations.js";

describe("recommendation freshness", () => {
  it("keeps unseen candidates first without discarding recent fallbacks", () => {
    const items = [
      { mediaItemId: "recent-a", score: 100 },
      { mediaItemId: "unseen-a", score: 90 },
      { mediaItemId: "recent-b", score: 80 },
      { mediaItemId: "unseen-b", score: 70 },
    ];

    expect(
      prioritizeUnseenCandidates(items, new Set(["recent-a", "recent-b"])),
    ).toEqual([
      { mediaItemId: "unseen-a", score: 90 },
      { mediaItemId: "unseen-b", score: 70 },
      { mediaItemId: "recent-a", score: 100 },
      { mediaItemId: "recent-b", score: 80 },
    ]);
  });
});
