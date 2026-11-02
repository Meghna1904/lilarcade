import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { CelestialBody } from './CelestialBody';
import { Clouds } from './Clouds';
import { interpolateSky, minutesInZone, testTimeOverride } from './SkyEngine';
import { Rooftop } from './Rooftop';
import { Skyline } from './Skyline';
import { Stars } from './Stars';
import './scene.css';

const skyKey = 'little-arcade-sky-mode';
const skyTimeKey = 'little-arcade-sky-time';
const shareKey = 'little-arcade-share-sky';
const motionKey = 'little-arcade-animations';
function currentTime() { const date = new Date(); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }

export function Scene({ rooftop = true }: { rooftop?: boolean }) {
  const [minute, setMinute] = useState(() => testTimeOverride() ?? minutesInZone());
  const [mode, setMode] = useState<'auto' | 'night' | 'pick'>(() => (localStorage.getItem(skyKey) as 'auto'|'night'|'pick') || 'auto');
  const [pickedTime, setPickedTime] = useState(() => localStorage.getItem(skyTimeKey) || currentTime());
  const [visible, setVisible] = useState(() => !document.hidden);
  const testOverride = testTimeOverride();
  const localPickedMinute = pickedTime.split(':').map(Number).reduce((hour, value, index) => index === 0 ? value * 60 : hour + value, 0);
  const activeMinute = testOverride ?? (mode === 'night' ? 0 : mode === 'pick' ? localPickedMinute : minute);
  useEffect(() => {
    if (testOverride !== undefined) return;
    const update = () => setMinute(minutesInZone());
    const timer = window.setInterval(update, 30_000);
    const onVisibility = () => { if (!document.hidden) update(); };
    const onVisibilityState = () => setVisible(!document.hidden);
    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: 'auto'|'night'|'pick'; time?: string }>).detail;
      if (detail.mode) setMode(detail.mode);
      if (detail.time) setPickedTime(detail.time);
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('visibilitychange', onVisibilityState);
    window.addEventListener('little-arcade-sky-settings', onSettings);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('visibilitychange', onVisibilityState); window.removeEventListener('little-arcade-sky-settings', onSettings); };
  }, [testOverride]);
  const palette = useMemo(() => interpolateSky(activeMinute), [activeMinute]);
  return <div className={`arcade-scene${rooftop ? ' with-rooftop' : ''}${activeMinute < 360 || activeMinute >= 1110 ? ' after-sunset' : ''}${visible ? '' : ' is-paused'}`} style={{ '--sky-top': palette.top, '--sky-middle': palette.middle, '--sky-horizon': palette.horizon, '--star-opacity': palette.stars, '--cloud-opacity': palette.stars > .8 ? .08 : palette.stars > .3 ? .24 : .31 } as CSSProperties} aria-hidden="true">
    <div className="scene-sky"/><Stars/><CelestialBody minute={activeMinute}/><Clouds/><Skyline minute={activeMinute}/>{rooftop && <Rooftop night={activeMinute < 360 || activeMinute > 1110}/>}<div className="scene-grain"/>
  </div>;
}

export function SceneSettings({ muted, onMute, onShareSkyChange }: { muted: boolean; onMute: () => void; onShareSkyChange?: (share: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'auto'|'night'|'pick'>(() => (localStorage.getItem(skyKey) as 'auto'|'night'|'pick') || 'auto');
  const [time, setTime] = useState(() => localStorage.getItem(skyTimeKey) || currentTime());
  const [share, setShare] = useState(() => localStorage.getItem(shareKey) !== 'false');
  const [animations, setAnimations] = useState<'full'|'reduced'>(() => localStorage.getItem(motionKey) === 'reduced' ? 'reduced' : 'full');
  useEffect(() => { document.documentElement.dataset.motion = animations; return () => { delete document.documentElement.dataset.motion; }; }, [animations]);
  const emit = (detail: object) => window.dispatchEvent(new CustomEvent('little-arcade-sky-settings', { detail }));
  const setSkyMode = (value: 'auto'|'night'|'pick') => { localStorage.setItem(skyKey, value); setMode(value); emit({ mode: value }); };
  const setSkyTime = (value: string) => { setTime(value); localStorage.setItem(skyTimeKey, value); emit({ time: value }); };
  const setSkyShare = (value: boolean) => { setShare(value); localStorage.setItem(shareKey, String(value)); emit({ shareSky: value }); onShareSkyChange?.(value); };
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = document.querySelector<HTMLButtonElement>('.header-settings-trigger');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.querySelector<HTMLElement>('.scene-settings-backdrop .header-settings-popover input, .scene-settings-backdrop .header-settings-popover select')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('.scene-settings-backdrop .header-settings-popover');
      const controls = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')] : [];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; trigger?.focus(); };
  }, [open]);
  return <div className="header-settings"><button type="button" className="header-settings-trigger" aria-label="Settings" aria-expanded={open} onClick={event => { setOpener(event.currentTarget); setOpen(value => !value); }}>⚙</button>{open && createPortal(<div className="scene-settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><div className="header-settings-popover" role="dialog" aria-modal="true" aria-label="Arcade settings">
    <b>Our little settings</b><strong>Sky</strong>{(['auto','night','pick'] as const).map(value => <label key={value}><input type="radio" name="sky-mode" checked={mode === value} onChange={() => setSkyMode(value)}/>{value === 'auto' ? 'Auto' : value === 'night' ? 'Always night' : 'Pick a time'}</label>)}
    {mode === 'pick' && <label className="scene-time-setting">Time <input type="time" value={time} onChange={event => setSkyTime(event.target.value)}/></label>}
    <label className="scene-share-setting"><input type="checkbox" checked={share} onChange={event => setSkyShare(event.target.checked)}/>Share my sky</label>
    <label className="header-setting-toggle"><span>Sound</span><input type="checkbox" checked={!muted} onChange={onMute}/></label>
    <label className="header-setting-toggle"><span>Animations</span><select value={animations} onChange={event => { const value = event.target.value as 'full'|'reduced'; setAnimations(value); localStorage.setItem(motionKey, value); }}><option value="full">Full</option><option value="reduced">Reduced</option></select></label>
  <button className="settings-done" type="button" onClick={() => { setOpen(false); opener?.focus(); }}>Done</button></div></div>, document.body)}</div>;
}
