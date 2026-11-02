export const skyKeyframes = [
  { minute: 0, top: '#0b0a1f', middle: '#15123a', horizon: '#2a1f4d', stars: 1 },
  { minute: 270, top: '#15123a', middle: '#3a2a6b', horizon: '#8a4f86', stars: .6 },
  { minute: 360, top: '#2f2d6b', middle: '#d9809a', horizon: '#ffc27a', stars: .25 },
  { minute: 510, top: '#2b3f6b', middle: '#5f7fb0', horizon: '#f3cfa6', stars: .05 },
  { minute: 780, top: '#2a3d68', middle: '#4f6fa0', horizon: '#cfd9d8', stars: .05 },
  { minute: 990, top: '#3a3770', middle: '#c4627a', horizon: '#ffb36b', stars: .25 },
  { minute: 1125, top: '#221f4f', middle: '#5a3a7e', horizon: '#e0769a', stars: .6 },
  { minute: 1230, top: '#12102a', middle: '#1d1844', horizon: '#3a2a6b', stars: 1 },
  { minute: 1440, top: '#0b0a1f', middle: '#15123a', horizon: '#2a1f4d', stars: 1 },
] as const;

export const sceneConfig = {
  starSeed: 271828,
  starCount: 140,
  animatedStarCount: 20,
  doodlePlacement: { left: 14, right: 86, baseline: 92 },
  copy: {
    timeDifference: (name: string, amount: string) => `${name} is ${amount} ahead`,
    pickerTitle: 'Pick your doodle',
    wish: 'made a wish',
  },
} as const;
