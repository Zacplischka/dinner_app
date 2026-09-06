// A Movie's placeId is `tmdb:<movie|tv>:<id>` (ADR 0014); TMDB's own pages
// for a title are `/movie/<id>` and `/tv/<id>`, and everything the crown links
// — the title page, where to watch — hangs off that one path. A Session dealt
// before the corpus moved to TMDB holds Wikidata ids until it expires; those
// have no TMDB page, so null, and the caller shows no link rather than a dead one.
export const tmdbPath = (placeId: string): string | null => {
  const match = /^tmdb:(movie|tv):(\d+)$/.exec(placeId);
  return match ? `${match[1]}/${match[2]}` : null;
};
