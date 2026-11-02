import { useCallback, useEffect, useRef, useState } from 'react';

export type CandySound = 'tap' | 'select' | 'safe' | 'poison' | 'lock' | 'reveal' | 'win' | 'lose' | 'aww';
const muteKey = 'little-arcade-candy-muted';

export function useCandyAudio() {
  const context = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const unlocked = useRef(false);
  const [muted, setMuted] = useState(() => localStorage.getItem(muteKey) === 'true');
  mutedRef.current = muted;

  const unlock = useCallback(async () => {
    try {
      const AudioContextClass = window.AudioContext;
      if (!context.current && AudioContextClass) context.current = new AudioContextClass();
      if (context.current?.state === 'suspended') await context.current.resume();
      unlocked.current = !!context.current && context.current.state === 'running';
    } catch { /* Audio stays silent if this browser blocks Web Audio. */ }
  }, []);

  const play = useCallback((sound: CandySound) => {
    if (mutedRef.current) return;
    void unlock().then(() => {
      const ctx = context.current;
      if (!ctx || !unlocked.current || mutedRef.current) return;
      const now = ctx.currentTime + 0.012;
      const tone = (frequency: number, at: number, duration: number, wave: OscillatorType = 'sine', volume = 0.08, to?: number) => {
        const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
        oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, at);
        if (to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + duration);
        gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration + 0.02);
      };
      const rustle = (at: number, duration: number, volume: number) => {
        const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate); const channel = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
        const source = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
        source.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 1100; filter.Q.value = .8;
        gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start(at); source.stop(at + duration);
      };
      switch (sound) {
        case 'tap': tone(500, now, .055, 'sine', .045, 380); break;
        case 'select': tone(570, now, .08, 'sine', .045); tone(810, now + .065, .11, 'sine', .04); break;
        case 'safe': rustle(now, .18, .035); tone(523.25, now + .08, .22, 'sine', .055); tone(659.25, now + .22, .3, 'sine', .05); break;
        case 'poison': tone(125, now, .48, 'triangle', .11, 54); tone(392, now + .46, .27, 'sine', .065, 330); tone(294, now + .72, .38, 'sine', .06, 220); break;
        case 'lock': [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => tone(note, now + i * .07, .19, 'sine', .04)); break;
        case 'reveal': rustle(now, .35, .028); tone(210, now, .38, 'sine', .055, 720); break;
        case 'win': [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((note, i) => tone(note, now + i * .105, .36, 'sine', .055)); break;
        case 'lose': tone(230, now, .7, 'sawtooth', .065, 105); tone(185, now + .58, .3, 'triangle', .05, 150); tone(146.83, now + .83, .5, 'triangle', .045, 110); break;
        case 'aww': [1046.5, 1318.5].forEach((note, i) => tone(note, now + i * .19, .48, 'sine', .045)); tone(659.25, now + .36, .62, 'sine', .032); break;
      }
    });
  }, [unlock]);

  const toggleMute = useCallback(() => {
    void unlock();
    setMuted(current => {
      const next = !current;
      mutedRef.current = next;
      localStorage.setItem(muteKey, String(next));
      return next;
    });
  }, [unlock]);

  useEffect(() => () => { void context.current?.close(); context.current = null; }, []);
  return { muted, toggleMute, unlock, play };
}
