import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bucketGenres, criticsScore, emitModule } from './build-movie-corpus.mjs';

test('Wikidata labels bucket into the chip vocabulary, most-hit first, at most four', () => {
  assert.deepEqual(bucketGenres(['romantic comedy film', 'drama film']), [
    'Romance',
    'Comedy',
    'Drama',
  ]);
  // Two comedy labels outrank one drama label.
  assert.deepEqual(bucketGenres(['comedy film', 'buddy film', 'drama film']), ['Comedy', 'Drama']);
  assert.deepEqual(
    bucketGenres(['action film', 'thriller film', 'crime film', 'heist film', 'drama film', 'mystery film'])
      .length,
    4
  );
  // Nothing mappable — "teen" and "epic" are deliberately unbucketed.
  assert.deepEqual(bucketGenres(['teen film', 'epic film']), []);
});

test('Animation survives the four-genre cap, and live-action is not Action', () => {
  const genres = bucketGenres([
    'action film',
    'adventure film',
    'comedy film',
    'fantasy film',
    'animated feature film',
  ]);
  assert.equal(genres[0], 'Animation');
  assert.equal(genres.length, 4);
  assert.deepEqual(bucketGenres(['live-action film']), []);
});

test('the critics score is the Tomatometer, else the Metascore, on one 0–100 scale', () => {
  assert.equal(criticsScore('94%', '78/100'), 94);
  assert.equal(criticsScore(undefined, '78/100'), 78);
  assert.equal(criticsScore(' 100% ', undefined), 100);
  // A 0–10 figure would sit on a different scale from the rest of the rung; it must not parse.
  assert.equal(criticsScore('9.1/10', '7.9/10'), null);
  assert.equal(criticsScore('8.7', undefined), null);
  assert.equal(criticsScore(undefined, undefined), null);
});

test('the emitted module is the shared Movie shape, with absent facts omitted', () => {
  const rated = {
    kind: 'movie',
    placeId: 'Q1',
    name: 'Alien',
    year: 1979,
    genres: ['Horror', 'Sci-Fi'],
    runtimeMinutes: 117,
    rating: 93,
    overview: 'In space…',
    photoUrl: 'https://upload.wikimedia.org/x.jpg',
    trailerUrl: 'https://www.youtube.com/watch?v=abc',
  };
  const unrated = { ...rated, placeId: 'Q2', name: 'Heat', rating: null, trailerUrl: null };
  const module = emitModule([rated, unrated], '2026-09-06');

  assert.match(module, /^\/\/ GENERATED FILE — DO NOT EDIT/);
  assert.match(module, /generated 2026-09-06/);
  assert.match(module, /import type \{ Movie \} from '@dinder\/shared\/types';/);
  // The array literal is JSON, one film per line, so it reads straight back.
  const literal = module.slice(module.indexOf('= [') + 2, module.lastIndexOf(';'));
  const movies = JSON.parse(literal.replace(/,\s*]$/, ']'));
  assert.deepEqual(movies[0], rated);
  const { rating: _r, trailerUrl: _t, ...heat } = unrated;
  assert.deepEqual(movies[1], heat);
});
