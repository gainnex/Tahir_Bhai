import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { getCurrentUser } from "@/server/auth";
import { billToPdf } from "@/server/reports/billing-pdf";
import { billDocument } from "@/server/services/billing-service";
import { getSettings } from "@/server/services/settings-service";

// GET /api/billing/bills/<id> — the printable running bill (PDF).
export async function GET(_request: Request, ctx: RouteContext<"/api/billing/bills/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  try {
    const doc = await billDocument(user, id);
    const body = await billToPdf(doc, await getSettings());
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.billNo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response(e.message, { status: 403 });
    if (e instanceof NotFoundError) return new Response(e.message, { status: 404 });
    throw e;
  }
}
