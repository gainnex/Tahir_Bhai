import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getVendorForEdit } from "@/server/services/vendor-service";
import { deleteVendorAction, updateVendorAction } from "../../actions";
import { VendorForm } from "../../vendor-form";

export const metadata = { title: "Edit vendor" };

export default async function EditVendorPage({ params }: PageProps<"/vendors/[id]/edit">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const v = await pageData(getVendorForEdit(actor, id));
  return (
    <>
      <PageHeader title={`Edit ${v.name}`} />
      <VendorForm
        action={updateVendorAction.bind(null, id)}
        deleteAction={deleteVendorAction.bind(null, id)}
        cancelHref={`/vendors/${id}`}
        values={{
          name: v.name,
          type: v.type,
          phone: v.phone ?? "",
          ntn: v.ntn ?? "",
          address: v.address ?? "",
          notes: v.notes ?? "",
        }}
      />
    </>
  );
}
