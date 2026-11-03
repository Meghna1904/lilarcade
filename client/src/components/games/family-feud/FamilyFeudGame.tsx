import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, FamilyFeudView, PlayerSummary, ServerToClientEvents } from '@arcade/shared';
import { Doodle } from '../../../doodles/Doodle';
import './family-feud.css';

type Props = { game: FamilyFeudView; self: string; players: PlayerSummary[]; socket: Socket<ServerToClientEvents, ClientToServerEvents> };
export function FamilyFeudGame({ game, self, players, socket }: Props) {
  const [answer, setAnswer] = useState('');
  const [seconds, setSeconds] = useState(15);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const me = players.find(player => player.id === self);
  const otherId = game.players.find(id => id !== self)!;
  const other = players.find(player => player.id === otherId);
  const isHost = game.host === self;
  const submitted = game.submissions[self]?.submitted;
  const revealed = game.phase === 'reveal' || game.phase === 'matchOver';
  useEffect(() => {
    setAnswer(''); setExpanded(null);
  }, [game.round]);
  useEffect(() => {
    if (!game.deadline || game.phase !== 'answering') return;
    const offset = game.serverNow - Date.now();
    const tick = () => setSeconds(Math.max(0, Math.ceil((game.deadline! - (Date.now() + offset)) / 1000)));
    tick(); const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [game.deadline, game.phase, game.serverNow]);
  const total = (id: string) => game.scores[id] ?? 0;
  const names = (id: string) => players.find(player => player.id === id)?.name ?? 'Player';
  const setScore = (target: string, matchIndex: number | null, points: number) => socket.emit('familyfeud:score', { target, matchIndex, points });
  const entry = (target: string) => game.results?.[target];

  return <section className="family-feud-screen">
    <header className="ff-header"><button className="ff-lobby" onClick={() => socket.emit('backToLobby')}>← <span>Arcade</span></button><div className="ff-brand">Family <b>Feud</b><small>JUST US</small></div><span className="ff-host">{isHost ? 'HOST' : `HOST · ${names(game.host)}`}</span></header>
    <div className="ff-shell">
      <div className="ff-playerline"><Player player={me} score={total(self)} label={self === game.host ? 'HOST' : 'PLAYER'}/><div className="ff-versus">♡<small>VS</small></div><Player player={other} score={total(otherId)} label={otherId === game.host ? 'HOST' : 'PLAYER'}/></div>
      {game.phase === 'setup' ? <main className="ff-panel ff-setup">
        <p className="ff-kicker">A LITTLE SURVEY SHOWDOWN</p><h1>Family Feud:<br/><em>Just Us</em></h1><p className="ff-lede">How well can you guess the popular answers?</p>
        <div className="ff-setup-facts"><span><b>{game.totalQuestions}</b> questions in the bank</span><span><b>{game.totalRounds}</b> rounds selected</span></div>
        <div className="ff-rules"><b>How to play</b><p>You both get the same question and 15 seconds to lock in one answer. Then your answers and the survey board appear together. Either of you can match tricky wording and adjust points after the reveal.</p></div>
        <button className="ff-primary" disabled={!isHost} onClick={() => socket.emit('familyfeud:start')}>{isHost ? 'Start game' : 'Waiting for host to start'} <span>→</span></button>
      </main> : game.phase === 'answering' ? <main className="ff-panel ff-question-panel">
        <div className="ff-roundline"><span>ROUND {game.round} / {game.totalRounds}</span><span>{game.submissions[otherId]?.submitted ? `${names(otherId)} locked in` : `Waiting on ${names(otherId)}`}</span></div>
        <div className={`ff-clock ${seconds <= 5 ? 'urgent' : ''}`} aria-label={`${seconds} seconds remaining`}><i style={{ '--timer-angle': `${(15 - seconds) * 24}deg` } as React.CSSProperties}/><b>{seconds}</b><small>SEC</small></div>
        <p className="ff-kicker">WE ASKED THE ROOM…</p><h1 className="ff-question">{game.question}</h1>
        {!submitted ? <form className="ff-answer-form" onSubmit={event => { event.preventDefault(); socket.emit('familyfeud:submit', { answer }); }}><label htmlFor="ff-answer">YOUR ANSWER</label><input id="ff-answer" autoComplete="off" maxLength={120} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="What comes to mind?" disabled={game.paused || seconds === 0}/><button className="ff-primary" disabled={!answer.trim() || game.paused || seconds === 0}>Lock in answer <span>→</span></button></form> : <div className="ff-locked"><span>✓</span><div><b>Answer locked!</b><small>Waiting for your person…</small></div></div>}
        {game.paused && <div className="ff-away">Your person is reconnecting. The shared timer keeps running.</div>}
      </main> : revealed && <main className="ff-panel ff-reveal-panel">
        <div className="ff-roundline"><span>{game.phase === 'matchOver' ? 'FINAL ROUND' : `ROUND ${game.round} REVEAL`}</span><span>{game.phase === 'matchOver' ? 'THAT’S A WRAP' : 'THE BOARD IS YOURS'}</span></div>
        <p className="ff-kicker">{game.question}</p>
        <div className="ff-submissions">{game.players.map((id, index) => { const result = entry(id)!; return <article className={`ff-answer-reveal ${id === self ? 'mine' : ''}`} key={id}><div className="ff-answer-person"><Doodle id={players.find(p => p.id === id)?.doodleId || (index === 0 ? 'her' : 'him')} size={38} crop/><span>{id === self ? 'YOUR ANSWER' : `${names(id).toUpperCase()}’S ANSWER`}</span></div><strong>{result.answer || 'No answer'}</strong><b className="ff-points">+{result.points}</b>{result.suggestedIndex !== null && result.matchIndex === null && <small className="ff-suggestion">Possible match: {game.board?.[result.suggestedIndex]?.text} · {game.board?.[result.suggestedIndex]?.points} pts (not awarded)</small>}<button className="ff-edit-toggle" onClick={() => setExpanded(expanded === id ? null : id)}>{expanded === id ? 'Close editor' : 'Edit / Match Answer'}</button>{expanded === id && <ScoreEditor target={id} name={names(id)} playerNames={Object.fromEntries(players.map(player => [player.id, player.name]))} result={result} board={game.board ?? []} onChange={setScore}/>}</article>; })}</div>
        <div className="ff-board"><div className="ff-board-title"><span>POPULAR ANSWERS</span><small>THE SURVEY SAYS</small></div>{game.board?.map((item, index) => { const matched = game.players.some(id => entry(id)?.matchIndex === index); return <div className={`ff-board-row ${matched ? 'matched' : ''}`} key={`${item.text}-${index}`}><span className="ff-rank">{String(index + 1).padStart(2, '0')}</span><b>{item.text}</b><strong>{item.points}</strong></div>; })}</div>
        <div className="ff-scoreline">{game.players.map(id => <div key={id}><span>{names(id)}<small>THIS ROUND</small></span><b>+{game.roundScores[id] ?? 0}</b><em>{total(id)} total</em></div>)}</div>
        {game.phase === 'matchOver' ? <><div className="ff-winner">{total(game.players[0]) === total(game.players[1]) ? 'A lovely tie!' : `${names(total(game.players[0]) > total(game.players[1]) ? game.players[0] : game.players[1])} takes the board!`} <span>✦</span></div><div className="ff-final-stats"><span><b>{[...game.history, { answers: Object.fromEntries(game.players.map(id => [id, entry(id)?.answer ?? null])) }].filter(round => game.players.some(id => !!round.answers[id])).length}</b> questions answered</span><span><b>{game.history.reduce((sum, round) => sum + game.players.filter(id => round.matched[id]).length, game.players.filter(id => entry(id)?.matchIndex !== null).length)}</b> successful matches</span></div><button className="ff-history-toggle" onClick={() => setHistoryOpen(!historyOpen)}>{historyOpen ? 'Hide' : 'View'} round history</button>{historyOpen && <div className="ff-history">{[...game.history, { question: game.question!, scores: game.roundScores, answers: Object.fromEntries(game.players.map(id => [id, entry(id)?.answer ?? null])), matched: {} }].map((round, index) => <div key={index}><b>Round {index + 1}</b><span>{round.question}</span>{game.players.map(id => <small key={id}>{names(id)}: {round.answers[id] || 'No answer'} · +{round.scores[id] ?? 0}</small>)}</div>)}</div>}<div className="ff-finish-actions"><button className="ff-primary" onClick={() => socket.emit('backToLobby')}>Back to arcade <span>→</span></button><button className="ff-secondary" onClick={() => socket.emit('startGame', { game: 'familyfeud', format: 'quick', familyFeud: { rounds: game.totalRounds } })}>Play again</button></div></> : <div className="ff-next-row"><small>{isHost ? 'Both scores are live for you and your person.' : 'The host will bring you to the next question.'}</small><button className="ff-primary" disabled={!isHost} onClick={() => socket.emit('familyfeud:next')}>{isHost ? 'Next question' : 'Waiting for host'} <span>→</span></button></div>}
      </main>}
    </div>
  </section>;
}

function Player({ player, score, label }: { player?: PlayerSummary; score: number; label: string }) { return <div className="ff-player"><Doodle id={player?.doodleId ?? 'sunny'} size={56} crop name={player?.name}/><span>{player?.name ?? 'Your person'}</span><small>{label}</small><b>{score} pts</b></div>; }

function ScoreEditor({ target, name, playerNames, result, board, onChange }: { target: string; name: string; playerNames: Record<string, string>; result: NonNullable<FamilyFeudView['results']>[string]; board: NonNullable<FamilyFeudView['board']>; onChange: (target: string, matchIndex: number | null, points: number) => void }) {
  const [match, setMatch] = useState(result.matchIndex === null ? 'none' : String(result.matchIndex));
  const [points, setPoints] = useState(String(result.points));
  useEffect(() => { setMatch(result.matchIndex === null ? 'none' : String(result.matchIndex)); setPoints(String(result.points)); }, [result.matchIndex, result.points]);
  const choose = (value: string) => { setMatch(value); const index = value === 'none' ? null : Number(value); setPoints(String(index === null ? 0 : board[index].points)); onChange(target, index, index === null ? 0 : board[index].points); };
  return <div className="ff-editor"><label>Match to<select value={match} onChange={event => choose(event.target.value)}><option value="none">Incorrect / no match</option>{board.map((item, index) => <option key={index} value={index}>{item.text} · {item.points} pts</option>)}</select></label><label>Points awarded<input type="number" min="0" max="10000" value={points} onChange={event => { setPoints(event.target.value); onChange(target, match === 'none' ? null : Number(match), Number(event.target.value)); }}/></label><small>{name} · “{result.answer || 'No answer'}” · original points {result.originalPoints}</small>{result.adjustments.length > 0 && <small>Last edited by {playerNames[result.adjustments.at(-1)!.actor] ?? 'a player'}; {result.adjustments.length} scoring adjustment{result.adjustments.length > 1 ? 's' : ''} recorded</small>}</div>;
}
