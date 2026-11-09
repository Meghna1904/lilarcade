import type { PicturePuzzleChoice, PicturePuzzleCropBox } from '@arcade/shared';

function centeredCrop(imgW: number, imgH: number, ratio: number): PicturePuzzleCropBox {
  let width = imgW, height = imgH;
  if (imgW / imgH > ratio) width = imgH * ratio;
  else height = imgW / ratio;
  // Use one exact square tile size so the raster output contains no partial cells.
  const tileSize = Math.min(width / Math.max(1, ratio), height);
  width = tileSize * ratio;
  height = tileSize;
  return { x: (imgW - width) / 2 / imgW, y: (imgH - height) / 2 / imgH, width: width / imgW, height: height / imgH };
}

export function pieceChoices(imgW: number, imgH: number, min = 8, max = 200): PicturePuzzleChoice[] {
  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW <= 0 || imgH <= 0) return [];
  const aspect = imgW / imgH;
  let list: PicturePuzzleChoice[] = [];
  for (const tol of [0.08, 0.12, 0.16]) {
    const best = new Map<number, PicturePuzzleChoice>();
    for (let rows = 2; rows <= 40; rows++) {
      for (let cols = 2; cols <= 40; cols++) {
        const count = rows * cols;
        if (count < min || count > max) continue;
        const gridRatio = cols / rows;
        const crop = gridRatio < aspect ? 1 - gridRatio / aspect : 1 - aspect / gridRatio;
        if (crop > tol) continue;
        const prev = best.get(count);
        if (!prev || crop < prev.crop) best.set(count, { count, rows, cols, crop, cropAxis: aspect > gridRatio ? 'width' : 'height', cropBox: centeredCrop(imgW, imgH, gridRatio) });
      }
    }
    list = [...best.values()].sort((a, b) => a.count - b.count);
    if (list.length >= 6) break;
  }
  return list;
}

export function composeCropBox(base: PicturePuzzleCropBox, local: PicturePuzzleCropBox): PicturePuzzleCropBox {
  return {
    x: base.x + local.x * base.width,
    y: base.y + local.y * base.height,
    width: local.width * base.width,
    height: local.height * base.height,
  };
}

export function cropBoxForAspect(imgW: number, imgH: number, ratio: number, offsetX = 0.5, offsetY = 0.5): PicturePuzzleCropBox {
  let width = imgW, height = imgH;
  if (imgW / imgH > ratio) width = imgH * ratio;
  else height = imgW / ratio;
  const x = Math.max(0, Math.min(1, offsetX)) * (imgW - width);
  const y = Math.max(0, Math.min(1, offsetY)) * (imgH - height);
  return { x: x / imgW, y: y / imgH, width: width / imgW, height: height / imgH };
}

export function cropDimensions(imgW: number, imgH: number, box: PicturePuzzleCropBox, rows: number, cols: number) {
  const raster = cropRaster(imgW, imgH, box, rows, cols);
  return { width: raster.width, height: raster.height };
}

export function cropRaster(imgW: number, imgH: number, box: PicturePuzzleCropBox, rows: number, cols: number, maxTileSize = Number.POSITIVE_INFINITY) {
  const left = imgW * box.x, top = imgH * box.y;
  const boxWidth = imgW * box.width, boxHeight = imgH * box.height;
  const ratio = cols / rows;
  let sourceWidth = boxWidth, sourceHeight = boxHeight;
  if (sourceWidth / sourceHeight > ratio) sourceWidth = sourceHeight * ratio;
  else sourceHeight = sourceWidth / ratio;
  const tileSize = Math.max(1, Math.min(Math.floor(Math.min(sourceWidth / cols, sourceHeight / rows)), maxTileSize));
  sourceWidth = tileSize * cols;
  sourceHeight = tileSize * rows;
  const centerX = left + boxWidth / 2, centerY = top + boxHeight / 2;
  const x = Math.max(left, Math.min(left + boxWidth - sourceWidth, centerX - sourceWidth / 2));
  const y = Math.max(top, Math.min(top + boxHeight - sourceHeight, centerY - sourceHeight / 2));
  return { x, y, sourceWidth, sourceHeight, width: tileSize * cols, height: tileSize * rows };
}
