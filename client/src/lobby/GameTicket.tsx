import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { defaultSettings, type GameSetting, type GameTicketConfig } from './games.config';

type SettingValues = Record<string, string|number|boolean>;
const readStorage = <T,>(key: string, fallback: T): T => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const writeStorage = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ } };

export function GameTicket({ config, canPlay, onLaunch }: { config: GameTicketConfig; canPlay: boolean; onLaunch: (format: string, settings: SettingValues) => void }) {
  const defaultFormat = config.formats[0] ?? 'quick';
  const [format, setFormat] = useState<string>(() => readStorage(`arcade-format-${config.id}`, defaultFormat));
  const [settings, setSettings] = useState<SettingValues>(() => ({ ...defaultSettings(config), ...readStorage(`arcade-settings-${config.id}`, {}) }));
  const [tweakOpen, setTweakOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const tweakRef = useRef<HTMLButtonElement>(null);
  const closeTweak = useCallback(() => setTweakOpen(false), []);
  const artName = `art-${config.id}`;
  const settingSummary = useMemo(() => config.settings.filter(field => settings[field.id] !== field.default).map(field => {
    const value = settings[field.id];
    if (field.type === 'checkbox') return value ? field.label.toLowerCase() : '';
    return `${field.label.toLowerCase()} ${field.options?.find(option => option.value === value)?.label ?? value}`;
  }).filter(Boolean), [config.settings, settings]);
  const chooseFormat = (value: string) => { setFormat(value); writeStorage(`arcade-format-${config.id}`, value); };
  const update = (id: string, value: string|number|boolean) => setSettings(current => { const next = { ...current, [id]: value }; writeStorage(`arcade-settings-${config.id}`, next); return next; });
  const openTweak = () => {
    if (!tweakRef.current) return;
    const rect = tweakRef.current.getBoundingClientRect();
    setAnchor({ top: Math.min(rect.bottom + 5, window.innerHeight - 360), left: Math.max(12, Math.min(rect.right - 300, window.innerWidth - 312)) });
    setTweakOpen(true);
  };
  const ticketNumber = ['hangman','cups','poison','cloud','slapcount','familyfeud','hotbomb','rps'].indexOf(config.id) + 1;
  return <div className="ticket-wrap" style={{ '--ticket-accent': config.accent, '--ticket-tilt': `${(config.id.length % 2 ? -1 : 1) * (config.id === 'hangman' ? .7 : .35)}deg`, '--ticket-index': String(ticketNumber).padStart(2, '0') } as React.CSSProperties}>
    <article className="game-ticket" aria-labelledby={`ticket-${config.id}-title`}>
      {config.image ? <img className="ticket-art-image" src={config.image} alt=""/> : <div className="ticket-art"><config.art className={artName}/><span className="ticket-number">No. {String(ticketNumber).padStart(2, '0')}</span><i className="ticket-tape"/></div>}
      <div className="ticket-info"><span className="ticket-tag">{config.tagline}</span><h3 id={`ticket-${config.id}-title`}>{config.title}</h3><p>{config.description}</p><div className="ticket-chips"><span>{config.duration ?? '~5 min'}</span>{settingSummary.map(label => <span key={label}>{label}</span>)}</div>
        <div className="ticket-actions">
          {config.formats.length > 0 && <div className="ticket-formats" role="radiogroup" aria-label={`${config.title} match format`}>{config.formats.map(value => <button type="button" role="radio" aria-checked={format === value} className={format === value ? 'selected' : ''} key={value} onClick={() => chooseFormat(value)}>{value === 'quick' ? 'Quick' : value === 'bestOf3' ? 'Best of 3' : 'Best of 5'}</button>)}</div>}
          {config.settings.length > 0 && <button type="button" className="ticket-tweak" aria-label={`Tweak ${config.title} settings`} aria-expanded={tweakOpen} ref={tweakRef} onClick={openTweak}>☷</button>}
          <button type="button" className="ticket-play" disabled={!canPlay} title={!canPlay ? 'Both players need to be connected to start a game.' : undefined} onClick={() => onLaunch(format, settings)}>{!canPlay ? 'Wait' : 'Play'}{canPlay && <span aria-hidden="true">→</span>}</button>
        </div>
      </div>
    </article>
    {tweakOpen && createPortal(<TweakPanel config={config} settings={settings} anchor={anchor} opener={tweakRef.current} onChange={update} onClose={closeTweak}/>, document.body)}
  </div>;
}

function TweakPanel({ config, settings, anchor, opener, onChange, onClose }: { config: GameTicketConfig; settings: SettingValues; anchor: { top: number; left: number }; opener: HTMLButtonElement|null; onChange: (id: string, value: string|number|boolean) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector<HTMLElement>('select,input,button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),select,input')];
      if (!controls.length) return;
      const first = controls[0], last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); opener?.focus(); };
  }, [onClose, opener]);
  const reset = () => { const defaults = defaultSettings(config); for (const [key, value] of Object.entries(defaults)) onChange(key, value); };
  return <div className="ticket-tweak-layer" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="ticket-tweak-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${config.title} settings`} style={{ top: anchor.top, left: anchor.left }}>
    <div className="ticket-tweak-heading"><b>Tweak {config.title}</b><button type="button" onClick={onClose} aria-label="Close settings">×</button></div>
    <div className="ticket-settings-fields">{config.settings.map((field: GameSetting) => <label key={field.id} className={field.type === 'checkbox' ? 'ticket-check-field' : ''}><span>{field.label}</span>{field.type === 'select' ? <select value={String(settings[field.id])} onChange={event => { const option = field.options?.find(item => String(item.value) === event.target.value); if (option) onChange(field.id, option.value); }}>{field.options?.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select> : <input type="checkbox" checked={Boolean(settings[field.id])} onChange={event => onChange(field.id, event.target.checked)}/>}</label>)}</div>
    <button type="button" className="ticket-reset" onClick={reset}>Reset to defaults</button>
  </div></div>;
}
