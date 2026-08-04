import { NextResponse } from "next/server";

const palettes = [
  ["#06194d", "#ef3e46", "#ffd637"],
  ["#170b25", "#9d255d", "#50c9e8"],
  ["#031847", "#174aa2", "#9fffdc"],
  ["#250d28", "#701a38", "#fff7bc"],
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const match = /^(\d+)\.svg$/.exec(id);
  if (!match) return NextResponse.json({ error: "Artwork not found." }, { status: 404 });

  const numericId = Number(match[1]);
  const palette = palettes[numericId % palettes.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 750" role="img" aria-label="Seeded test poster">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs>
    <rect width="500" height="750" fill="url(#g)"/>
    <circle cx="390" cy="135" r="180" fill="${palette[2]}" opacity=".18"/>
    <path d="M-40 590 250 220l290 370v200H-40z" fill="#020a25" opacity=".72"/>
    <text x="42" y="92" fill="${palette[2]}" font-family="Arial,sans-serif" font-size="27" font-weight="700" letter-spacing="7">WATCH BRACKET</text>
    <text x="42" y="635" fill="#fffbea" font-family="Impact,Arial,sans-serif" font-size="64" letter-spacing="3">SEEDED</text>
    <text x="42" y="694" fill="${palette[2]}" font-family="Arial,sans-serif" font-size="28" font-weight="700">TEST POSTER · ${numericId}</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/svg+xml; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
