import type { SlapCard } from '@arcade/shared';
import { Card } from './Card';

export function Pile({ cards, pileSize, onSlap, canSlap, cardId }: { cards: SlapCard[]; pileSize: number; onSlap: () => void; canSlap: boolean; cardId: number }) {
  return <button type="button" className={`slap-pile ${canSlap ? 'ready' : ''}`} disabled={!canSlap} onClick={onSlap} aria-label={canSlap ? `Slap pile on card ${cardId}` : 'Shared card pile'}>
    <span className="slap-pile-count">PILE · {pileSize}</span>
    <span className="slap-pile-cards">{cards.length ? cards.map((card, index) => <span key={`${cardId - cards.length + index + 1}`} className={`slap-fan-card fan-${index}`}><Card value={card.value} suit={card.suit} small /></span>) : <span className="slap-empty-pile">lay the first card</span>}</span>
  </button>;
}
