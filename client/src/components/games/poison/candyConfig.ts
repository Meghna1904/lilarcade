export type CandyShape = 'wrapped' | 'lollipop' | 'gummy' | 'jellyBean' | 'striped' | 'heart' | 'star' | 'peppermint' | 'chocolate' | 'gumdrop';
export type CandyDefinition = { shape: CandyShape; name: string; color: string; light: string; dark: string; stripe: string };

const shapes: Array<{ shape: CandyShape; name: string }> = [
  { shape: 'wrapped', name: 'wrapped sweet' }, { shape: 'lollipop', name: 'lollipop' },
  { shape: 'gummy', name: 'gummy bear' }, { shape: 'jellyBean', name: 'jelly bean' },
  { shape: 'striped', name: 'striped sweet' }, { shape: 'heart', name: 'heart candy' },
  { shape: 'star', name: 'star candy' }, { shape: 'peppermint', name: 'swirl peppermint' },
  { shape: 'chocolate', name: 'chocolate square' }, { shape: 'gumdrop', name: 'gumdrop' },
];

export const candyPalette = [
  { color: '#f68ca1', light: '#ffd5dc', dark: '#b94365', stripe: '#fff0b3' },
  { color: '#f5a34c', light: '#ffe0ae', dark: '#b85b35', stripe: '#fff3d2' },
  { color: '#edcf62', light: '#fff2aa', dark: '#a78732', stripe: '#fff9d9' },
  { color: '#76c99f', light: '#c5f5d9', dark: '#367b64', stripe: '#fff0b3' },
  { color: '#69bbd2', light: '#c4f3f7', dark: '#387895', stripe: '#fff3d2' },
  { color: '#9990db', light: '#e1dcff', dark: '#5d57a0', stripe: '#fff0b3' },
  { color: '#d883c0', light: '#f9d5ee', dark: '#914e87', stripe: '#fff8d9' },
  { color: '#a9c85c', light: '#e5f3a9', dark: '#69823c', stripe: '#fff4d0' },
  { color: '#a96955', light: '#e6b79a', dark: '#673d3c', stripe: '#fff0bd' },
  { color: '#67a9e6', light: '#c7e4ff', dark: '#4668aa', stripe: '#fff3cd' },
];

export const candyLines = {
  yourTurn: ['your turn', 'pick a sweet', 'choose wisely'],
  safe: ['sweet.', 'nice taste.', 'all sugar, no trouble.'],
  poison: ['poisoned.', 'a sour surprise.', 'oh, that one.'],
  thoughts: ["i'd skip the red one. or would i.", 'every sweet looks innocent.', 'trust your taste buds. maybe.'],
  sweetTie: [
    { headline: 'You both picked the same sweet 💗', subline: 'great compatibility hehe' },
    { headline: 'Same sweet, same heart 💗', subline: 'you two are suspiciously in sync' },
    { headline: 'A perfect sweet match 💗', subline: 'great minds pick alike' },
  ],
} as const;

/** Stable by tile index and board size; adjacent cells never share a shape. */
export function candyForTile(index: number, gridSize: number): CandyDefinition {
  const shapeIndex = index % shapes.length;
  const colorIndex = (index * 3 + Math.floor(index / shapes.length) * 7 + gridSize * 2) % candyPalette.length;
  const palette = candyPalette[colorIndex % candyPalette.length];
  return { ...shapes[shapeIndex], ...palette };
}
