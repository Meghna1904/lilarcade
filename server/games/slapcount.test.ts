import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getViewFor, layCard, markCardVisible, slap, resolveWindow, completeResolve, startPlaying, recordRtt, pauseTimers, resumeTimers, handleMove } from './slapcount.js';
import type { SlapSettings } from '@arcade/shared';

const settings: SlapSettings = { startingCards: 10, penaltyCards: 2, pace: 'manual', callMode: false };
function game(now = 0) { return createGame('a', 'b', 'a', 'quick', settings, 1, {}, now); }
function play(g: ReturnType<typeof game>, now = 3_000) { assert.equal(startPlaying(g, now), true); }
function cards(values: number[], suit: 'heart'|'star'|'moon'|'drop' = 'heart') { return values.map((value, i) => ({ uid: i + 1, value, suit })); }
function giveVisible(g: ReturnType<typeof game>) { markCardVisible(g, 'a'); markCardVisible(g, 'b'); }

test('builds a shuffled 40-card deck and views reveal only counts and played pile', () => {
  const g = createGame('a','b','a','quick',{ ...settings, startingCards:20 },1,{},0);
  assert.equal(g.decks.a.length, 20); assert.equal(g.decks.b.length, 20);
  assert.equal(new Set([...g.decks.a, ...g.decks.b].map(card => card.uid)).size, 40);
  assert.equal([...g.decks.a, ...g.decks.b].every(card => card.value >= 1 && card.value <= 10), true);
  const view = getViewFor(g, 'a', 0) as any;
  assert.equal(view.myDeckSize, 20); assert.equal(view.opponentDeckSize, 20);
  assert.equal('decks' in view, false); assert.equal('uid' in view, false);
});

test('ready countdown starts play and count wraps from ten to one', () => {
  const g = game(); g.decks.a = cards(Array.from({length:10}, (_,i)=>i+1)); g.decks.b = cards(Array.from({length:10}, (_,i)=>i+1));
  assert.equal(startPlaying(g, 2_999), false); play(g);
  let now = 3_000;
  for (let count = 1; count <= 10; count++) {
    const result = layCard(g, g.turn, now); assert.equal(result.cardLaid?.count, count);
    now += 600;
  }
  assert.equal(g.count, 1);
});

test('matching slap resolves to the fastest RTT-adjusted player and transfers pile', () => {
  const g = game(); play(g); g.decks.a = cards([1, 2]); g.decks.b = cards([1, 2]);
  const laid = layCard(g, 'a', 3_000); assert.equal(laid.cardLaid?.count, 1); giveVisible(g);
  recordRtt(g, 'a', 0); recordRtt(g, 'b', 100);
  assert.equal(handleMove(g, 'a', { type: 'slap:slap', cardId: g.currentCardId }, 3_100).status, 'pending');
  assert.equal(handleMove(g, 'b', { type: 'slap:slap', cardId: g.currentCardId }, 3_120).status, 'pending');
  const resolved = resolveWindow(g, 3_270);
  assert.equal(resolved.event?.result, 'pile'); assert.equal(resolved.event?.winner, 'b');
  assert.equal(g.phase, 'resolving'); assert.equal(g.pile.length, 0); assert.equal(g.decks.b.length, 3);
  assert.equal(completeResolve(g, 4_470), true); assert.equal(g.turn, 'a'); assert.equal(g.count, 1);
});

test('old and unseen cards are ignored; wrong slaps transfer up to the configured penalty', () => {
  const g = game(); play(g); g.decks.a = cards([7, 2, 3]); g.decks.b = cards([4, 4, 4]);
  layCard(g, 'a', 3_000); // count 1, card 7 is not a match
  assert.equal(slap(g, 'b', g.currentCardId, 0, 3_010).status, 'ignored');
  giveVisible(g); layCard(g,'b',3_600);
  assert.equal(slap(g, 'b', g.currentCardId - 1, 0, 3_611).status, 'ignored');
  assert.equal(slap(g, 'b', g.currentCardId, 0, 3_612).status, 'ignored');
  giveVisible(g);
  const result = slap(g, 'a', g.currentCardId, 0, 3_613);
  assert.equal(result.status, 'wrong'); assert.equal(result.event?.penalty, 2);
  assert.equal(g.decks.a.length, 0); assert.equal(g.decks.b.length, 4);
});

