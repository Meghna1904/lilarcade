import assert from 'node:assert/strict';
import test from 'node:test';
import { createPuzzleRects } from './geometry.ts';
import { cropDimensions, cropRaster, pieceChoices } from './pieceChoices.ts';

const photos = [
  { name: '3:2 camera photo', width: 3000, height: 2000 },
  { name: '4:3 photo', width: 2400, height: 1800 },
  { name: 'square image', width: 1600, height: 1600 },
  { name: '16:9 screenshot', width: 1920, height: 1080 },
  { name: 'phone portrait', width: 1200, height: 2000 },
];

test('photo shapes produce distinct, sorted piece-count stops', () => {
  const lists = photos.map(photo => pieceChoices(photo.width, photo.height).map(choice => choice.count));
  for (const counts of lists) {
    assert.ok(counts.length >= 6);
    assert.deepEqual(counts, [...counts].sort((a, b) => a - b));
    assert.equal(new Set(counts).size, counts.length);
    assert.ok(counts.every(count => count >= 8 && count <= 200));
  }
  assert.equal(new Set(lists.map(counts => counts.join(','))).size, photos.length);
});

for (const photo of photos) {
  test(`${photo.name}: every stop crops to exact square cells`, () => {
    for (const choice of pieceChoices(photo.width, photo.height)) {
      assert.equal(choice.count, choice.rows * choice.cols);
      assert.ok(choice.crop <= 0.16);
      const cropW = photo.width * choice.cropBox.width;
      const cropH = photo.height * choice.cropBox.height;
      assert.ok(Math.abs(cropW / choice.cols - cropH / choice.rows) < 1e-8);

      const raster = cropDimensions(photo.width, photo.height, choice.cropBox, choice.rows, choice.cols);
      assert.equal(raster.width % choice.cols, 0);
      assert.equal(raster.height % choice.rows, 0);
      assert.equal(raster.width / choice.cols, raster.height / choice.rows);
      const sourceCrop = cropRaster(photo.width, photo.height, choice.cropBox, choice.rows, choice.cols);
      assert.ok(Math.abs(sourceCrop.sourceWidth / choice.cols - sourceCrop.sourceHeight / choice.rows) < 1e-8);

      const rects = createPuzzleRects(choice.count, 1234, 1000, 1000 * choice.rows / choice.cols, choice.rows, choice.cols);
      assert.equal(rects.length, choice.count);
      assert.ok(rects.every(rect => Math.abs(rect.width - rect.height) < 1e-8));
    }
  });
}
