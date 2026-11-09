import { useEffect, useRef, useState } from 'react';
import type { ClientToServerEvents, PicturePuzzleChoice, PicturePuzzleCropBox, PicturePuzzleMode, PicturePuzzleView, RoomView, ServerToClientEvents } from '@arcade/shared';
import type { Socket } from 'socket.io-client';
import { PicturePuzzleCanvas, unlockPicturePuzzleSound } from './PicturePuzzleCanvas';
import { composeCropBox, cropBoxForAspect, cropRaster, pieceChoices as buildPieceChoices } from './pieceChoices';
import './picture-puzzle.css';

type Props = { game: PicturePuzzleView; self: string; players: RoomView['players']; socket: Socket<ServerToClientEvents, ClientToServerEvents> };
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_CHARS = 320_000;

function imageFrom(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = error => { URL.revokeObjectURL(url); reject(error); };
    image.src = url;
  });
}

async function compressPicture(file: File) {
  let image: CanvasImageSource;
  let width: number;
  let height: number;
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      image = bitmap; width = bitmap.width; height = bitmap.height;
    } catch {
      const decoded = await imageFrom(file);
      image = decoded; width = decoded.naturalWidth; height = decoded.naturalHeight;
    }
  } else {
    const decoded = await imageFrom(file);
    image = decoded; width = decoded.naturalWidth; height = decoded.naturalHeight;
  }
  let scale = Math.min(1, 1200 / width, 900 / height);
  let data = '';
  let outputWidth = 0, outputHeight = 0;
  for (let attempt = 0; attempt < 7; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(width * scale));
    canvas.height = Math.max(2, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the picture.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.78;
    data = canvas.toDataURL('image/jpeg', quality);
    while (data.length > MAX_IMAGE_CHARS && quality > 0.38) {
      quality -= 0.08;
      data = canvas.toDataURL('image/jpeg', quality);
    }
    if (data.length <= MAX_IMAGE_CHARS) { outputWidth = canvas.width; outputHeight = canvas.height; break; }
    scale *= 0.78;
  }
  if (data.length <= MAX_IMAGE_CHARS && outputWidth && outputHeight) return { data, width, height };
  throw new Error('This picture is too detailed to share. Try a smaller image.');
}

function imageFromData(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = data;
  });
}

async function cropPicture(data: string, box: PicturePuzzleCropBox, rows: number, cols: number) {
  const image = await imageFromData(data);
  let maxTileSize = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 6; attempt++) {
    const crop = cropRaster(image.naturalWidth, image.naturalHeight, box, rows, cols, maxTileSize);
    const canvas = document.createElement('canvas');
    canvas.width = crop.width; canvas.height = crop.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not crop the picture.');
    context.drawImage(image, crop.x, crop.y, crop.sourceWidth, crop.sourceHeight, 0, 0, crop.width, crop.height);
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const cropped = canvas.toDataURL('image/jpeg', quality);
      if (cropped.length <= MAX_IMAGE_CHARS) return cropped;
    }
    maxTileSize = Math.max(1, Math.floor(crop.width / cols * 0.78));
  }
  throw new Error('That crop is too detailed to share. Try another picture.');
}

function nearestChoice(choices: PicturePuzzleChoice[], previous = 100) {
  return [...choices].sort((a, b) => Math.abs(a.count - previous) - Math.abs(b.count - previous) || a.crop - b.crop)[0];
}

function cropLabel(choice: PicturePuzzleChoice) {
  if (choice.crop < 0.005) return 'No trimming';
  return `Trims ${Math.round(choice.crop * 100)}% of the ${choice.cropAxis}`;
}

function timerLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${minutes}:00`;
}

export function PicturePuzzleGame({ game, self, players, socket }: Props) {
  const ownId = self;
  const otherId = game.players.find(id => id !== self) ?? game.players[0];
  const partner = players.find(player => player.id === otherId);
  const owner = game.owner === self;
  const [sourceImage, setSourceImage] = useState(game.image ?? '');
  const [photo, setPhoto] = useState('');
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [choices, setChoices] = useState<PicturePuzzleChoice[]>(game.pieceChoices);
  const [mode, setMode] = useState<PicturePuzzleMode>(game.mode);
  const [pieces, setPieces] = useState(game.pieces);
  const [manualCropOpen, setManualCropOpen] = useState(false);
  const [manualAspect, setManualAspect] = useState('1');
  const [manualOffsetX, setManualOffsetX] = useState(0.5);
  const [manualOffsetY, setManualOffsetY] = useState(0.5);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [showReference, setShowReference] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const roomChoicesKey = JSON.stringify(game.pieceChoices);
  const localChoice = choices.find(choice => choice.count === pieces);
  const roomChoice = game.pieceChoices.find(choice => choice.rows === game.rows && choice.cols === game.cols) ?? game.pieceChoices.find(choice => choice.count === game.pieces);
  const activeChoice = game.phase === 'setup' && owner ? localChoice : roomChoice;
  const activeRows = activeChoice?.rows ?? game.rows;
  const activeCols = activeChoice?.cols ?? game.cols;
  const activeCropBox = activeChoice?.cropBox ?? game.cropBox;

  useEffect(() => {
    if (game.image) setSourceImage(game.image);
    setMode(game.mode);
    setPieces(game.pieces);
    setChoices(game.pieceChoices);
  }, [game.image, game.mode, game.pieces, game.rows, game.cols, game.cropBox.x, game.cropBox.y, game.cropBox.width, game.cropBox.height, roomChoicesKey]);

  useEffect(() => {
    if (!sourceImage) { setSourceSize(null); return; }
    let live = true;
    imageFromData(sourceImage).then(image => { if (live) setSourceSize({ width: image.naturalWidth, height: image.naturalHeight }); }).catch(() => { if (live) setError('This picture could not be read. Please upload it again.'); });
    return () => { live = false; };
  }, [sourceImage]);

  useEffect(() => {
    if (!sourceImage || !activeChoice || !activeRows || !activeCols) { setPhoto(''); return; }
    let live = true;
    cropPicture(sourceImage, activeCropBox, activeRows, activeCols)
      .then(cropped => { if (live) setPhoto(cropped); })
      .catch(cause => { if (live) setError(cause instanceof Error ? cause.message : 'This picture could not be cropped.'); });
    return () => { live = false; };
  }, [sourceImage, activeChoice, activeCropBox.x, activeCropBox.y, activeCropBox.width, activeCropBox.height, activeRows, activeCols]);

  useEffect(() => {
    if (game.phase !== 'playing') return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [game.phase]);
  const partnerReady = Boolean(game.ready[otherId]);
  const myReady = Boolean(game.ready[self]);
  const clockMs = game.phase === 'complete' ? game.elapsedMs ?? 0 : Math.max(0, now - (game.startedAt ?? now) - game.pausedTotalMs - (game.pausedAt ? now - game.pausedAt : 0));
  const clockText = timerLabel(Math.ceil(clockMs / 1000));
  const winnerName = game.winner ? players.find(player => player.id === game.winner)?.name ?? 'Your person' : '';

  const receiveFile = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) { setError('Choose a picture file such as PNG, JPG or WebP.'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError('Choose a picture under 10 MB.'); return; }
    setUploading(true);
    try {
      const picture = await compressPicture(file);
      const nextChoices = buildPieceChoices(picture.width, picture.height);
      setSourceImage(picture.data);
      setSourceSize({ width: picture.width, height: picture.height });
      setChoices(nextChoices);
      setManualOffsetX(0.5); setManualOffsetY(0.5);
      if (nextChoices.length) setPieces(nearestChoice(nextChoices, pieces).count);
      else setError('This picture is extremely wide or tall for complete square pieces. Crop it manually to continue.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That picture could not be opened.');
    } finally { setUploading(false); }
  };

  const applyManualCrop = () => {
    if (!sourceSize) return;
    const base = cropBoxForAspect(sourceSize.width, sourceSize.height, Number(manualAspect), manualOffsetX, manualOffsetY);
    const effectiveWidth = sourceSize.width * base.width, effectiveHeight = sourceSize.height * base.height;
    const croppedChoices = buildPieceChoices(effectiveWidth, effectiveHeight).map(choice => ({ ...choice, cropBox: composeCropBox(base, choice.cropBox) }));
    if (!croppedChoices.length) { setError('That crop is still too extreme. Choose a squarer crop.'); return; }
    setChoices(croppedChoices);
    setPieces(nearestChoice(croppedChoices, pieces).count);
    setManualCropOpen(false);
    setError('');
  };

  const shareAndReady = () => {
    if (owner && !sourceImage) { setError('Upload a picture before starting.'); return; }
    if (owner && !activeChoice) { setError('Choose an available square-piece grid or crop the picture manually.'); return; }
    if (!socket.connected) { setError('You’re reconnecting. Try again when you’re back online.'); return; }
    setError('');
    setStarting(true);
    unlockPicturePuzzleSound();
    const markReady = () => socket.emit('picturepuzzle:ready', error => {
      setStarting(false);
      if (error) setError(error);
    });
    if (owner && (sourceImage !== game.image || mode !== game.mode || pieces !== game.pieces || activeRows !== game.rows || activeCols !== game.cols || JSON.stringify(activeCropBox) !== JSON.stringify(game.cropBox) || choices !== game.pieceChoices)) {
      socket.emit('picturepuzzle:setup', { image: sourceImage, mode, pieces, rows: activeRows, cols: activeCols, imageAspect: activeCols / activeRows, cropBox: activeCropBox, pieceChoices: choices }, error => {
        if (error) { setStarting(false); setError(error); return; }
        markReady();
      });
    } else {
      markReady();
    }
  };

  const onBack = () => socket.emit('picturepuzzle:back');

  if (game.phase === 'setup') return <section className="picture-puzzle-screen">
    <header className="picture-puzzle-toolbar">
      <button type="button" className="puzzle-back" onClick={onBack}>← Lobby</button>
      <div className="puzzle-brand"><span>▦</span><b>Picture Puzzle</b><small>A picture, piece by piece</small></div>
      <div className="puzzle-toolbar-status"><span className="puzzle-online-dot"/> Two players</div>
    </header>
    <main className="puzzle-setup">
      <section className="puzzle-setup-copy">
        <span className="puzzle-kicker">MAKE A LITTLE CHALLENGE</span>
        <h1>Make a puzzle<br/>from <em>your picture.</em></h1>
        <p>Pick a favorite photo, choose your challenge, then connect the pieces side by side or race to finish.</p>
        <div className="puzzle-mode-options" role="group" aria-label="Game mode">
          <button type="button" className={mode === 'together' ? 'selected' : ''} disabled={!owner} aria-pressed={mode === 'together'} onClick={() => setMode('together')}><b>♡ Solve together</b><small>One shared board, one shared win.</small></button>
          <button type="button" className={mode === 'race' ? 'selected' : ''} disabled={!owner} aria-pressed={mode === 'race'} onClick={() => setMode('race')}><b>⚡ Race</b><small>Same picture. Separate boards. First to connect wins.</small></button>
        </div>
        <label className="puzzle-piece-slider">
          <span>PIECES <b>{activeChoice ? `${activeChoice.count} · ${activeChoice.cols}×${activeChoice.rows}` : 'Choose a crop'}</b></span>
          <input type="range" min="0" max={Math.max(0, choices.length - 1)} step="1" value={Math.max(0, choices.findIndex(choice => choice.count === pieces))} disabled={!owner || choices.length < 2} onChange={event => setPieces(choices[Number(event.target.value)]?.count ?? pieces)} aria-label="Choose a puzzle grid"/>
          <span className="puzzle-slider-ends"><small>{choices[0]?.count ?? '—'}</small><small>{choices.at(-1)?.count ?? '—'}</small></span>
          <small>{activeChoice ? cropLabel(activeChoice) : 'Upload a picture to calculate square-piece grids.'}</small>
        </label>
        {sourceImage && choices.length < 3 && <div className="puzzle-crop-warning" role="status">
          <span>✦</span><p>This image shape has only {choices.length} usable grid {choices.length === 1 ? 'size' : 'sizes'} while trimming up to 16%. Crop it manually for more choices.</p>
          {owner && <button type="button" onClick={() => setManualCropOpen(true)}>Crop it myself</button>}
        </div>}
        {error && <p className="puzzle-error" role="alert">{error}</p>}
        <div className="puzzle-ready-row">
          <button type="button" className="puzzle-primary" disabled={uploading || starting || (owner && (!sourceImage || !activeChoice || !photo))} onClick={shareAndReady}>
            {uploading ? 'Preparing your picture…' : starting ? 'Getting puzzle ready…' : myReady ? 'I’m ready ✓' : owner ? 'Share setup & get ready →' : 'I’m ready →'}
          </button>
          <span>{partnerReady ? `${partner?.name ?? 'Your person'} is ready` : `Waiting for ${partner?.name ?? 'your person'}`}</span>
        </div>
      </section>
      <section className="puzzle-upload-card">
        <div className="puzzle-upload-art" onClick={() => owner && fileInput.current?.click()} data-ready={Boolean(photo)}>
          {photo ? <img src={photo} alt="Cropped puzzle preview"/> : sourceImage ? <div className="puzzle-empty-image"><span>✦</span><b>Preparing your crop…</b></div> : <div className="puzzle-empty-image"><span>▧</span><b>Your picture goes here</b><small>JPG, PNG or WebP · up to 10 MB</small></div>}
          <span className="puzzle-preview-count">{activeChoice ? `${activeChoice.count} · ${activeChoice.cols}×${activeChoice.rows}` : 'PUZZLE PREVIEW'}</span>
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={event => { void receiveFile(event.target.files?.[0]); event.target.value = ''; }}/>
        {owner ? <button className="puzzle-upload-button" type="button" onClick={() => fileInput.current?.click()}>{sourceImage ? 'Choose a different picture' : 'Upload a picture'} <span>↑</span></button> : <p className="puzzle-owner-note">{partner?.name ?? 'Your person'} is choosing the picture.</p>}
      </section>
    </main>
    {manualCropOpen && sourceImage && sourceSize && <div className="puzzle-crop-modal" role="dialog" aria-modal="true" aria-labelledby="puzzle-crop-title">
      <div className="puzzle-crop-dialog">
        <button type="button" className="puzzle-crop-close" onClick={() => setManualCropOpen(false)} aria-label="Close crop tool">×</button>
        <span className="puzzle-kicker">SAVE THE PART YOU LOVE</span>
        <h2 id="puzzle-crop-title">Crop your picture</h2>
        <p>Choose a frame, then slide the picture to pick what stays in the puzzle.</p>
        <div className="puzzle-manual-crop-preview" style={{ aspectRatio: manualAspect, backgroundImage: `url(${sourceImage})`, backgroundSize: sourceSize.width / sourceSize.height > Number(manualAspect) ? 'auto 100%' : '100% auto', backgroundPosition: `${manualOffsetX * 100}% ${manualOffsetY * 100}%` }} />
        <label className="puzzle-crop-ratio">FRAME SHAPE<select value={manualAspect} onChange={event => setManualAspect(event.target.value)}><option value="1">Square</option><option value="0.8">Portrait · 4:5</option><option value="0.75">Tall · 3:4</option><option value="1.333333">Classic · 4:3</option><option value="1.5">Photo · 3:2</option><option value="1.777778">Wide · 16:9</option></select></label>
        {sourceSize.width / sourceSize.height > Number(manualAspect) ? <label className="puzzle-crop-position">MOVE LEFT / RIGHT<input type="range" min="0" max="100" value={Math.round(manualOffsetX * 100)} onChange={event => setManualOffsetX(Number(event.target.value) / 100)}/></label> : sourceSize.width / sourceSize.height < Number(manualAspect) ? <label className="puzzle-crop-position">MOVE UP / DOWN<input type="range" min="0" max="100" value={Math.round(manualOffsetY * 100)} onChange={event => setManualOffsetY(Number(event.target.value) / 100)}/></label> : <small>This frame keeps the full picture.</small>}
        <button type="button" className="puzzle-primary" onClick={applyManualCrop}>Use this crop ✦</button>
      </div>
    </div>}
  </section>;

  if (game.phase === 'complete') return <section className="picture-puzzle-screen">
    <header className="picture-puzzle-toolbar"><button type="button" className="puzzle-back" onClick={onBack}>← Lobby</button><div className="puzzle-brand"><span>▦</span><b>Picture Puzzle</b></div><span className="puzzle-result-time">{clockText}</span></header>
    <main className="puzzle-result-screen">
      <span className="puzzle-kicker">{game.mode === 'together' ? 'MADE TOGETHER' : game.winner === self ? 'YOU WON THE RACE' : 'RACE COMPLETE'}</span>
      <h1>{game.mode === 'together' ? 'Look what you built.' : `${winnerName} connected every piece!`}</h1>
      <p>{game.mode === 'together' ? `You connected all ${game.pieces} pieces in ${timerLabel(Math.floor((game.elapsedMs ?? 0) / 1000))}.` : game.winner === self ? `You connected every piece first in ${timerLabel(Math.floor((game.elapsedMs ?? 0) / 1000))}.` : `${winnerName} connected the puzzle first.`}</p>
      <div className="puzzle-complete-image"><img src={photo} alt="Completed uploaded puzzle"/></div>
      <div className="puzzle-result-actions"><button type="button" className="puzzle-primary" onClick={() => socket.emit('picturepuzzle:replay')}>Play again ↻</button><button type="button" className="puzzle-secondary" onClick={onBack}>Back to lobby</button></div>
    </main>
  </section>;

  return <section className="picture-puzzle-screen">
    <header className="picture-puzzle-toolbar">
      <button type="button" className="puzzle-back" onClick={onBack}>← Lobby</button>
      <div className="puzzle-brand"><span>▦</span><b>Picture Puzzle</b><small>{game.mode === 'together' ? 'Solving together' : 'Race mode'}</small></div>
      <div className="puzzle-game-status"><span className={game.paused ? 'status-dot away' : 'status-dot'}/>{game.paused ? 'Paused · reconnecting' : `${game.board.groups.length} groups left`}</div>
      <output className="puzzle-clock" aria-label="Time elapsed">{clockText}</output>
      <div className={`puzzle-image-reference${showReference ? ' open' : ''}`} onMouseLeave={() => setShowReference(false)}>
        <button type="button" className="puzzle-icon-button" onBlur={() => setShowReference(false)} onClick={() => setShowReference(value => !value)} aria-expanded={showReference} title="Preview the full picture" aria-label="Preview the full picture">▧</button>
        <div className="puzzle-reference-popover"><img src={photo} alt="Full puzzle picture"/><span>FULL PICTURE</span></div>
      </div>
      <button type="button" className="puzzle-icon-button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }} title="Toggle full screen" aria-label="Toggle full screen">⛶</button>
    </header>
    {game.paused && <div className="puzzle-pause-banner" role="status">Your puzzle is saved. It will resume when both players are back.</div>}
    <PicturePuzzleCanvas game={{ ...game, image: photo || undefined, imageAspect: activeCols / activeRows, rows: activeRows, cols: activeCols, pieces: activeRows * activeCols }} self={self} socket={socket}/>
  </section>;
}