test('slap rate limit and lockout reject repeated wrong slaps', () => {
  const g = game(); play(g); g.decks.a = cards([8,8,8,8,8,8,8,8]); g.decks.b = cards([1]);
  layCard(g, 'a', 3_000); giveVisible(g);
  for (let i=0;i<6;i++) { g.decks.b = cards([1]); assert.equal(slap(g,'b',g.currentCardId,0,3_100+i).status,'wrong'); g.slapLockouts.b=0; }
  g.decks.b = cards([1]); assert.equal(slap(g,'b',g.currentCardId,0,3_110).status,'ignored');
});

test('a last-card match keeps its full window before the empty player loses', () => {
  const g = createGame('a','b','a','quick',{ ...settings, pace: 800 },1,{},0); play(g); g.decks.a = cards([1]); g.decks.b = [];
  layCard(g, 'a', 3_000); assert.equal(g.phase, 'playing');
  assert.equal(layCard(g,'b',3_800).changed,true); assert.equal(g.phase,'playing');
  const expired = resolveWindow(g, 6_000); assert.equal(expired.changed, true);
  assert.equal(g.phase, 'matchOver'); assert.equal(g.roundWinner, 'a');
});

test('manual-turn lay interval is at least 600ms', () => {
  const g = game(); play(g); g.decks.a = cards([5,5]); g.decks.b = cards([5]);
  assert.equal(layCard(g,'a',3_000).changed,true);
  assert.ok(layCard(g,'b',3_599).error);
  assert.equal(layCard(g,'b',3_600).changed,true);
});

test('pausing and resuming preserves remaining countdown time', () => {
  const g = game(); pauseTimers(g, 1_000); assert.equal(g.paused, true);
  assert.equal(getViewFor(g,'a',1_000).remainingMs,2_000);
  resumeTimers(g, 50_000); assert.equal(g.readyDeadline,52_000); assert.equal(g.paused,false);
});

test('hidden deck differences do not change either player view', () => {
  const left = game(); const right = game();
  left.decks.a = cards([1,2,3,4]); left.decks.b = cards([7,8,9,10]);
  right.decks.a = cards([1,2,3,4]); right.decks.b = cards([2,3,4,5], 'star');
  for (const player of ['a','b']) assert.deepEqual(getViewFor(left,player,1_000),getViewFor(right,player,1_000));
  play(left); play(right);
  layCard(left,'a',3_000); layCard(right,'a',3_000);
  for (const player of ['a','b']) assert.deepEqual(getViewFor(left,player,3_000),getViewFor(right,player,3_000));
});

test('randomized full games always terminate within the 300-card safety cap', () => {
  for (let run=0; run<30; run++) {
    const g = game(); play(g); let now = 3_000; let guard = 0;
    while (g.phase !== 'roundOver' && g.phase !== 'matchOver' && guard++ < 700) {
      if (g.phase === 'resolving') { completeResolve(g,g.resolveDeadline); now=g.resolveDeadline; continue; }
      if (g.decisionPending) { resolveWindow(g,g.decisionDeadline); continue; }
      if (g.matchWindowOpen) { resolveWindow(g,g.matchWindowDeadline); continue; }
      const result = layCard(g,g.turn,Math.max(now,g.lastLayAt+600));
      now = Math.max(now,g.lastLayAt) + 600;
      if (result.cardLaid) {
        giveVisible(g);
        if (g.currentCardMatched && Math.random()<0.8) {
          const player = Math.random()<0.5?'a':'b'; slap(g,player,g.currentCardId,0,now+5);
          resolveWindow(g,now+155);
        }
      }
    }
    assert.ok(guard < 700,`game ${run} did not terminate`);
    assert.ok(g.phase === 'roundOver' || g.phase === 'matchOver');
    assert.ok(!g.matchWinner || !g.draw);
    assert.ok(g.laidCards <= 300);
  }
});
