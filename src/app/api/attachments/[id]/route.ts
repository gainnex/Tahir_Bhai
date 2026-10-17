import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { getCurrentUser } from "@/server/auth";
import { getAttachment } from "@/server/services/expense-service";
import { readUpload } from "@/server/storage";

// Receipts are private: only logged-in users who can see the expense may download them.
// ?download=1 forces a download; otherwise images/PDFs open in the browser.
export async function GET(request: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

  try {
    const att = await getAttachment(user, id);
    const data = await readUpload(att.filePath);
    const download = new URL(request.url).searchParams.has("download");
    const name = encodeURIComponent(att.fileName);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Length": String(data.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    if (e instanceof NotFoundError) return new Response("Not found", { status: 404 });
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return new Response("File missing on server", { status: 404 });
    throw e;
  }
}
