/*
 * The arithmetic behind the square crop box, kept out of the component so it
 * can be reasoned about and tested without a DOM.
 *
 * Everything is expressed against a square viewport of side `viewport` CSS
 * pixels. The image is drawn at `scale` and positioned by an offset which is
 * the image's top-left corner relative to the viewport's top-left, so both
 * offsets are zero or negative while the image covers the box.
 */

/** The scale at which the image exactly covers the square - the smallest that leaves no gap. */
export const coverScale = (viewport, naturalWidth, naturalHeight) => {
  if (!viewport || !naturalWidth || !naturalHeight) return 1;
  return Math.max(viewport / naturalWidth, viewport / naturalHeight);
};

/**
 * Keeps the image covering the viewport.
 *
 * Without this a drag could pull the photo away from an edge and leave a
 * transparent wedge inside the avatar, which then gets baked into the upload.
 */
export const clampOffset = (offset, viewport, displayedSize) => {
  const min = Math.min(0, viewport - displayedSize);
  if (!Number.isFinite(offset)) return min / 2;
  return Math.min(0, Math.max(min, offset));
};

/**
 * The region of the original image the viewport is showing, in the image's own
 * pixels - which is exactly what canvas drawImage wants as its source rect.
 *
 * @returns {{sx: number, sy: number, size: number}}
 */
export const cropRect = ({ viewport, naturalWidth, naturalHeight, scale, offsetX, offsetY }) => {
  const safeScale = scale > 0 ? scale : coverScale(viewport, naturalWidth, naturalHeight);
  const displayedWidth = naturalWidth * safeScale;
  const displayedHeight = naturalHeight * safeScale;

  const x = clampOffset(offsetX, viewport, displayedWidth);
  const y = clampOffset(offsetY, viewport, displayedHeight);

  // The viewport is square, so the source region is too - which is what keeps
  // the result from being stretched when it is later drawn into a square canvas.
  const size = viewport / safeScale;

  return {
    sx: Math.max(0, Math.min(naturalWidth - size, -x / safeScale)),
    sy: Math.max(0, Math.min(naturalHeight - size, -y / safeScale)),
    size,
  };
};

/*
 * Avatars are shown at a few dozen pixels and the server caps profile images
 * at a 512px edge anyway, so there is nothing to gain from writing a larger
 * square than that.
 */
export const CROP_OUTPUT_SIZE = 512;

/** PNG only where it buys something: a source that may carry transparency. */
export const cropOutputType = (sourceType) => (String(sourceType) === "image/png" ? "image/png" : "image/jpeg");
