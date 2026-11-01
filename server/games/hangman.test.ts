import assert from 'node:assert/strict';
import test from 'node:test';
import { configureSettings, createHangman, getViewFor, guessLetter, guessWord, hangmanModule, isOver, lockWord, revealLetter } from './hangman.js';
import type { MatchFormat } from '@arcade/shared';

function game(word: string, settings: Record<string, unknown> = {}, format: MatchFormat = 'quick') {
  const g = createHangman('setter', 'guesser', format);
  assert.equal(configureSettings(g, 'setter', settings), null);
  assert.equal(lockWord(g, 'setter', word), null);
  return g;
}
const rejected = (result: string | null) => { assert.ok(result); return result; };

test('masking reveals every occurrence of a repeated letter', () => {
  const g = game('BANANA');
  assert.equal(guessLetter(g, 'guesser', 'a'), null);
  assert.equal(getViewFor(g, 'guesser').pattern, '_A_A_A');
});

test('spaces remain visible as word gaps from the beginning', () => {
  const g = game('ICE CREAM');
  assert.equal(getViewFor(g, 'guesser').pattern, '___ _____');
  assert.deepEqual(getViewFor(g, 'guesser').wordLengths, [3, 5]);
});

test('correct and wrong letter guesses update separate lists and lives', () => {
  const g = game('CUP');
  assert.equal(guessLetter(g, 'guesser', 'c'), null);
  assert.equal(guessLetter(g, 'guesser', 'Z'), null);
  const view = getViewFor(g, 'guesser');
  assert.deepEqual(view.correct, ['C']); assert.deepEqual(view.wrong, ['Z']);
  assert.equal(view.livesLeft, 5); assert.equal(view.mistakes, 1);
});

test('a repeated letter returns a friendly error and costs no life', () => {
  const g = game('CUP');
  guessLetter(g, 'guesser', 'U');
  assert.equal(guessLetter(g, 'guesser', 'u'), 'You already tried U.');
  assert.equal(g.mistakes, 0);
});

test('guessing the only distinct letter solves a repeated-letter word', () => {
  const g = game('AAA');
  assert.equal(guessLetter(g, 'guesser', 'A'), null);
  assert.equal(g.phase, 'matchOver'); assert.equal(g.roundWinner, 'guesser');
  assert.equal(getViewFor(g, 'guesser').fullWord, 'AAA'); assert.ok(isOver(g));
});

test('running out of lives ends the round for the setter', () => {
  const g = game('AAA', { maxMistakes: 5 });
  for (const letter of ['B', 'C', 'D', 'E', 'F']) assert.equal(guessLetter(g, 'guesser', letter), null);
  assert.equal(g.phase, 'matchOver'); assert.equal(g.roundWinner, 'setter');
  assert.equal(getViewFor(g, 'guesser').livesLeft, 0);
});

test('whole-word guesses are optional, win when correct, and cost two lives when wrong', () => {
  const g = game('FRIED RICE', { allowWordGuess: true });
  assert.equal(guessWord(g, 'guesser', 'fried rice'), null);
  assert.equal(g.roundWinner, 'guesser');
  const wrong = game('FRIED RICE', { allowWordGuess: true });
  assert.equal(guessWord(wrong, 'guesser', 'NOODLES'), null);
  assert.equal(wrong.mistakes, 2); assert.equal(getViewFor(wrong, 'guesser').livesLeft, 4);
  assert.equal(guessWord(game('CUP'), 'guesser', 'CUP'), 'Whole-word guesses are turned off for this round.');
});

test('a wrong whole-word guess can use the remaining lives and end the round', () => {
  const g = game('CUP', { maxMistakes: 5, allowWordGuess: true });
  g.mistakes = 3;
  assert.equal(guessWord(g, 'guesser', 'MUG'), null);
  assert.equal(g.mistakes, 5); assert.equal(g.roundWinner, 'setter');
});

test('a reveal hint costs one life, reveals a letter, and works only once', () => {
  const g = game('BANANA', { allowRevealLetter: true });
  assert.equal(revealLetter(g, 'guesser', () => 0), null);
  const view = getViewFor(g, 'guesser');
  assert.equal(view.mistakes, 1); assert.equal(view.revealUsed, true);
  assert.ok(view.correct.includes('B'));
  assert.equal(revealLetter(g, 'guesser'), 'You already used your letter hint this round.');
});

