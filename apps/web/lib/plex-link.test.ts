import { describe, expect, it } from "vitest";
import { isMobileBrowser, plexAppDeepLink } from "./plex-link";

describe("Plex winner links", () => {
  it("turns a hosted Plex details URL into a mobile-app preplay link", () => {
    expect(
      plexAppDeepLink(
        "https://app.plex.tv/desktop/#!/server/server-1/details?key=%2Flibrary%2Fmetadata%2F99",
        "MOVIE",
      ),
    ).toBe(
      "plex://preplay/?metadataKey=%2Flibrary%2Fmetadata%2F99&metadataType=1&server=server-1",
    );
  });

  it("leaves non-Plex and malformed URLs on their web fallback", () => {
    expect(plexAppDeepLink("https://plex.famflix.live/web", "MOVIE")).toBeNull();
    expect(plexAppDeepLink("https://app.plex.tv/desktop/", "TV")).toBeNull();
  });

  it("recognizes common phone and tablet user agents", () => {
    expect(isMobileBrowser("Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile")).toBe(true);
    expect(isMobileBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isMobileBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});
