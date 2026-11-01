import type { HangmanView } from '@arcade/shared';
export default function SetterStrip({ word }: { word: HangmanView['ownWord'] }) {
  return <div className="setter-strip"><span>YOUR WORD</span><strong>{word || 'Waiting for your word…'}</strong></div>;
}
