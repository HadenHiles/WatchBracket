import { NextResponse } from "next/server";

const allowedSizes = new Set([
  "w92",
  "w154",
  "w185",
  "w342",
  "w500",
  "w780",
  "original",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (
    path.length !== 2 ||
    !allowedSizes.has(path[0] ?? "") ||
    !/^[A-Za-z0-9_-]+\.(?:avif|jpg|jpeg|png|webp)$/.test(path[1] ?? "")
  )
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });

  const upstream = new URL(
    `${path[0]}/${path[1]}`,
    "https://image.tmdb.org/t/p/",
  );
  const response = await fetch(upstream, {
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 7 * 24 * 60 * 60 },
  }).catch(() => undefined);
  const contentType = response?.headers.get("content-type") ?? "";
  if (!response?.ok || !contentType.startsWith("image/"))
    return NextResponse.json({ error: "Artwork unavailable." }, { status: 502 });

  return new NextResponse(response.body, {
    headers: {
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
