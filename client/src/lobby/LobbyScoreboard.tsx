import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameId, PlayerSummary, Scoreboard as ScoreData } from '@arcade/shared';
import { Doodle } from '../doodles/Doodle';
import { playerDoodleId } from '../doodles/playerDoodle';
import { gameRegistry } from './games.config';
import { TicketIllustration } from './TicketIllustration';

type Props = { players: PlayerSummary[]; self: string; scores: ScoreData; sameSweetMoments: number };
export function LobbyScoreboard(props: Props) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="scores-mobile-trigger" onClick={() => setOpen(true)}>♡ Scores</button>
    <aside className="lobby-scoreboard"><ScoreboardPanel {...props}/></aside>
    {open && createPortal(<div className="scores-sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section className="scores-sheet" role="dialog" aria-modal="true" aria-label="Our scoreboard"><button className="scores-sheet-close" onClick={() => setOpen(false)} aria-label="Close scores">×</button><ScoreboardPanel {...props}/></section></div>, document.body)}
  </>;
}

function ScoreboardPanel({ players, self, scores, sameSweetMoments }: Props) {
  const mine = players.find(player => player.id === self);
  const partner = players.find(player => player.id !== self);
  const rows: Array<{ game: GameId; id: string }> = [
    { game: 'hangman', id: 'hangman' }, { game: 'cups', id: 'cups' }, { game: 'poison', id: 'poison' }, { game: 'cloud', id: 'cloud' }, { game: 'slapcount', id: 'slapcount' }, { game: 'surprise', id: 'surprise' },
  ];
  return <section className="lobby-scoreboard-board" aria-labelledby="lobby-score-title">
    <div className="scoreboard-title"><span className="eyebrow">OUR LITTLE CHALKBOARD</span><h2 id="lobby-score-title">Wins together <span>✦</span></h2></div>
    <div className="scoreboard-columns"><span>Games</span><div><Doodle id={playerDoodleId(players, mine)} size={56} crop name={mine?.name}/><b>{mine?.name ?? 'you'}</b></div><div><Doodle id={playerDoodleId(players, partner)} size={56} crop name={partner?.name}/><b>{partner?.name ?? 'partner'}</b></div></div>
    <div className="scoreboard-rows">{rows.map(({ game, id }) => {
      const config = gameRegistry.find(item => item.id === id)!;
      const myWins = scores[game]?.[self] ?? 0;
      const partnerWins = partner ? scores[game]?.[partner.id] ?? 0 : 0;
      return <div className="scoreboard-row" key={game}><div className="scoreboard-game"><TicketIllustration className={`score-icon art-${id}`}/><span>{config.title}</span></div><Tally wins={myWins}/><Tally wins={partnerWins}/></div>;
    })}</div>
    <div className="scoreboard-sweet-count"><span aria-hidden="true">♡</span><b>{sameSweetMoments}</b><span>same-sweet moments</span></div>
  </section>;
}

function Tally({ wins }: { wins: number }) {
  const groups = Math.floor(wins / 5), remainder = wins % 5;
  return <div className="scoreboard-tally" aria-label={`${wins} ${wins === 1 ? 'win' : 'wins'}`}><span aria-hidden="true">{Array.from({ length: groups }, (_, i) => <i className="tally-group" key={i}><b/><b/><b/><b/><em/></i>)}{remainder > 0 && <i className="tally-group partial">{Array.from({ length: remainder }, (_, i) => <b key={i}/>)}</i>}</span><small>{wins}</small></div>;
}