test('locking while the Guesser is offline waits for reconnect without unpausing moves', () => {
  const g = createHangman('setter', 'guesser', 'quick');
  g.paused = true;
  assert.equal(lockWord(g, 'setter', 'CUP'), null);
  assert.equal(g.phase, 'playing');
  assert.match(guessLetter(g, 'guesser', 'C'), /paused/);
  g.paused = false;
  assert.equal(guessLetter(g, 'guesser', 'C'), null);
});

test('setter input is strictly validated and normalized on the server', () => {
  const g = createHangman('setter', 'guesser', 'quick');
  assert.match(rejected(lockWord(g, 'setter', ' BAD  WORD')), /single spaces/);
  assert.match(rejected(lockWord(g, 'setter', 'bad-word')), /letters A to Z/);
  assert.match(rejected(lockWord(g, 'setter', '   ')), /3–25/);
  assert.equal(lockWord(g, 'setter', 'fried rice', ' date night '), null);
  assert.equal(g.word, 'FRIED RICE'); assert.equal(g.hint, 'date night');
});

test('hint is single-line and limited to 60 characters', () => {
  const g = createHangman('setter', 'guesser', 'quick');
  assert.match(rejected(lockWord(g, 'setter', 'CUP', 'line one\nline two')), /one line/);
  assert.match(rejected(lockWord(g, 'setter', 'CUP', 'x'.repeat(61))), /60 characters/);
});

test('settings are validated and can only change before the word is locked', () => {
  const g = createHangman('setter', 'guesser', 'quick');
  assert.match(rejected(configureSettings(g, 'setter', { maxMistakes: 9 })), /5 to 8/);
  assert.match(rejected(configureSettings(g, 'guesser', { maxMistakes: 5 })), /Only the setter/);
  assert.equal(configureSettings(g, 'setter', { maxMistakes: 8 }), null);
  assert.equal(lockWord(g, 'setter', 'CUP'), null);
  assert.match(rejected(configureSettings(g, 'setter', { maxMistakes: 5 })), /only change before/);
});

test('best of 3 ends as soon as one player gets two round wins', () => {
  const g = createHangman('setter', 'guesser', 'bestOf3');
  g.matchScore.guesser = 1;
  lockWord(g, 'setter', 'AAA'); guessLetter(g, 'guesser', 'A');
  assert.equal(g.phase, 'matchOver'); assert.equal(g.matchScore.guesser, 2);
});

test('guesser views and action errors never contain the secret before round end', () => {
  const secret = 'SECURITY WORD'; const g = game(secret, { allowRevealLetter: true });
  const view = getViewFor(g, 'guesser');
  assert.equal('ownWord' in view, false); assert.equal('fullWord' in view, false);
  assert.equal(JSON.stringify(view).includes(secret), false);
  assert.equal(guessLetter(g, 'setter', 'A'), 'It is not your turn to guess.');
  const duplicateError = guessLetter(g, 'guesser', 'E');
  assert.equal(guessLetter(g, 'guesser', 'E'), 'You already tried E.');
  assert.equal(duplicateError, null);
  const hintError = revealLetter(g, 'guesser', () => 0);
  const response = { view: getViewFor(g, 'guesser'), error: hintError };
  assert.equal(JSON.stringify(response).includes(secret), false);
  const wordGame = game(secret, { allowWordGuess: true });
  const wrongWordError = guessWord(wordGame, 'guesser', 'A DIFFERENT PHRASE');
  assert.equal(JSON.stringify({ view: getViewFor(wordGame, 'guesser'), error: wrongWordError }).includes(secret), false);
  assert.deepEqual(Object.keys(view).sort(), Object.keys(getViewFor(g, 'guesser')).sort());
});

test('only the setter receives the own-word strip before the reveal', () => {
  const g = game('MOON');
  assert.equal(getViewFor(g, 'setter').ownWord, 'MOON');
  assert.equal('ownWord' in getViewFor(g, 'guesser'), false);
});

test('Hangman exposes the common game module interface', () => {
  assert.equal(typeof hangmanModule.start, 'function');
  assert.equal(typeof hangmanModule.handleMove, 'function');
  assert.equal(typeof hangmanModule.getViewFor, 'function');
  assert.equal(typeof hangmanModule.isOver, 'function');
  const g = hangmanModule.start('setter', 'guesser', 'quick');
  assert.equal(hangmanModule.handleMove(g, 'setter', { type: 'lockWord', word: 'CUP' }), null);
  assert.equal(hangmanModule.handleMove(g, 'guesser', { type: 'guessLetter', letter: 'C' }), null);
  assert.equal(hangmanModule.getViewFor(g, 'guesser').pattern, 'C__');
});
