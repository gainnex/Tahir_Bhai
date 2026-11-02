import { errorMessage, ForbiddenError, NotFoundError } from "@/lib/errors";
import { invoiceSchema } from "@/lib/validation/invoice";
import { parseForm } from "@/server/action-utils";
import { getCurrentUser } from "@/server/auth";
import { createInvoice } from "@/server/services/invoice-service";

// POST /api/projects/<id>/invoice — the invoice form -> .xlsx download.
// Validation / business errors come back as JSON { error, fieldErrors } for the form.
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/invoice">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Project not found." }, { status: 404 });

  const parsed = parseForm(invoiceSchema, await request.formData());
  if (!parsed.ok) return Response.json(parsed.state, { status: 400 });
  try {
    const { buffer, fileName } = await createInvoice(user, id, parsed.data);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const status = e instanceof ForbiddenError ? 403 : e instanceof NotFoundError ? 404 : 400;
    return Response.json({ error: errorMessage(e) }, { status });
  }
}
