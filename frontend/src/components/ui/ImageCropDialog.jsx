import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import Modal from "./Modal";
import { CROP_OUTPUT_SIZE, clampOffset, coverScale, cropOutputType, cropRect } from "./cropGeometry";

/*
 * Choosing which square of a photo becomes somebody's avatar.
 *
 * Phone cameras produce tall portraits, and an avatar is a small circle, so
 * without this the app silently kept the middle of whatever was uploaded -
 * which for a head-and-shoulders shot is usually a chest. Cropping here also
 * means what is stored is already square, so no layout downstream has to
 * rescue a photo of the wrong shape.
 *
 * Drag to move, the slider or the wheel to zoom. The image can never be pulled
 * away from an edge (see clampOffset), so the square is always fully covered.
 */
const VIEWPORT = 288;
const MAX_ZOOM = 4;

const ImageCropDialog = ({ open, file, onCancel, onConfirm, busy = false }) => {
  const [imageUrl, setImageUrl] = useState("");
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const dragRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    if (!file) { setImageUrl(""); return undefined; }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = coverScale(VIEWPORT, natural.width, natural.height);
  const scale = base * zoom;
  const displayedWidth = natural.width * scale;
  const displayedHeight = natural.height * scale;

  // Centre the photo the moment its size is known, and again on every zoom, so
  // the starting crop is the middle rather than a corner.
  const recentre = useCallback((nextScale, width, height) => {
    setOffset({
      x: (VIEWPORT - width * nextScale) / 2,
      y: (VIEWPORT - height * nextScale) / 2,
    });
  }, []);

  const handleLoad = (event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    setNatural({ width: naturalWidth, height: naturalHeight });
    recentre(coverScale(VIEWPORT, naturalWidth, naturalHeight), naturalWidth, naturalHeight);
  };

  const applyZoom = (nextZoom) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(1, Number(nextZoom) || 1));
    setZoom(clamped);
    // Zoom about the centre of the square: anything else drifts the subject.
    setOffset((current) => {
      const nextScale = base * clamped;
      const centreX = VIEWPORT / 2 - current.x;
      const centreY = VIEWPORT / 2 - current.y;
      const ratio = nextScale / scale || 1;
      return {
        x: clampOffset(VIEWPORT / 2 - centreX * ratio, VIEWPORT, natural.width * nextScale),
        y: clampOffset(VIEWPORT / 2 - centreY * ratio, VIEWPORT, natural.height * nextScale),
      };
    });
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: clampOffset(drag.offset.x + (event.clientX - drag.x), VIEWPORT, displayedWidth),
      y: clampOffset(drag.offset.y + (event.clientY - drag.y), VIEWPORT, displayedHeight),
    });
  };

  const endDrag = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleConfirm = async () => {
    const image = imageRef.current;
    if (!image || !natural.width) return;

    try {
      setWorking(true);
      setError("");
      const { sx, sy, size } = cropRect({
        viewport: VIEWPORT,
        naturalWidth: natural.width,
        naturalHeight: natural.height,
        scale,
        offsetX: offset.x,
        offsetY: offset.y,
      });

      const canvas = document.createElement("canvas");
      canvas.width = CROP_OUTPUT_SIZE;
      canvas.height = CROP_OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sx, sy, size, size, 0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);

      const type = cropOutputType(file?.type);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
      if (!blob) throw new Error("Could not read the cropped image");

      const name = String(file?.name || "photo").replace(/\.[^.]+$/, "");
      onConfirm(new File([blob], `${name}.${type === "image/png" ? "png" : "jpg"}`, { type }));
    } catch (cropError) {
      setError(cropError.message || "Could not crop this image");
    } finally {
      setWorking(false);
    }
  };

  const pending = busy || working;

  return (
    <Modal
      open={open}
      title="Crop your photo"
      description="Drag to reposition, zoom to fit. The circle is what people will see."
      onClose={pending ? () => {} : onCancel}
      size="sm"
      footer={(
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || !natural.width}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : null}
            Save photo
          </button>
        </div>
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="relative touch-none overflow-hidden rounded-xl bg-slate-900"
          style={{ width: VIEWPORT, height: VIEWPORT, maxWidth: "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={(event) => applyZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15))}
        >
          {imageUrl ? (
            <img
              ref={imageRef}
              src={imageUrl}
              alt=""
              onLoad={handleLoad}
              draggable={false}
              style={{
                position: "absolute",
                left: offset.x,
                top: offset.y,
                width: displayedWidth || undefined,
                height: displayedHeight || undefined,
                maxWidth: "none",
                cursor: "grab",
                userSelect: "none",
              }}
            />
          ) : null}

          {/* The circle is a guide only - it must not eat the drag. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={{ boxShadow: "0 0 0 9999px rgba(15,23,42,0.55)", borderRadius: "50%" }}
          />
        </div>

        <div className="flex w-full max-w-[288px] items-center gap-3">
          <ZoomOut size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
          <input
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={(event) => applyZoom(event.target.value)}
            aria-label="Zoom"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600 dark:bg-slate-700"
          />
          <ZoomIn size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
        </div>

        {error ? (
          <p role="alert" className="w-full rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[12.5px] text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
};

export default ImageCropDialog;
