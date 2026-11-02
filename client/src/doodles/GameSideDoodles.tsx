import type { RoomView } from '@arcade/shared';
import { Doodle } from './Doodle';
import { playerDoodleId } from './playerDoodle';
import { useDoodleExpression } from './useDoodleExpression';

export function GameSideDoodles({ players, self, playing }: { players: RoomView['players']; self: string; playing: boolean }) {
  const mine = players.find(player => player.id === self);
  const partner = players.find(player => player.id !== self);
  const mineExpression = useDoodleExpression(playing, 'idle', mine?.id);
  const partnerExpression = useDoodleExpression(playing, 'idle', partner?.id);
  return <div className="game-side-doodles" aria-hidden="true">
    <div className="game-side-doodle player-one"><Doodle id={playerDoodleId(players, mine)} expression={mineExpression} size="100%" name={mine?.name}/><span>{mine?.name ?? 'you'}</span></div>
    <div className="game-side-doodle player-two"><Doodle id={playerDoodleId(players, partner)} expression={partnerExpression} size="100%" name={partner?.name}/><span>{partner?.name ?? 'partner'}</span></div>
  </div>;
}
