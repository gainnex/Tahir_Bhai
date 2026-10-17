import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/server/auth";
import { createUserAction } from "../../actions";
import { UserForm } from "../user-forms";

export const metadata = { title: "New user" };

export default async function NewUserPage() {
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader title="New user" />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>The user will be asked to choose their own password at first login.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm action={createUserAction} />
        </CardContent>
      </Card>
    </>
  );
}
