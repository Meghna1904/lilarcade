import { readFileSync } from 'node:fs';
import type { FamilyFeudView } from '@arcade/shared';

type Answer = { text: string; points: number };
type Question = { question: string; answers: Answer[] };
type BankSet = { name: string; questions: Question[] };
type Entry = { answer: string | null; matchIndex: number | null; suggestedIndex: number | null; points: number; originalPoints: number; adjustments: Array<{ actor: string; from: number | null; to: number | null; points: number; at: number }> };
export type FamilyFeudGame = {
  familyFeud: true; phase: FamilyFeudView['phase']; host: string; players: [string, string]; totalRounds: number; round: number;
  questionIds: number[]; question: Question; startedAt: number; deadline: number;
  submissions: Record<string, { submitted: boolean; answer?: string | null }>;
  scores: Record<string, number>; roundScores: Record<string, number>; results: Record<string, Entry>;
  history: FamilyFeudView['history']; paused: boolean; recordedWinner?: string;
};

const sets = JSON.parse(readFileSync(new URL('../data/family-feud.json', import.meta.url), 'utf8')) as BankSet[];
export const familyFeudQuestions = sets.flatMap(set => set.questions);

function normalize(value: string) { return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' '); }
function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const above = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)); diagonal = above; }
  }
  return row[b.length];
}
function matchAnswer(answer: string | null, answers: Answer[]) {
  if (!answer?.trim()) return { matchIndex: null, suggestedIndex: null, points: 0 };
  const value = normalize(answer);
  for (let i = 0; i < answers.length; i++) {
    const labels = answers[i].text.split('/').map(normalize);
    if (labels.includes(value)) return { matchIndex: i, suggestedIndex: i, points: answers[i].points };
  }
  let suggestion: { index: number; distance: number } | undefined;
  answers.forEach((entry, index) => entry.text.split('/').map(normalize).forEach(label => {
    const distance = value.includes(label) || label.includes(value) ? Math.abs(value.length - label.length) : editDistance(value, label);
    const threshold = Math.max(2, Math.floor(Math.max(value.length, label.length) * 0.28));
    if (distance <= threshold && (!suggestion || distance < suggestion.distance)) suggestion = { index, distance };
  }));
  return { matchIndex: null, suggestedIndex: suggestion?.index ?? null, points: 0 };
}
function reveal(game: FamilyFeudGame) {
  if (game.phase !== 'answering') return;
  for (const id of game.players) {
    const answer = game.submissions[id]?.answer ?? null;
    const match = matchAnswer(answer, game.question.answers);
    game.results[id] = { answer, ...match, originalPoints: match.points, adjustments: [] };
    game.roundScores[id] = match.points;
    game.scores[id] = (game.scores[id] ?? 0) + match.points;
  }
  game.phase = game.round === game.totalRounds ? 'matchOver' : 'reveal';
}
export function createFamilyFeud(host: string, other: string, rounds: number, now = Date.now()): FamilyFeudGame {
  const count = Math.max(1, Math.min(familyFeudQuestions.length, Math.trunc(rounds)));
  const questionIds = familyFeudQuestions.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, count);
  const game: FamilyFeudGame = { familyFeud: true, phase: 'setup', host, players: [host, other], totalRounds: count, round: 1, questionIds, question: familyFeudQuestions[questionIds[0]], startedAt: 0, deadline: 0, submissions: {}, scores: { [host]: 0, [other]: 0 }, roundScores: { [host]: 0, [other]: 0 }, results: {}, history: [], paused: false };
  void now;
  return game;
}
export function startFamilyFeud(game: FamilyFeudGame, player: string, now = Date.now()) {
  if (game.phase !== 'setup' || player !== game.host) return 'Only the host can start this game.';
  game.phase = 'answering'; game.startedAt = now; game.deadline = now + 15_000; return null;
}
export function submitFamilyFeud(game: FamilyFeudGame, player: string, answer: string, now = Date.now()) {
  if (game.phase !== 'answering') return 'Answers are not being collected right now.';
  if (!game.players.includes(player)) return 'You are not in this game.';
  if (now >= game.deadline) { reveal(game); return 'The answer window has closed.'; }
  if (game.submissions[player]?.submitted) return 'Your answer is already locked.';
  game.submissions[player] = { submitted: true, answer: answer.trim().slice(0, 120) || null };
  if (game.players.every(id => game.submissions[id]?.submitted)) reveal(game);
  return null;
}
export function timeoutFamilyFeud(game: FamilyFeudGame, now = Date.now()) {
  if (game.phase !== 'answering' || now < game.deadline) return false;
  for (const id of game.players) if (!game.submissions[id]?.submitted) game.submissions[id] = { submitted: true, answer: null };
  reveal(game); return true;
}
export function scoreFamilyFeud(game: FamilyFeudGame, actor: string, target: string, matchIndex: number | null, points: number, now = Date.now()) {
  if ((game.phase !== 'reveal' && game.phase !== 'matchOver') || !game.players.includes(actor)) return 'Only a player in this game can edit revealed scoring.';
  if (!game.players.includes(target) || !Number.isInteger(points) || points < 0 || points > 10000) return 'Choose a valid player and score.';
  if (matchIndex !== null && (!Number.isInteger(matchIndex) || matchIndex < 0 || matchIndex >= game.question.answers.length)) return 'Choose an answer from the board.';
  const entry = game.results[target]; if (!entry) return 'That answer is not ready to score.';
  const previousMatch = entry.matchIndex;
  entry.adjustments.push({ actor, from: previousMatch, to: matchIndex, points: entry.points, at: now });
  entry.matchIndex = matchIndex; entry.points = points;
  game.roundScores[target] = points;
  game.scores[target] = game.history.reduce((sum, round) => sum + (round.scores[target] ?? 0), points);
  return null;
}
export function nextFamilyFeud(game: FamilyFeudGame, player: string, now = Date.now()) {
  if (game.phase !== 'reveal' || player !== game.host) return 'Only the host can advance after a revealed round.';
  game.history.push({ question: game.question.question, scores: { ...game.roundScores }, answers: Object.fromEntries(game.players.map(id => [id, game.results[id]?.answer ?? null])), matched: Object.fromEntries(game.players.map(id => [id, game.results[id]?.matchIndex !== null])) });
  game.round++;
  game.question = familyFeudQuestions[game.questionIds[game.round - 1]];
  game.submissions = {}; game.results = {}; game.roundScores = Object.fromEntries(game.players.map(id => [id, 0]));
  game.startedAt = now; game.deadline = now + 15_000; game.phase = 'answering'; return null;
}
export function familyFeudView(game: FamilyFeudGame, self: string): FamilyFeudView {
  const revealed = game.phase === 'reveal' || game.phase === 'matchOver';
  const submissions = Object.fromEntries(game.players.map(id => [id, { submitted: !!game.submissions[id]?.submitted, ...(id === self && game.submissions[id]?.submitted ? { answer: game.submissions[id].answer ?? null } : {}) }]));
  return { game: 'familyfeud', phase: game.phase, host: game.host, players: game.players, round: game.round, totalRounds: game.totalRounds, totalQuestions: familyFeudQuestions.length,
    ...(game.phase !== 'setup' ? { question: game.question.question, startedAt: game.startedAt, deadline: game.deadline } : {}), serverNow: Date.now(), paused: game.paused, submissions,
    scores: { ...game.scores }, roundScores: { ...game.roundScores }, ...(revealed ? { board: game.question.answers.map(answer => ({ ...answer })), results: Object.fromEntries(game.players.map(id => [id, structuredClone(game.results[id])])) } : {}), history: structuredClone(game.history) };
}
