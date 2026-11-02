import { useCallback, useEffect, useState } from 'react';
import type { CloudView, ClientToServerEvents, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';

export function useCloudGame(game: CloudView, socket: Socket<ServerToClientEvents, ClientToServerEvents>) {
  const [optimisticTicks, setOptimisticTicks] = useState(0);
  const callerTicks = game.tickCounts[game.roles.caller] ?? 0;

  useEffect(() => { setOptimisticTicks(0); }, [game.huntId, callerTicks, game.phase]);

  const tick = useCallback(() => {
    if (game.phase !== 'hunting' || game.paused) return;
    setOptimisticTicks(count => count + 1);
    socket.emit('cloud:tick', { huntId: game.huntId }, accepted => {
      if (!accepted) setOptimisticTicks(0);
    });
  }, [game.huntId, game.paused, game.phase, socket]);

  return { tick, optimisticTicks, callerTickCount: callerTicks + optimisticTicks };
}
