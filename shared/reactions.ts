export const REACTIONS = [
  { id: 'laugh', file: 'laugh.json', fallback: '😂' },
  { id: 'grimace', file: 'grimace.json', fallback: '😬' },
  { id: 'cry', file: 'cry.json', fallback: '😭' },
  { id: 'party', file: 'party.json', fallback: '🎉' },
  { id: 'shy', file: 'shy.json', fallback: '🙈' },
] as const;

export type ReactionId = typeof REACTIONS[number]['id'];
export function isReactionId(value: string): value is ReactionId {
  return REACTIONS.some(reaction => reaction.id === value);
}
