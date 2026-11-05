import type { ComponentType } from 'react';
import { TicketIllustration } from './TicketIllustration';

export type LobbyGameId = 'hangman'|'cups'|'poison'|'cloud'|'slapcount'|'familyfeud'|'rps'|'hotbomb'|'twohalves';
export type SettingOption = { label: string; value: string|number|boolean };
export type GameSetting = { id: string; label: string; type: 'select'|'checkbox'; default: string|number|boolean; options?: SettingOption[] };
export type GameTicketConfig = { id: LobbyGameId; title: string; tagline: string; description: string; accent: string; formats: Array<'quick'|'bestOf3'|'bestOf5'>; settings: GameSetting[]; image?: string; duration?: string; art: ComponentType<{ className?: string }> };
const options = (values: Array<string|number>, label: (value: string|number) => string = value => String(value)): SettingOption[] => values.map(value => ({ label: label(value), value }));

export const lobbyCopy = {
  greetings: ['Our little world looks good on you.', 'Ready for a tiny adventure?', 'The rooftop is all ours tonight.', 'Pick a game, make a memory.'],
  footer: 'made with love for our favourite two ♡',
  ticketMeta: '2 players',
};

export const gameRegistry: GameTicketConfig[] = [
  { id: 'hangman', title: 'Hangman', tagline: 'WORD GAME · 2 PLAYERS', description: 'A secret word, six guesses, and a very cute little fellow.', accent: 'var(--lavender)', formats: ['quick','bestOf3'], settings: [], art: TicketIllustration },
  { id: 'cups', title: 'Cup Ordering', tagline: 'A LITTLE LOGIC · 2 PLAYERS', description: 'Find the secret arrangement with tiny clues.', accent: 'var(--butter)', formats: ['quick','bestOf3'], settings: [
    { id: 'cupCount', label: 'Cups', type: 'select', default: 5, options: options([4,5,6]) },
    { id: 'maxGuesses', label: 'Guesses', type: 'select', default: 8, options: options([6,8,10,12]) },
    { id: 'hintEnabled', label: 'Hints', type: 'checkbox', default: false },
  ], art: TicketIllustration },
  { id: 'poison', title: 'Poison Candy', tagline: 'A LITTLE SUGAR, A LITTLE SUSPENSE · 2 PLAYERS', description: 'The tray grows and adds poison each round.', accent: 'var(--peach)', formats: ['quick','bestOf3','bestOf5'], settings: [
    { id: 'gridSize', label: 'Tray size', type: 'select', default: 4, options: options([3,4,5], value => `${value} × ${value}`) },
    { id: 'timerEnabled', label: 'Turn timer', type: 'checkbox', default: false },
    { id: 'confirmMode', label: 'Confirm each taste', type: 'checkbox', default: true },
    { id: 'warmCold', label: 'Warm / cold hints', type: 'checkbox', default: false },
    { id: 'tieMode', label: 'Sweet tie rounds', type: 'select', default: 'replay', options: [{ label: 'Replay (default)', value: 'replay' }, { label: 'Count as a draw', value: 'draw' }] },
  ], art: TicketIllustration },
  { id: 'cloud', title: 'Cloud Race', tagline: 'NUMBER HUNT · 2 PLAYERS', description: 'One calls, one hunts. Tick your boxes while they search.', accent: 'var(--mint)', formats: ['quick','bestOf3'], settings: [
    { id: 'targetBoxes', label: 'Target boxes', type: 'select', default: 100, options: options([30,50,100]) },
    { id: 'catchBonus', label: 'Catch bonus', type: 'select', default: 1, options: options([0,1,2,3]) },
    { id: 'layoutMode', label: 'Re-scatter', type: 'select', default: 'hunt', options: [{ label: 'Every hunt', value: 'hunt' }, { label: 'Every round', value: 'round' }] },
    { id: 'huntTimeoutSeconds', label: 'Hunt timeout', type: 'select', default: 45, options: options([15,30,45,60], value => `${value} seconds`) },
  ], art: TicketIllustration },
  { id: 'slapcount', title: 'Slap Count', tagline: 'A LITTLE REFLEX RACE · 2 PLAYERS', description: 'Count from 1 to 10. Slap on a match, a W, or matching cards in a row!', accent: 'var(--periwinkle)', formats: ['quick','bestOf3'], settings: [
    { id: 'startingCards', label: 'Starting cards', type: 'select', default: 20, options: options(Array.from({ length: 11 }, (_, i) => i + 10)) },
    { id: 'pace', label: 'Turn pace', type: 'select', default: 'manual', options: [{ label: 'Manual lay', value: 'manual' }, { label: 'Auto · 1.2 sec', value: 1200 }, { label: 'Auto · 1 sec', value: 1000 }, { label: 'Auto · 0.8 sec', value: 800 }] },
    { id: 'callMode', label: 'Call mode · hide count', type: 'checkbox', default: false },
  ], art: TicketIllustration },
  { id: 'familyfeud', title: 'Family Feud', tagline: 'POPULAR ANSWERS · 2 PLAYERS', description: 'How well can you guess the popular answers?', accent: 'var(--peach)', formats: ['quick'], settings: [
    { id: 'rounds', label: 'Questions', type: 'select', default: 10, options: options([5,10,15,20,30], value => `${value} rounds`) },
  ], art: TicketIllustration },
  { id: 'hotbomb', title: 'Hot Bomb', tagline: 'A LITTLE BLUFF - 2 PLAYERS', description: 'Pass it fast or hold your nerve. The fuse is secret.', accent: 'var(--peach)', formats: ['quick','bestOf3','bestOf5'], settings: [], duration: '~3 min', art: TicketIllustration },
  { id: 'rps', title: 'Rock Paper Scissors', tagline: 'SILLY SHOWDOWN · 2 PLAYERS', description: 'Pick your move, reveal together, and race to three wins.', accent: 'var(--mint)', formats: ['bestOf5'], settings: [], art: TicketIllustration },
  { id: 'twohalves', title: 'Two Halves', tagline: 'COLORING DATE · 2 PLAYERS', description: 'Split a coloring page, paint your own side, and make one little masterpiece together.', accent: 'var(--peach)', formats: ['quick'], settings: [], duration: '~10 min', art: TicketIllustration },
];

export function defaultSettings(config: GameTicketConfig) { return Object.fromEntries(config.settings.map(setting => [setting.id, setting.default])); }
