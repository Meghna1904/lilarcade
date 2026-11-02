import { lunarPhase } from './SkyEngine';
import type { CSSProperties } from 'react';

export function CelestialBody({ minute }: { minute: number }) {
  const isSun = minute >= 360 && minute < 1110;
  const progress = isSun ? (minute - 360) / 750 : ((minute - 1110 + 1440) % 1440) / 690;
  const x = 12 + Math.max(0, Math.min(1, progress)) * 76;
  const y = 34 - Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * 22;
  const phase = lunarPhase();
  const waxing = phase < .5;
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const offset = (1 - illumination) * (waxing ? -22 : 22);
  return <svg className={`scene-celestial ${isSun ? 'sun' : 'moon'}`} style={{ left: `${x}%`, top: `${y}%` } as CSSProperties} viewBox="0 0 64 64" aria-hidden="true">
    {isSun ? <><circle cx="32" cy="32" r="18" className="scene-sun-halo"/><circle cx="32" cy="32" r="12" className="scene-sun-disc"/><path d="M32 3v7m0 44v7M3 32h7m44 0h7M11.5 11.5l5 5m31 31 5 5m0-41-5 5m-31 31-5 5" className="scene-sun-rays"/></>
      : <><circle cx="32" cy="32" r="19" className="scene-moon-shadow"/><circle cx="32" cy="32" r="17" className="scene-moon-disc"/><circle cx={32 + offset} cy="28" r="16" className="scene-moon-cut"/><circle cx="24" cy="24" r="1.3" className="scene-moon-crater"/><circle cx="40" cy="38" r="1.8" className="scene-moon-crater"/></>}
  </svg>;
}
