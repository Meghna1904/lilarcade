import { skyKeyframes, sceneConfig } from './config';

export type SkyPalette = { top: string; middle: string; horizon: string; stars: number };

function parseHex(hex: string) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
function mixColor(a: string, b: string, t: number) {
  const aa = parseHex(a), bb = parseHex(b);
  return `#${aa.map((v, i) => Math.round(v + (bb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function interpolateSky(minute: number): SkyPalette {
  const time = ((minute % 1440) + 1440) % 1440;
  const nextIndex = skyKeyframes.findIndex(frame => frame.minute >= time);
  const right = skyKeyframes[Math.max(1, nextIndex)];
  const left = skyKeyframes[Math.max(0, nextIndex - 1)];
  const amount = right.minute === left.minute ? 0 : (time - left.minute) / (right.minute - left.minute);
  if (amount === 0) return { top: left.top, middle: left.middle, horizon: left.horizon, stars: left.stars };
  if (amount === 1) return { top: right.top, middle: right.middle, horizon: right.horizon, stars: right.stars };
  return {
    top: mixColor(left.top, right.top, amount),
    middle: mixColor(left.middle, right.middle, amount),
    horizon: mixColor(left.horizon, right.horizon, amount),
    stars: left.stars + (right.stars - left.stars) * amount,
  };
}

export function minutesInZone(date = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

// Meeus' compact phase approximation; 0=new moon, .5=full moon.
export function lunarPhase(date = new Date()) {
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMonth = 29.530588853 * 24 * 60 * 60 * 1000;
  return (((date.getTime() - knownNewMoon) / synodicMonth) % 1 + 1) % 1;
}

export function seededStars(count = sceneConfig.starCount, seed = sceneConfig.starSeed) {
  let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
  return Array.from({ length: count }, (_, index) => ({
    left: random() * 100,
    top: 5 + random() * 76,
    size: .7 + random() * (index < 24 ? 1.7 : 1.1),
    layer: index < 64 ? 1 : index < 116 ? 2 : 3,
    delay: random() * -24,
    duration: 120 + random() * 80,
    sparkle: random() > .82,
  }));
}

export function testTimeOverride(search = typeof window === 'undefined' ? '' : window.location.search, dev = import.meta.env?.DEV ?? false) {
  if (!dev) return undefined;
  const raw = new URLSearchParams(search).get('time');
  if (!raw || !/^\d{2}:\d{2}$/.test(raw)) return undefined;
  const [hours, minutes] = raw.split(':').map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : undefined;
}
