import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { AppError } from "@/lib/errors";

// Files live in a private Vercel Blob store when BLOB_READ_WRITE_TOKEN is set (hosted
// deployments, whose disk is read-only), otherwise on local disk under UPLOAD_DIR.
// Either way they are only ever served through route handlers that check the user's
// session and access rights.

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const TYPES = {
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "application/pdf": { ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
} as const;
export type UploadMime = keyof typeof TYPES;

export const RECEIPT_TYPES: UploadMime[] = ["image/jpeg", "image/png", "application/pdf"];
export const IMAGE_TYPES: UploadMime[] = ["image/jpeg", "image/png"];

export function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || "./uploads");
}

export type StoredFile = { fileName: string; filePath: string; mimeType: UploadMime; sizeBytes: number };

/** Check type (by content, not just the extension) and size, then write the file. */
export async function saveUpload(file: File, folder: string, allowed: UploadMime[]): Promise<StoredFile> {
  const label = `"${file.name}"`;
  if (file.size === 0) throw new AppError(`${label} is empty.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError(`${label} is larger than 5 MB.`);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = (Object.keys(TYPES) as UploadMime[]).find((m) =>
    TYPES[m].magic.every((b, i) => bytes[i] === b),
  );
  if (!mime || !allowed.includes(mime)) {
    const names = allowed.map((m) => TYPES[m].ext.toUpperCase()).join(", ");
    throw new AppError(`${label} is not an allowed file type (${names}).`);
  }

  const now = new Date();
  const rel = path.posix.join(
    folder,
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    `${randomUUID()}.${TYPES[mime].ext}`,
  );
  if (blobEnabled()) {
    await put(rel, Buffer.from(bytes), { access: "private", contentType: mime });
  } else {
    const abs = resolveUpload(rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
  }

  return {
    fileName: path.basename(file.name).slice(0, 200) || `file.${TYPES[mime].ext}`,
    filePath: rel,
    mimeType: mime,
    sizeBytes: file.size,
  };
}

/** Absolute path for a stored relative path; refuses anything outside UPLOAD_DIR. */
export function resolveUpload(rel: string) {
  const root = uploadRoot();
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new AppError("Invalid file path.");
  return abs;
}

/** File contents; a missing file throws an error with code "ENOENT" (like fs does). */
export async function readUpload(rel: string): Promise<Uint8Array> {
  if (!blobEnabled()) return readFile(resolveUpload(rel));
  const res = await get(rel, { access: "private" });
  if (!res || !res.stream) throw Object.assign(new Error(`File not found: ${rel}`), { code: "ENOENT" });
  return new Uint8Array(await new Response(res.stream).arrayBuffer());
}

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Non-empty File objects from a multi-file input. */
export function filesFrom(formData: FormData, name: string): File[] {
  return formData.getAll(name).filter((f): f is File => typeof f !== "string" && f.size > 0);
}
