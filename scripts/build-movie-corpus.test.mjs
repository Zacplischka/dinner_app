import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GENRE_MAP,
  emitCorpus,
  toGenres,
  toMovie,
  trailerUrl,
  unsafeReason,
} from './build-movie-corpus.mjs';

test('TMDB genre names map onto the chip vocabulary, at most four, unknown names dropped', () => {
  assert.deepEqual(toGenres(['Science Fiction', 'Horror']), ['Sci-Fi', 'Horror']);
  // Television's compound genres split, without repeating a chip already named.
  assert.deepEqual(toGenres(['Sci-Fi & Fantasy', 'Fantasy', 'Action & Adventure']), [
    'Sci-Fi',
    'Fantasy',
    'Action',
    'Adventure',
  ]);
  assert.deepEqual(toGenres(['TV Movie', 'Reality', 'Kids']), ['Family']);
  assert.deepEqual(toGenres(['Action', 'Adventure', 'Comedy', 'Crime', 'Drama']).length, 4);
  assert.deepEqual(toGenres([]), []);
  // Every chip a record can carry is one shared/types/watch.ts offers.
  assert.deepEqual([...new Set(Object.values(GENRE_MAP).flat())].sort(), [
    'Action',
    'Adventure',
    'Animation',
    'Comedy',
    'Crime',
    'Documentary',
    'Drama',
    'Family',
    'Fantasy',
    'History',
    'Horror',
    'Music',
    'Mystery',
    'Romance',
    'Sci-Fi',
    'Thriller',
    'War',
    'Western',
  ]);
});

test('the trailer is the official YouTube one, else any YouTube trailer, else none', () => {
  const teaser = { site: 'YouTube', type: 'Teaser', key: 'aaaaaaaaaaa', official: true };
  const fan = { site: 'YouTube', type: 'Trailer', key: 'bbbbbbbbbbb', official: false };
  const official = { site: 'YouTube', type: 'Trailer', key: 'ccccccccccc', official: true };
  const vimeo = { site: 'Vimeo', type: 'Trailer', key: 'ddddddddddd', official: true };
  assert.equal(trailerUrl([teaser, fan, official]), 'https://www.youtube.com/watch?v=ccccccccccc');
  assert.equal(trailerUrl([teaser, fan]), 'https://www.youtube.com/watch?v=bbbbbbbbbbb');
  assert.equal(trailerUrl([teaser, vimeo]), null);
  assert.equal(trailerUrl([{ ...official, key: 'x&list=PL1' }]), null);
  assert.equal(trailerUrl(undefined), null);
});

const film = {
  id: 348,
  title: 'Alien',
  release_date: '1979-05-25',
  runtime: 117,
  vote_average: 8.155,
  vote_count: 14000,
  genres: [{ name: 'Horror' }, { name: 'Science Fiction' }],
  overview:
    '  During its return to the earth, commercial spaceship Nostromo intercepts a distress signal.  ',
  poster_path: '/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg',
  external_ids: { imdb_id: 'tt0078748' },
  videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'LjLamj-b0I8', official: true }] },
};
const series = {
  id: 1399,
  name: 'Game of Thrones',
  first_air_date: '2011-04-17',
  episode_run_time: [60],
  number_of_seasons: 8,
  vote_average: 8.456,
  genres: [{ name: 'Sci-Fi & Fantasy' }, { name: 'Drama' }, { name: 'Action & Adventure' }],
  overview: 'Seven noble families fight for control of the mythical land of Westeros.',
  poster_path: '/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
  external_ids: { imdb_id: 'tt0944947' },
  videos: { results: [] },
};

test('a film detail becomes the shared Movie shape, absent facts omitted', () => {
  assert.deepEqual(toMovie(film, 'movie'), {
    movie: {
      kind: 'movie',
      placeId: 'tmdb:movie:348',
      mediaType: 'movie',
      name: 'Alien',
      year: 1979,
      genres: ['Horror', 'Sci-Fi'],
      runtimeMinutes: 117,
      rating: 82,
      overview:
        'During its return to the earth, commercial spaceship Nostromo intercepts a distress signal.',
      photoUrl: 'https://image.tmdb.org/t/p/w500/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg',
      trailerUrl: 'https://www.youtube.com/watch?v=LjLamj-b0I8',
      imdbId: 'tt0078748',
    },
  });
  const { movie: bare } = toMovie(
    { ...film, runtime: 0, vote_average: 0, overview: '', external_ids: {}, videos: undefined },
    'movie'
  );
  assert.equal('runtimeMinutes' in bare, false);
  assert.equal('rating' in bare, false); // no votes is no score, not a zero
  assert.equal('overview' in bare, false);
  assert.equal('trailerUrl' in bare, false);
  assert.equal('imdbId' in bare, false);
  assert.equal('seasons' in bare, false);
});

