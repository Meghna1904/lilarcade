import { sceneConfig } from './config';
import { seededStars } from './SkyEngine';
import type { CSSProperties } from 'react';

const stars = seededStars();
export function Stars() {
  return <div className="scene-stars" aria-hidden="true">{stars.map((star, index) => <i key={index} className={`scene-star layer-${star.layer}${star.sparkle ? ' sparkle' : ''}${index < sceneConfig.animatedStarCount ? ' twinkle' : ''}`} style={{ left: `${star.left}%`, top: `${star.top}%`, '--star-size': `${star.size}px`, '--star-delay': `${star.delay}s`, '--star-duration': `${star.duration}s` } as CSSProperties} />)}</div>;
}
