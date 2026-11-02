import type { SlapSuit } from '@arcade/shared';
import { slapSuits } from './slapConfig';

export function Card({ value, suit, faceDown = false, small = false, wobble = false }: { value?: number; suit?: SlapSuit; faceDown?: boolean; small?: boolean; wobble?: boolean }) {
  const style = suit ? slapSuits[suit] : undefined;
  if (faceDown) return <svg className={`slap-card ${small ? 'small' : ''} ${wobble ? 'wobble' : ''}`} viewBox="0 0 100 140" aria-hidden="true"><rect x="3" y="3" width="94" height="134" rx="12" fill="#e9dfd1"/><rect x="8" y="8" width="84" height="124" rx="9" fill="#403751"/><path d="M17 17h66v106H17z" fill="none" stroke="#bfa9e8" strokeWidth="2" strokeDasharray="3 4"/><path d="M50 45l8 13 15 2-11 10 3 15-15-8-15 8 3-15-11-10 15-2z" fill="#ffd98a"/><circle cx="50" cy="67" r="3" fill="#ff8a80"/></svg>;
  if (!style || value === undefined) return null;
  const symbol = suit === 'heart' ? <path d="M50 83 26 61C7 42 35 22 50 42c15-20 43 0 24 19Z" /> : suit === 'star' ? <path d="m50 27 8 26 27 1-21 16 8 26-22-16-22 16 8-26-21-16 27-1z" /> : suit === 'moon' ? <path d="M68 25c-4 17 2 37 20 47-12 17-35 24-54 13-20-12-25-37-13-56 10-16 30-22 47-15Z" /> : <path d="M50 22C38 42 24 56 24 70a26 26 0 0 0 52 0C76 56 62 42 50 22Z" />;
  return <svg className={`slap-card ${small ? 'small' : ''} ${wobble ? 'wobble' : ''}`} viewBox="0 0 100 140" role="img" aria-label={`${value} of ${style.label}`}>
    <rect x="3" y="3" width="94" height="134" rx="12" fill="#f5eee3" stroke="#d7c8b8" strokeWidth="2"/>
    <path d="M11 13h78v114H11z" fill="none" stroke={style.color} strokeWidth="1.5" opacity=".45"/>
    <text x="17" y="31" fill={style.color} fontSize="20" fontWeight="800" fontFamily="system-ui">{value}</text>
    <g fill={style.color} transform="translate(50 68) scale(.47)">{symbol}</g>
    <text x="81" y="124" fill={style.color} fontSize="20" fontWeight="800" fontFamily="system-ui" textAnchor="end" transform="rotate(180 81 118)">{value}</text>
    <path d="M20 40h60M20 99h60" stroke={style.color} strokeWidth="1" opacity=".25"/>
  </svg>;
}