test('a series detail becomes a Movie of mediaType tv with its seasons and episode length', () => {
  assert.deepEqual(toMovie(series, 'tv'), {
    movie: {
      kind: 'movie',
      placeId: 'tmdb:tv:1399',
      mediaType: 'tv',
      name: 'Game of Thrones',
      year: 2011,
      genres: ['Sci-Fi', 'Fantasy', 'Drama', 'Action'],
      runtimeMinutes: 60,
      seasons: 8,
      rating: 85,
      overview: 'Seven noble families fight for control of the mythical land of Westeros.',
      photoUrl: 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg',
      imdbId: 'tt0944947',
    },
  });
});

test('a title with no poster, no date or no chip genre is dropped with its reason', () => {
  assert.deepEqual(toMovie({ ...film, poster_path: null }, 'movie'), { drop: 'no poster' });
  assert.deepEqual(toMovie({ ...film, release_date: '' }, 'movie'), { drop: 'no year' });
  assert.deepEqual(toMovie({ ...series, first_air_date: undefined }, 'tv'), { drop: 'no year' });
  assert.deepEqual(toMovie({ ...film, genres: [{ name: 'Reality' }] }, 'movie'), {
    drop: 'no genres',
  });
});

test('an overview is one line, cut at 300 characters on a word', () => {
  const long = { ...film, overview: `${'word '.repeat(80)}end` };
  const { movie } = toMovie(long, 'movie');
  assert.ok(movie.overview.length <= 301);
  assert.match(movie.overview, /word…$/);
});

test('a record is unsafe unless its poster is https on image.tmdb.org, its ids and trailer are well-formed', () => {
  const ok = toMovie(film, 'movie').movie;
  assert.equal(unsafeReason(ok), null);
  assert.equal(unsafeReason({ ...ok, trailerUrl: undefined, imdbId: undefined }), null);
  assert.equal(unsafeReason({ ...ok, placeId: 'javascript:alert(1)' }), 'bad id');
  assert.equal(unsafeReason({ ...ok, name: ' ' }), 'no name');
  assert.equal(unsafeReason({ ...ok, photoUrl: 'not a url' }), 'poster not a URL');
  assert.equal(
    unsafeReason({ ...ok, photoUrl: 'http://image.tmdb.org/t/p/w500/x.jpg' }),
    'poster off image.tmdb.org'
  );
  assert.equal(
    unsafeReason({ ...ok, photoUrl: 'https://image.tmdb.org.evil.example/t/p/w500/x.jpg' }),
    'poster off image.tmdb.org'
  );
  assert.equal(
    unsafeReason({ ...ok, photoUrl: 'https://evil.example/x.jpg?image.tmdb.org' }),
    'poster off image.tmdb.org'
  );
  // A poster_path that is not a plain file name never makes it into a card.
  assert.equal(
    unsafeReason({ ...ok, photoUrl: 'https://image.tmdb.org/t/p/w500//evil.example/x.jpg' }),
    'odd poster path'
  );
  assert.equal(
    unsafeReason({ ...ok, trailerUrl: 'https://www.youtube.com/watch?v=LjLamj-b0I8&list=PL1' }),
    'bad trailer'
  );
  assert.equal(unsafeReason({ ...ok, imdbId: 'nm0000001' }), 'bad imdb id');
});

test('the emitted corpus is JSON, one Movie per line, and reads straight back', () => {
  const movies = [toMovie(film, 'movie').movie, toMovie(series, 'tv').movie];
  const text = emitCorpus(movies);
  assert.equal(text.split('\n').length, movies.length + 3); // [ , n lines, ], trailing newline
  assert.deepEqual(JSON.parse(text), movies);
});
