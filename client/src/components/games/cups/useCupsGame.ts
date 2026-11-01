import { useEffect, useState } from 'react';
import type { CupId, CupsView } from '@arcade/shared';

const rotate = <T,>(items: T[]) => items.length ? [...items.slice(1), items[0]] : items;

export function useCupsGame(game: CupsView) {
  const [order, setOrder] = useState<CupId[]>(() => rotate(game.cups));
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setOrder(game.phase === 'setup' && game.secret?.length ? [...game.secret] : rotate(game.cups));
    setSelected(null);
  }, [game.round, game.phase, game.cups.join('|')]);

  const selectOrSwap = (index: number) => {
    if (selected === null) setSelected(index);
    else if (selected === index) setSelected(null);
    else {
      setOrder(current => current.map((cup, i) => i === selected ? current[index] : i === index ? current[selected] : cup));
      setSelected(null);
    }
  };

  const moveCup = (from: number, to: number) => {
    if (from === to) return;
    setOrder(current => current.map((cup, i) => i === from ? current[to] : i === to ? current[from] : cup));
    setSelected(null);
  };

  return { order, selected, selectOrSwap, moveCup, setOrder };
}
