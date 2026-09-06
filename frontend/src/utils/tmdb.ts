// A Movie's placeId is `tmdb:<movie|tv>:<id>` (ADR 0014); TMDB's own pages
// for a title are `/movie/<id>` and `/tv/<id>`, and everything the crown links
// — the title page, where to watch — hangs off that one path.
export const tmdbPath = (placeId: string): string => {
  const [, type, id] = placeId.split(':');
  return `${type}/${id}`;
};
