import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DoodleManifestEntry } from './manifest';
import { loadDoodleManifest } from './manifest';
import { Doodle } from './Doodle';
import { sceneConfig } from '../scene/config';

const choiceKey = 'little-arcade-doodle';
export const savedDoodleId = () => { try { const saved = localStorage.getItem(choiceKey); return saved === 'her' || saved === 'him' ? saved : undefined; } catch { return undefined; } };
export function DoodlePicker({ onClose, onChoose, selectedId, partnerId = 'him', myName = 'you', partnerName = 'partner' }: { onClose: () => void; onChoose: (id: string) => void; selectedId: string; partnerId?: string; myName?: string; partnerName?: string }) {
  const [items, setItems] = useState<DoodleManifestEntry[]>([]);
  const [selected, setSelected] = useState(selectedId);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const dialogRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement|null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const priorOverflow = document.body.style.overflow;
    const priorPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    loadDoodleManifest().then(items => setItems(items.filter(item => item.format === 'webp'))).catch(() => {});
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),[role="radio"]')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = priorOverflow; document.body.style.paddingRight = priorPadding; document.removeEventListener('keydown', onKeyDown); openerRef.current?.focus(); };
  }, []);
  const finish = () => { try { localStorage.setItem(choiceKey, selectedRef.current); } catch { /* selection still applies in this session */ } onChoose(selectedRef.current); onClose(); };
  const contents = <div className="doodle-picker-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) finish(); }}><section className="doodle-picker" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="doodle-picker-title">
    <div className="doodle-picker-heading"><div><span className="eyebrow">OUR LITTLE ROOFTOP</span><h2 id="doodle-picker-title">{sceneConfig.copy.pickerTitle}</h2></div><button type="button" className="doodle-picker-close" onClick={finish} aria-label="Close doodle picker">×</button></div>
    <div className="doodle-preview-roof"><i aria-hidden="true">✦ · · · · · ✧</i><div className="doodle-preview-pair"><div><Doodle id={selected} size={76} name={myName}/><small>{myName}</small></div><span aria-hidden="true">♡</span><div><Doodle id={partnerId} size={76} name={partnerName}/><small>{partnerName}</small></div></div></div>
    <div className="doodle-picker-grid" role="radiogroup" aria-label="Choose your doodle">{items.map(item => <button type="button" role="radio" aria-checked={selected === item.id} key={item.id} className={`doodle-choice${selected === item.id ? ' chosen' : ''}`} onClick={() => setSelected(item.id)}><Doodle id={item.id} size={64} name={item.displayName}/><b>{item.displayName}</b>{selected === item.id && <span className="doodle-choice-check" aria-hidden="true">✓</span>}</button>)}</div>
    <div className="doodle-picker-actions"><button type="button" className="doodle-upload-soon" disabled aria-describedby="doodle-upload-note">Upload my own <small id="doodle-upload-note">soon</small></button><button type="button" className="button primary doodle-done" onClick={finish}>Done <span>♡</span></button></div>
  </section></div>;
  return createPortal(contents, document.body);
}
