import type { CSSProperties, KeyboardEvent } from 'react';
import type { CloudPosition } from '@arcade/shared';
import { cloudColors } from './cloudConfig';

export function NumberTag({ item, fontSize, highlighted, found, stagger, onKeyboardChoose }: {
  item: CloudPosition; fontSize: number; highlighted: boolean; found: boolean; stagger: number; onKeyboardChoose: (n: number) => void;
}) {
  const style = {
    left: item.x,
    top: item.y,
    color: cloudColors[item.colorIndex % cloudColors.length],
    fontSize,
    transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
    '--cloud-in-delay': `${stagger}ms`,
  } as CSSProperties;
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onKeyboardChoose(item.n);
  };
  return <span className={`cloud-number ${highlighted ? 'called' : ''} ${found ? 'found' : ''}`} style={style} role="button" tabIndex={0} aria-label={`Number ${item.n}`} onKeyDown={onKeyDown}>{item.n}</span>;
}
