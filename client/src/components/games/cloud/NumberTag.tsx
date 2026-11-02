import type { CSSProperties } from 'react';
import type { CloudPosition } from '@arcade/shared';
import { cloudColors } from './cloudConfig';

export function NumberTag({ item, fontSize, highlighted, found, stagger, onChoose }: {
  item: CloudPosition; fontSize: number; highlighted: boolean; found: boolean; stagger: number; onChoose: (n: number) => void;
}) {
  const style = {
    left: item.x,
    top: item.y,
    color: cloudColors[item.colorIndex % cloudColors.length],
    fontSize,
    transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
    '--cloud-in-delay': `${stagger}ms`,
  } as CSSProperties;
  return <button type="button" className={`cloud-number ${highlighted ? 'called' : ''} ${found ? 'found' : ''}`} style={style} aria-label={String(item.n)} onClick={() => onChoose(item.n)}>{item.n}</button>;
}
