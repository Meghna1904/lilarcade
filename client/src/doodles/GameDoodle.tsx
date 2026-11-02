import { Doodle } from './Doodle';
import type { DoodleExpression } from './manifest';
import { useDoodleExpression } from './useDoodleExpression';

type Props = { id: string; name?: string; expression?: DoodleExpression; playing: boolean; seed?: string; size?: number | string; flip?: boolean; crop?: boolean };
export function GameDoodle({ id, name, expression = 'idle', playing, seed = id, size, flip, crop }: Props) {
  const mood = useDoodleExpression(playing, expression, seed);
  return <Doodle id={id} name={name} expression={mood} size={size} flip={flip} crop={crop}/>;
}
