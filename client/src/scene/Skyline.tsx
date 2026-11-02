export function Skyline({ minute }: { minute: number }) {
  const night = minute < 270 || minute > 1230;
  return <svg className="scene-skyline" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true"><path d="M0 200V116h68V80h48v36h42v-62h18v-31h7v31h20v62h51V90h78v39h38V67h35v-35h8v35h19v68h59V92h94v41h27V76h75v60h45V95h59v-52h12v52h49v35h61V86h88v49h53V65h24v70h46v-42h72v47h42V98h88v45h55V71h32v69h43v-34h74v94Z"/><g className="scene-windows">{Array.from({ length: 30 }, (_, i) => <rect key={i} x={20 + i * 48} y={112 + (i % 3) * 10} width="3" height="4" rx="1" style={{ opacity: night && (minute + i * 13) % 5 < 3 ? .8 : .08 }} />)}</g></svg>;
}
