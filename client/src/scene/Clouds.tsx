export function Clouds() {
  return <div className="scene-clouds" aria-hidden="true">{[0, 1, 2, 3].map((n) => <svg key={n} className={`scene-cloud cloud-${n}`} viewBox="0 0 220 76"><path d="M14 55c-8-2-10-12-4-18 4-4 10-5 16-3 1-15 20-23 33-13 8-13 30-13 38 1 18-7 39 3 39 22 0 3 0 6-2 9h55c14 0 18 13 7 18H24c-10 0-16-7-10-16Z"/></svg>)}</div>;
}
