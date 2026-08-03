export function plexAppDeepLink(
  webUrl: string | null | undefined,
  mediaType: "MOVIE" | "TV",
) {
  if (!webUrl) return null;
  try {
    const url = new URL(webUrl);
    if (url.hostname !== "app.plex.tv") return null;
    const route = url.hash.startsWith("#!/") ? url.hash.slice(2) : "";
    const parsed = new URL(route, "https://app.plex.tv");
    const match = /^\/server\/([^/]+)\/details$/.exec(parsed.pathname);
    const metadataKey = parsed.searchParams.get("key");
    if (!match || !metadataKey) return null;
    const params = new URLSearchParams({
      metadataKey,
      metadataType: mediaType === "MOVIE" ? "1" : "2",
      server: decodeURIComponent(match[1]!),
    });
    return `plex://preplay/?${params}`;
  } catch {
    return null;
  }
}

export function isMobileBrowser(userAgent: string) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}
