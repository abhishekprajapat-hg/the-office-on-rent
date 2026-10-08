const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function load(relative) {
  const file = path.resolve(__dirname, '../src', relative);
  const source = transformSync(fs.readFileSync(file, 'utf8'), { loader: 'js', format: 'cjs' }).code;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require }, { filename: file });
  return module.exports;
}

const { coverScale, clampOffset, cropRect, cropOutputType, CROP_OUTPUT_SIZE } = load('components/ui/cropGeometry.js');

const VIEWPORT = 288;
// The shape that started this: a phone portrait, which is what was being
// squeezed into a round avatar.
const PORTRAIT = { naturalWidth: 289, naturalHeight: 512 };

test('cover scale fills the square from the shorter edge', () => {
  // A 289x512 portrait has to be scaled until its *width* reaches 288.
  assert.equal(coverScale(VIEWPORT, 289, 512), VIEWPORT / 289);
  // A landscape is driven by its height instead.
  assert.equal(coverScale(VIEWPORT, 1024, 400), VIEWPORT / 400);
  // An already-square photo needs the same on both axes.
  assert.equal(coverScale(VIEWPORT, 512, 512), VIEWPORT / 512);
});

test('cover scale never divides by a missing dimension', () => {
  assert.equal(coverScale(VIEWPORT, 0, 0), 1);
  assert.equal(coverScale(0, 100, 100), 1);
});

test('the image cannot be dragged away from an edge', () => {
  const displayed = 512;
  // Dragging right past the left edge would open a gap; it is held at 0.
  assert.equal(clampOffset(40, VIEWPORT, displayed), 0);
  // And past the right edge, held at the point the image still covers.
  assert.equal(clampOffset(-900, VIEWPORT, displayed), VIEWPORT - displayed);
  // In between, left alone.
  assert.equal(clampOffset(-100, VIEWPORT, displayed), -100);
});

test('an image smaller than the square is pinned, not stretched', () => {
  // displayed < viewport should not produce a positive offset range.
  assert.equal(clampOffset(50, VIEWPORT, 100), 0);
});

test('the crop region is always square, so nothing is distorted', () => {
  const scale = coverScale(VIEWPORT, PORTRAIT.naturalWidth, PORTRAIT.naturalHeight);
  const rect = cropRect({ viewport: VIEWPORT, ...PORTRAIT, scale, offsetX: 0, offsetY: -50 });
  // A square source region drawn into a square canvas is the whole point: the
  // old bug was a 289x512 image forced into a square box.
  assert.ok(rect.size > 0);
  assert.equal(Math.round(rect.size), 289);
});

test('the crop stays inside the image', () => {
  const scale = coverScale(VIEWPORT, PORTRAIT.naturalWidth, PORTRAIT.naturalHeight);
  // Offsets far outside anything a drag could produce.
  const rect = cropRect({ viewport: VIEWPORT, ...PORTRAIT, scale, offsetX: -5000, offsetY: -5000 });
  assert.ok(rect.sx >= 0, 'sx must not be negative');
  assert.ok(rect.sy >= 0, 'sy must not be negative');
  assert.ok(rect.sx + rect.size <= PORTRAIT.naturalWidth + 0.001, 'must not read past the right edge');
  assert.ok(rect.sy + rect.size <= PORTRAIT.naturalHeight + 0.001, 'must not read past the bottom edge');
});

test('centring a portrait takes the middle band, not the top', () => {
  const scale = coverScale(VIEWPORT, PORTRAIT.naturalWidth, PORTRAIT.naturalHeight);
  const displayedHeight = PORTRAIT.naturalHeight * scale;
  const centred = (VIEWPORT - displayedHeight) / 2;
  const rect = cropRect({ viewport: VIEWPORT, ...PORTRAIT, scale, offsetX: 0, offsetY: centred });
  const expectedTop = (PORTRAIT.naturalHeight - rect.size) / 2;
  assert.ok(Math.abs(rect.sy - expectedTop) < 0.01, `expected the middle band, got sy=${rect.sy}`);
});

test('zooming in reads a smaller region of the original', () => {
  const base = coverScale(VIEWPORT, PORTRAIT.naturalWidth, PORTRAIT.naturalHeight);
  const atRest = cropRect({ viewport: VIEWPORT, ...PORTRAIT, scale: base, offsetX: 0, offsetY: 0 });
  const zoomed = cropRect({ viewport: VIEWPORT, ...PORTRAIT, scale: base * 2, offsetX: 0, offsetY: 0 });
  assert.ok(zoomed.size < atRest.size, 'zooming in must narrow the source region');
});

test('a nonsense scale falls back to cover rather than dividing by zero', () => {
  const rect = cropRect({ viewport: VIEWPORT, ...PORTRAIT, scale: 0, offsetX: 0, offsetY: 0 });
  assert.ok(Number.isFinite(rect.size) && rect.size > 0);
});

test('output is square and capped at what the server stores', () => {
  // backend imageProcessing caps profile-images at a 512px edge, so writing a
  // larger square would only be thrown away again.
  assert.equal(CROP_OUTPUT_SIZE, 512);
});

test('transparency is kept only where it can exist', () => {
  assert.equal(cropOutputType('image/png'), 'image/png');
  assert.equal(cropOutputType('image/jpeg'), 'image/jpeg');
  assert.equal(cropOutputType('image/heic'), 'image/jpeg');
  assert.equal(cropOutputType(undefined), 'image/jpeg');
});
