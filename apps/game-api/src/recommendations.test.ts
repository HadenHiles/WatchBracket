import { describe, expect, it } from "vitest";
import type { RecommendationCandidate } from "@watch-bracket/provider-contracts";
import {
  interleavePlexPreferences,
  isEnglishRecommendation,
  prioritizeUnseenCandidates,
  scoreCandidate,
} from "./recommendations.js";

const candidate = (
  catalogKey: string,
  overrides: Partial<RecommendationCandidate["item"]> = {},
  relatedSeedKeys = ["tmdb:MOVIE:1"],
): RecommendationCandidate => ({
  item: {
    catalogKey,
    tmdbId: Number(catalogKey.split(":").at(-1)),
    mediaType: "MOVIE",
    title: catalogKey,
    originalTitle: catalogKey,
    originalLanguage: "en",
    releaseDate: "2024-01-01",
    releaseYear: 2024,
    runtimeMinutes: 105,
    contentRating: "PG-13",
    genres: ["Drama"],
    synopsis: "",
    posterUrl: null,
    backdropUrl: null,
    popularity: 20,
    voteAverage: 7,
    voteCount: 500,
    adult: false,
    availability: {
      region: "CA",
      link: null,
      attribution: "JustWatch",
      offers: [],
    },
    ...overrides,
  },
  relatedSeedKeys,
  sourceKinds: ["RECOMMENDATIONS"],
});

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

  it("admits only English-language bracket recommendations", () => {
    expect(isEnglishRecommendation(candidate("tmdb:MOVIE:10"))).toBe(true);
    expect(
      isEnglishRecommendation(
        candidate("tmdb:MOVIE:11", { originalLanguage: "fr" }),
      ),
    ).toBe(false);
  });

  it("prefers a strong group genre match over an unrelated title", () => {
    const tasteGenres = new Map([
      ["action", 4],
      ["adventure", 3],
    ]);
    const preferenceOwners = new Map([
      ["tmdb:MOVIE:1", new Set(["viewer-a", "viewer-b"])],
    ]);
    const score = (item: RecommendationCandidate) =>
      scoreCandidate(
        item,
        tasteGenres,
        "room-seed",
        2026,
        preferenceOwners,
        new Set(),
        2,
      ).scoreTotal;
    const tasteMatch = candidate("tmdb:MOVIE:12", {
      genres: ["Action", "Adventure"],
      popularity: 8,
      voteCount: 80,
    });
    const unrelated = candidate("tmdb:MOVIE:13", {
      genres: ["Romance"],
      popularity: 300,
      voteCount: 30_000,
    });

    expect(score(tasteMatch)).toBeGreaterThan(score(unrelated));
  });

  it("uses mainstream confidence when no taste signal separates candidates", () => {
    const score = (item: RecommendationCandidate) =>
      scoreCandidate(
        item,
        new Map(),
        "room-seed",
        2026,
        new Map(),
        new Set(),
        0,
      ).scoreTotal;
    const mainstream = candidate("tmdb:MOVIE:14", {
      popularity: 300,
      voteCount: 30_000,
    }, ["history-seed"]);
    const obscure = candidate("tmdb:MOVIE:15", {
      popularity: 1,
      voteCount: 5,
    }, ["history-seed"]);

    expect(score(mainstream)).toBeGreaterThan(score(obscure));
  });

  it("round-robins Plex seeds so one participant cannot fill the seed budget", () => {
    const movie = (tmdbId: number) => ({ tmdbId, mediaType: "MOVIE" as const });
    const interleaved = interleavePlexPreferences([
      { participantId: "viewer-a", items: [movie(1), movie(2), movie(3)] },
      { participantId: "viewer-b", items: [movie(10), movie(11)] },
    ]);

    expect(interleaved.map((item) => item.tmdbId)).toEqual([1, 10, 2, 11, 3]);
  });
});
