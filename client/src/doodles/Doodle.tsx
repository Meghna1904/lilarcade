import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { loadDoodleManifest, type DoodleExpression, type DoodleManifestEntry } from './manifest';

const safeId = (value: string) => /^[a-zA-Z0-9_-]{1,40}$/.test(value) ? value : 'sunny';

function imageLoaded(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Unable to load doodle ${src}`));
    image.src = src;
  });
}

export function Doodle({ id, expression = 'idle', size = 84, flip = false, name, crop = false, className = '' }: {
  id: string;
  expression?: DoodleExpression;
  size?: number | string;
  flip?: boolean;
  name?: string;
  crop?: boolean;
  className?: string;
}) {
  const [entry, setEntry] = useState<DoodleManifestEntry>();
  const [faceSources, setFaceSources] = useState<[string, string]>(['', '']);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const activeSlotRef = useRef<0 | 1>(0);
  const visibleSourceRef = useRef('');
  const cleanId = safeId(id);

  useEffect(() => {
    let active = true;
    setEntry(undefined);
    loadDoodleManifest().then(items => {
      if (active) setEntry(items.find(item => item.id === cleanId) ?? items.find(item => item.id === 'sunny'));
    }).catch(() => {
      if (active) setEntry({ id: 'sunny', displayName: 'Tiny Sprout', expressions: ['idle'] });
    });
    return () => { active = false; };
  }, [cleanId]);

  const isPortrait = entry?.format === 'webp';
  const chosenExpression = entry?.expressions.includes(expression) ? expression : 'idle';
  const requestedSource = entry
    ? isPortrait ? `/doodles/${entry.id}/${chosenExpression}.webp` : `/doodles/${entry.id}/idle.svg`
    : '';
  const stickerFallback = entry?.fallbackId ? `/doodles/${entry.fallbackId}/idle.svg` : '/doodles/sunny/idle.svg';

  useEffect(() => {
    if (!requestedSource) return;
    let active = true;
    let animationFrame = 0;
    const showSource = async () => {
      let resolvedSource = requestedSource;
      try {
        await imageLoaded(requestedSource);
      } catch {
        resolvedSource = stickerFallback;
        try {
          await imageLoaded(resolvedSource);
        } catch {
          resolvedSource = '/doodles/little-star/idle.svg';
          try { await imageLoaded(resolvedSource); } catch { return; }
        }
      }
      if (!active || visibleSourceRef.current === resolvedSource) return;
      const nextSlot = (1 - activeSlotRef.current) as 0 | 1;
      setFaceSources(current => {
        const next = [...current] as [string, string];
        next[nextSlot] = resolvedSource;
        return next;
      });
      animationFrame = window.requestAnimationFrame(() => {
        if (!active) return;
        activeSlotRef.current = nextSlot;
        visibleSourceRef.current = resolvedSource;
        setActiveSlot(nextSlot);
      });
    };
    void showSource();
    return () => { active = false; window.cancelAnimationFrame(animationFrame); };
  }, [requestedSource, stickerFallback]);

  const style = {
    '--doodle-size': typeof size === 'number' ? `${size}px` : size,
    '--doodle-flip': flip ? '-1' : '1',
  } as CSSProperties;
  const alt = name ? `${name}'s doodle` : `${cleanId} doodle`;
  const classes = `doodle-wrap${isPortrait ? ' is-portrait' : ''}${crop ? ' doodle-crop' : ''} mood-${expression}${className ? ` ${className}` : ''}`;

  return <span className={classes} style={style} role="img" aria-label={alt}>
    {faceSources.map((src, slot) => <img
      key={slot}
      className={`doodle-image${slot === activeSlot ? ' active' : ''}${crop ? ' cropped' : ''}`}
      src={src || undefined}
      alt={slot === activeSlot ? alt : ''}
      aria-hidden={slot !== activeSlot}
      draggable={false}
    />)}
    {!isPortrait && expression !== 'idle' && <span className="doodle-mood-fx" aria-hidden="true">{expression === 'happy' ? '♡' : expression === 'sleepy' ? 'z z' : expression === 'sad' ? '☁' : '✦'}</span>}
  </span>;
}
