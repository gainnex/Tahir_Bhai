import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings-service";
import { readUpload } from "@/server/storage";

// Company logo, for logged-in users only (all uploads are private).
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Not logged in", { status: 401 });
  const { logoPath } = await getSettings();
  if (!logoPath) return new Response("No logo", { status: 404 });
  try {
    const data = await readUpload(logoPath);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": logoPath.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Logo file missing", { status: 404 });
  }
}
