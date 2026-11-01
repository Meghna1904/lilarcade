import test from 'node:test';
import assert from 'node:assert/strict';
import { createCups, getViewFor, isPermutation, scoreGuess, submitGuess } from './cups.js';

const cups = ['coral', 'sky', 'butter', 'mint', 'lavender'] as const;

test('scoreGuess handles zero, partial, and all correct', () => {
  assert.equal(scoreGuess(['sky', 'butter', 'mint', 'lavender', 'coral'], [...cups]), 0);
  assert.equal(scoreGuess(['coral', 'sky', 'mint', 'lavender', 'butter'], [...cups]), 2);
  assert.equal(scoreGuess([...cups], [...cups]), 5);
});

test('isPermutation rejects repeats, missing cups, and foreign cups', () => {
  assert.equal(isPermutation(['coral', 'sky', 'butter', 'mint', 'lavender'], [...cups]), true);
  assert.equal(isPermutation(['coral', 'sky', 'butter', 'mint', 'mint'], [...cups]), false);
  assert.equal(isPermutation(['coral', 'sky', 'butter', 'mint'], [...cups]), false);
  assert.equal(isPermutation(['coral', 'sky', 'butter', 'mint', 'peach'] as never, [...cups]), false);
});

test('guesser view never exposes the secret before the round ends', () => {
  const game = createCups('arranger', 'guesser', 'quick');
  game.secret = [...cups];
  game.phase = 'guessing';
  assert.equal('secret' in getViewFor(game, 'guesser'), false);
  submitGuess(game, 'guesser', ['sky', 'butter', 'mint', 'lavender', 'coral']);
  const view = getViewFor(game, 'guesser');
  assert.equal('secret' in view, false);
  assert.deepEqual(view.guesses[0].order, ['sky', 'butter', 'mint', 'lavender', 'coral']);
});
