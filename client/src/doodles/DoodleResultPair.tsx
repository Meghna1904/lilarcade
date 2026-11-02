import type { RoomView } from '@arcade/shared';
import { Doodle } from './Doodle';
import { playerDoodleId } from './playerDoodle';

export function DoodleResultPair({ players, winnerId }: { players: RoomView['players']; winnerId?: string }) {
  if (!winnerId) return null;
  return <div className="doodle-result-pair" aria-hidden="true">
    {players.map(player => <Doodle
      key={player.id}
      id={playerDoodleId(players, player)}
      expression={player.id === winnerId ? 'celebrating' : 'sad'}
      size="clamp(78px, 13vh, 118px)"
      name={player.name}
    />)}
  </div>;
}
