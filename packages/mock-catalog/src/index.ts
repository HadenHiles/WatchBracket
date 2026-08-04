export type MockMediaItem = {
  catalogKey: string;
  mediaType: 'MOVIE' | 'TV';
  title: string;
  releaseYear: number;
  runtimeMinutes: number;
  contentRating: string;
  genres: string[];
  synopsis: string;
  posterUrl?: string;
  availability?: {
    region: string;
    link: string;
    attribution: 'JustWatch';
    offers: [];
  };
};

export type SeededCatalogItem = MockMediaItem & {
  sourceTmdbId: number;
};

/**
 * A deliberately small, checked-in metadata snapshot for browser automation.
 *
 * These records keep real-looking search flows useful without allowing tests,
 * crawlers, screenshot tools, or other automated clients to call TMDB. Artwork
 * is synthetic and served locally; `sourceTmdbId` is provenance only and is
 * never persisted as a live TMDB identity.
 */
export const seededCatalogSnapshotCapturedAt = '2026-08-04' as const;

const seededMovie = (
  sourceTmdbId: number,
  title: string,
  releaseYear: number,
  runtimeMinutes: number,
  contentRating: string,
  genres: string[],
  synopsis: string,
): SeededCatalogItem => ({
  catalogKey: `mock:tmdb-snapshot:${sourceTmdbId}`,
  sourceTmdbId,
  mediaType: 'MOVIE',
  title,
  releaseYear,
  runtimeMinutes,
  contentRating,
  genres,
  synopsis,
  posterUrl: `/artwork/seeded/${sourceTmdbId}.svg`,
  availability: {
    region: 'CA',
    link: `https://www.themoviedb.org/movie/${sourceTmdbId}/watch?locale=CA`,
    attribution: 'JustWatch',
    offers: [],
  },
});

export const seededCatalogSnapshot: readonly SeededCatalogItem[] = [
  seededMovie(438631, 'Dune', 2021, 155, 'PG-13', ['Science Fiction', 'Adventure'], 'A gifted young heir travels to a dangerous desert world at the centre of an interstellar struggle.'),
  seededMovie(841, 'Dune', 1984, 137, 'PG-13', ['Science Fiction', 'Adventure'], 'A young nobleman is drawn into a conflict over a desert planet and its most valuable resource.'),
  seededMovie(11, 'Star Wars', 1977, 121, 'PG', ['Adventure', 'Science Fiction'], 'A farm boy joins a rebellion and sets out to rescue a princess from an imposing space station.'),
  seededMovie(1891, 'The Empire Strikes Back', 1980, 124, 'PG', ['Adventure', 'Science Fiction'], 'The Star Wars rebels scatter while a young hero continues his training and confronts a dark truth.'),
  seededMovie(603, 'The Matrix', 1999, 136, 'R', ['Action', 'Science Fiction'], 'A computer hacker discovers that the familiar world hides a vast simulated reality.'),
  seededMovie(604, 'The Matrix Reloaded', 2003, 138, 'R', ['Action', 'Science Fiction'], 'The resistance races to protect its last city while its chosen fighter searches for the source of the Matrix.'),
  seededMovie(348, 'Alien', 1979, 117, 'R', ['Horror', 'Science Fiction'], 'A commercial starship crew answers a distress signal and brings a deadly organism aboard.'),
  seededMovie(679, 'Aliens', 1986, 137, 'R', ['Action', 'Science Fiction', 'Horror'], 'A survivor returns to a remote colony with a rescue team after its residents stop communicating.'),
] as const;

