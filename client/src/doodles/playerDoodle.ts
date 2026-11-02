import type { RoomView } from '@arcade/shared';

/** Gives players a stable her/him portrait until they choose another one. */
export function playerDoodleId(players: RoomView['players'], player?: RoomView['players'][number]): string {
  const index = player ? players.findIndex(candidate => candidate.id === player.id) : 0;
  const pairedPortrait = index === 1 ? 'him' : 'her';
  // Legacy sticker IDs were the old defaults. Treat them as unset so existing
  // rooms resolve to the uploaded pair, while an explicit her/him selection is
  // shared as-is.
  return player?.doodleId === 'her' || player?.doodleId === 'him' ? player.doodleId : pairedPortrait;
}
