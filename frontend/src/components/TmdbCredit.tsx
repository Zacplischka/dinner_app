// Every Movie surface credits TMDB (ADR 0014): its terms ask for the logo and
// a notice wherever its data or images appear. Given a placeId the credit
// links the title's own TMDB page, under the overview it came from; without
// one it is the application-level notice the Watch setup screen carries — the
// closest thing the app has to an About page.
import { tmdbPath } from '../utils/tmdb';

const logo = <img src="/images/tmdb.svg" alt="TMDB" className="inline h-3 align-baseline" />;

export default function TmdbCredit({ placeId }: { placeId?: string }) {
  const path = placeId ? tmdbPath(placeId) : null;
  // A record from before the TMDB corpus is not TMDB's data: nothing to credit.
  if (placeId && !path) return null;
  return path ? (
    <p className="mt-1 text-xs text-muted">
      {logo} Data from{' '}
      <a
        href={`https://www.themoviedb.org/${path}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        TMDB
      </a>
    </p>
  ) : (
    <p className="mt-4 text-center text-xs text-muted">
      {logo} This product uses the TMDB API but is not endorsed or certified by{' '}
      <a
        href="https://www.themoviedb.org"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        TMDB
      </a>
      .
    </p>
  );
}
