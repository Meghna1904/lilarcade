import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolateSky, lunarPhase, minutesInZone, seededStars, testTimeOverride } from './SkyEngine.ts';
import { skyKeyframes, sceneConfig } from './config.ts';

test('palette interpolation returns every configured keyframe exactly', () => {
  for (const frame of skyKeyframes) assert.deepEqual(interpolateSky(frame.minute), { top: frame.top, middle: frame.middle, horizon: frame.horizon, stars: frame.stars });
});

test('palette wraps continuously at midnight', () => {
  assert.deepEqual(interpolateSky(1440), interpolateSky(0));
  assert.deepEqual(interpolateSky(-1), interpolateSky(1439));
});

test('local minutes use the requested IANA timezone', () => {
  const instant = new Date('2024-01-01T00:00:00.000Z');
  assert.equal(minutesInZone(instant, 'America/New_York'), 19 * 60);
  assert.equal(minutesInZone(instant, 'Asia/Kolkata'), 5 * 60 + 30);
  assert.equal(minutesInZone(instant, 'Pacific/Auckland'), 13 * 60);
});

test('lunar phase is near new and full moon on known dates', () => {
  const newMoon = lunarPhase(new Date('2024-04-08T18:21:00.000Z'));
  assert.ok(Math.min(newMoon, 1 - newMoon) < .03);
  assert.ok(Math.abs(lunarPhase(new Date('2024-04-23T23:49:00.000Z')) - .5) < .03);
});

test('star positions are deterministic and bounded by config', () => {
  assert.deepEqual(seededStars(), seededStars());
  assert.equal(seededStars().length, sceneConfig.starCount);
});

test('manual time override parses only in development mode', () => {
  assert.equal(testTimeOverride('?time=22:30', true), 22 * 60 + 30);
  assert.equal(testTimeOverride('?time=25:90', true), undefined);
  assert.equal(testTimeOverride('?time=06:10', false), undefined);
});
