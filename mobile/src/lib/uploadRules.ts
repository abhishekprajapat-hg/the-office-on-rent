/* Client-side mirror of backend/src/config/uploadStorage.js. Pure; unit tested. */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const extensionOf = (name: string) => (name.match(/\.([a-z0-9]{1,10})$/i)?.[1] || "").toLowerCase();

/* The type the server will accept for this file, inferred from its name when the picker gave none. */
export const mimeFor = (name: string, declared?: string | null) => {
  const fromName = EXTENSION_TYPES[extensionOf(name)];
  const given = String(declared || "").toLowerCase();
  if (given && Object.values(EXTENSION_TYPES).includes(given)) return given;
  return fromName || given || "application/octet-stream";
};

/* Why a file would be refused, or null when it's fine. */
export const uploadProblem = (file: { name: string; mimeType?: string | null; size?: number | null }) => {
  if (!EXTENSION_TYPES[extensionOf(file.name)]) return `"${file.name}" isn't a supported file type. Use a photo, PDF, Word or Excel file.`;
  if (file.size && file.size > MAX_UPLOAD_BYTES) return `"${file.name}" is larger than 25 MB.`;
  return null;
};

export const fileKind = (mimeType?: string, name = "") => {
  const type = mimeFor(name, mimeType);
  if (type.startsWith("image/")) return "image" as const;
  if (type === "application/pdf") return "pdf" as const;
  return "file" as const;
};

export const formatBytes = (bytes?: number | null) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};
