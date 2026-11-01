import { useState } from 'react';
import type { HangmanSettings } from '@arcade/shared';
import type { ArcadeSocket } from './useHangmanGame';

const validation = (word: string) => {
  if (!word.length) return 'Pick something we would both know 💗';
  if (word.length < 3 || word.length > 25) return 'Keep it between 3 and 25 characters.';
  if (!/^[a-zA-Z ]+$/.test(word)) return 'Just letters and spaces, please.';
  if (!/[a-z]/i.test(word)) return 'Add at least one letter.';
  if (/^ | $| {2}/.test(word)) return 'Use single spaces between words.';
  return '';
};

export default function SetterInput({ socket, settings, disabled }: { socket: ArcadeSocket; settings: HangmanSettings; disabled: boolean }) {
  const [word, setWord] = useState(''); const [hint, setHint] = useState('');
  const error = validation(word);
  const update = (change: Partial<HangmanSettings>) => socket.emit('hangman:setSettings', change);
  return <div className="setup-word"><h2>Choose a secret word</h2><p className="muted">A place, a meal, an in-joke… make it yours.</p>
    <form onSubmit={event => { event.preventDefault(); if (!error && !disabled) socket.emit('hangman:lockWord', { word, hint }); }}>
      <label>Your secret <span className="optional">({word.length}/25)</span><input autoFocus maxLength={25} value={word} onChange={event => setWord(event.target.value)} placeholder="Something they might know…" aria-describedby="word-tip" /></label>
      <small id="word-tip" className={`field-note ${error ? '' : 'valid-note'}`} aria-live="polite">{error || 'Lovely choice. Ready when you are.'}</small>
      <label>A tiny hint <span className="optional">({hint.length}/60 · optional)</span><input maxLength={60} value={hint} onChange={event => setHint(event.target.value.replace(/[\r\n]/g, ' '))} placeholder="A food we love" /></label>
      <div className="hangman-settings"><label>Wrong guesses <select value={settings.maxMistakes} disabled={disabled} onChange={event => update({ maxMistakes: Number(event.target.value) })}>{[5, 6, 7, 8].map(value => <option key={value} value={value}>{value} chances</option>)}</select></label>
        <label className="toggle-setting"><input type="checkbox" checked={settings.allowWordGuess} disabled={disabled} onChange={event => update({ allowWordGuess: event.target.checked })} />Allow whole-word guesses</label>
        <label className="toggle-setting"><input type="checkbox" checked={settings.allowRevealLetter} disabled={disabled} onChange={event => update({ allowRevealLetter: event.target.checked })} />Allow one letter hint (costs a life)</label></div>
      <button className="button primary" type="submit" disabled={disabled || Boolean(error)}>Lock it in <span>♡</span></button>
    </form>
  </div>;
}
