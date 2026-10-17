import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { createVendorAction } from "../actions";
import { VendorForm } from "../vendor-form";

export const metadata = { title: "New vendor" };

export default async function NewVendorPage() {
  await requireRole("ADMIN", "ACCOUNTANT");
  return (
    <>
      <PageHeader title="New vendor" />
      <VendorForm action={createVendorAction} cancelHref="/vendors" />
    </>
  );
}
