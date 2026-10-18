// Browser-only: shrink large phone photos before upload so receipts stay well under the
// 5 MB limit on slow site connections, and turn other photo formats the phone may produce
// (HEIC, WebP) into JPEG, which the server accepts. PDFs and small JPEG/PNGs are sent unchanged.

const MAX_SIDE = 2000;
const SKIP_BELOW = 1.5 * 1024 * 1024; // 1.5 MB

export async function compressImage(file: File): Promise<File> {
  const jpegOrPng = /^image\/(jpeg|png)$/.test(file.type);
  if (!file.type.startsWith("image/") || (jpegOrPng && file.size < SKIP_BELOW)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // PNG transparency -> white for JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || (jpegOrPng && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // fall back to the original; the server still enforces the limit
  }
}

/** Replace every file under `field` in the FormData with a compressed version. */
export async function compressFormImages(fd: FormData, field: string): Promise<FormData> {
  const files = fd.getAll(field).filter((f): f is File => typeof f !== "string" && f.size > 0);
  fd.delete(field);
  for (const f of files) fd.append(field, await compressImage(f));
  return fd;
}