export const mockCatalog: readonly MockMediaItem[] = [
  { catalogKey: 'mock:aurora-drift', mediaType: 'MOVIE', title: 'Aurora Drift', releaseYear: 2024, runtimeMinutes: 112, contentRating: 'PG-13', genres: ['Science Fiction', 'Adventure'], synopsis: 'A rescue pilot follows a mysterious signal beyond the northern lights.' },
  { catalogKey: 'mock:borrowed-sundays', mediaType: 'MOVIE', title: 'Borrowed Sundays', releaseYear: 2021, runtimeMinutes: 98, contentRating: 'PG', genres: ['Comedy', 'Drama'], synopsis: 'Three neighbours share custody of a chaotic community garden.' },
  { catalogKey: 'mock:clockwork-harbour', mediaType: 'TV', title: 'Clockwork Harbour', releaseYear: 2023, runtimeMinutes: 48, contentRating: 'TV-14', genres: ['Mystery', 'Drama'], synopsis: 'A watchmaker uncovers secrets in a fogbound coastal town.' },
  { catalogKey: 'mock:dinner-at-orbit-nine', mediaType: 'MOVIE', title: 'Dinner at Orbit Nine', releaseYear: 2025, runtimeMinutes: 104, contentRating: 'PG-13', genres: ['Comedy', 'Science Fiction'], synopsis: 'An anniversary dinner goes sideways aboard a luxury space station.' },
  { catalogKey: 'mock:echoes-of-marigold', mediaType: 'TV', title: 'Echoes of Marigold', releaseYear: 2020, runtimeMinutes: 52, contentRating: 'TV-14', genres: ['Drama', 'Fantasy'], synopsis: 'A family inherits a radio that broadcasts tomorrow’s memories.' },
  { catalogKey: 'mock:field-guide-to-giants', mediaType: 'MOVIE', title: 'A Field Guide to Giants', releaseYear: 2019, runtimeMinutes: 116, contentRating: 'PG', genres: ['Fantasy', 'Family'], synopsis: 'Two siblings map the gentle giants hiding across the countryside.' },
  { catalogKey: 'mock:glass-lantern', mediaType: 'MOVIE', title: 'The Glass Lantern', releaseYear: 2022, runtimeMinutes: 107, contentRating: '14A', genres: ['Thriller', 'Mystery'], synopsis: 'A night courier receives a package that everyone seems to recognize.' },
  { catalogKey: 'mock:half-past-mars', mediaType: 'TV', title: 'Half Past Mars', releaseYear: 2024, runtimeMinutes: 32, contentRating: 'TV-PG', genres: ['Comedy', 'Science Fiction'], synopsis: 'The least prepared crew on Mars tries to run its first diner.' },
  { catalogKey: 'mock:ink-and-thunder', mediaType: 'MOVIE', title: 'Ink & Thunder', releaseYear: 2018, runtimeMinutes: 121, contentRating: 'PG-13', genres: ['Action', 'History'], synopsis: 'A newspaper illustrator is pulled into a citywide conspiracy.' },
  { catalogKey: 'mock:june-after-midnight', mediaType: 'MOVIE', title: 'June After Midnight', releaseYear: 2023, runtimeMinutes: 101, contentRating: 'PG-13', genres: ['Romance', 'Drama'], synopsis: 'Two old friends reconnect during a summer of endless night.' },
  { catalogKey: 'mock:kestrel-station', mediaType: 'TV', title: 'Kestrel Station', releaseYear: 2022, runtimeMinutes: 45, contentRating: 'TV-14', genres: ['Science Fiction', 'Thriller'], synopsis: 'A remote research crew realizes their station is moving.' },
  { catalogKey: 'mock:last-map-home', mediaType: 'MOVIE', title: 'The Last Map Home', releaseYear: 2020, runtimeMinutes: 109, contentRating: 'PG', genres: ['Adventure', 'Drama'], synopsis: 'A cartographer and her father retrace a route erased from every map.' },
  { catalogKey: 'mock:moonlight-market', mediaType: 'TV', title: 'Moonlight Market', releaseYear: 2025, runtimeMinutes: 29, contentRating: 'TV-PG', genres: ['Fantasy', 'Comedy'], synopsis: 'Night-shift merchants sell impossible things before sunrise.' },
  { catalogKey: 'mock:northbound-signal', mediaType: 'MOVIE', title: 'Northbound Signal', releaseYear: 2021, runtimeMinutes: 95, contentRating: '14A', genres: ['Thriller', 'Adventure'], synopsis: 'A train operator receives warnings from a station that closed decades ago.' },
  { catalogKey: 'mock:paper-crown', mediaType: 'TV', title: 'Paper Crown', releaseYear: 2019, runtimeMinutes: 55, contentRating: 'TV-MA', genres: ['Drama', 'Political'], synopsis: 'A reluctant archivist becomes the keeper of a fragile republic.' },
  { catalogKey: 'mock:quietest-heist', mediaType: 'MOVIE', title: 'The Quietest Heist', releaseYear: 2024, runtimeMinutes: 103, contentRating: 'PG-13', genres: ['Comedy', 'Crime'], synopsis: 'A museum audio team attempts a robbery without making a sound.' }
] as const;

export function searchMockCatalog(query: string, mediaType?: 'MOVIE' | 'TV') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return mockCatalog.filter((item) => {
    if (mediaType && item.mediaType !== mediaType) return false;
    const haystack = `${item.title} ${item.genres.join(' ')} ${item.synopsis}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).slice(0, 12);
}

export function searchSeededCatalogSnapshot(query: string, mediaType?: 'MOVIE' | 'TV') {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return seededCatalogSnapshot.filter((item) => {
    if (mediaType && item.mediaType !== mediaType) return false;
    const haystack = `${item.title} ${item.genres.join(' ')} ${item.synopsis}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).slice(0, 12);
}
