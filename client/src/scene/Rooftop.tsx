export function Rooftop({ night }: { night: boolean }) {
  return <svg className="scene-rooftop" viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true">
    <path className="roof-rim" d="M0 137 205 75l191 54 180-74 154 66 180-60 180 67 150-43v215H0Z"/>
    <path className="roof-body" d="M0 148 205 85l191 54 180-74 154 66 180-60 180 67 150-43v205H0Z"/>
    <path className="roof-chimney" d="M245 73V22h40v63m-48-56h56"/><path className="roof-antenna" d="m1085 76 8-49m-16 17h32m-24-9-9-9m18 9 9-9"/>
    <path className="roof-lights" d="M70 134q160 60 320-2t320 1 320-1 340 0"/>{Array.from({ length: 23 }, (_, i) => <circle key={i} className="roof-light" cx={80 + i * 58} cy={137 + Math.sin(i / 2.2) * 13} r="3" />)}
    <path className="roof-blanket" d="M526 188q66-22 129 0v22H526Z"/><path className="roof-mug" d="M688 172h20v21h-20zm20 5h8q7 8 0 13h-8m35-18h20v21h-20zm20 5h8q7 8 0 13h-8"/>
    <path className="roof-steam" d="M696 164q-8-8 0-15t0-14m47 28q-8-8 0-15t0-14"/>
    <path className="roof-window" style={{ opacity: night ? 1 : .18 }} d="M1320 123h34v28h-34zM1337 123v28m-17-14h34"/>
  </svg>;
}
