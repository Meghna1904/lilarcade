import type { CupId } from '@arcade/shared';

export const CUP_STYLES: Record<CupId, { color: string; accent: string; mark: string; name: string }> = {
  coral: { color: '#ff8a80', accent: '#ffc0ba', mark: '●', name: 'coral red' },
  sky: { color: '#86c9ee', accent: '#d3efff', mark: '★', name: 'sky blue' },
  butter: { color: '#ffd98a', accent: '#fff0bd', mark: '♥', name: 'butter yellow' },
  mint: { color: '#8fd3c1', accent: '#d8f6ec', mark: '▲', name: 'mint green' },
  lavender: { color: '#bda7df', accent: '#eadfff', mark: '■', name: 'lavender purple' },
  peach: { color: '#f2ad8d', accent: '#ffe1d2', mark: '✚', name: 'peach orange' },
};

export function Cup({ id, compact = false, selected = false }: { id: CupId; compact?: boolean; selected?: boolean }) {
  const style = CUP_STYLES[id];
  return <span className={`cup ${compact ? 'cup-compact' : ''} ${selected ? 'cup-selected' : ''}`} title={style.name} aria-label={`${style.name} cup`}>
    <svg viewBox="0 0 64 72" role="img" aria-hidden="true">
      <path d="M10 15h44l-4 43c-.4 4.5-4 8-8.5 8h-19c-4.5 0-8.1-3.5-8.5-8L10 15Z" fill={style.color} />
      <path d="M9 14c0-3 3-5 7-5h32c4 0 7 2 7 5s-3 5-7 5H16c-4 0-7-2-7-5Z" fill={style.accent} stroke={style.color} strokeWidth="2" />
      <path d="M19 27c2 11 2 21 3 28" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" />
      <text x="32" y="48" textAnchor="middle" fill="#382b48" fontSize="13" fontWeight="700">{style.mark}</text>
      <circle cx="27" cy="55" r="1.5" fill="#382b48" /><circle cx="38" cy="55" r="1.5" fill="#382b48" />
      <path d="M29 59q3 3 6 0" fill="none" stroke="#382b48" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  </span>;
}
