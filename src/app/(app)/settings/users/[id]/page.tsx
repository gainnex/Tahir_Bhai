import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getUser } from "@/server/services/user-service";
import { resetPasswordAction, updateUserAction } from "../../actions";
import { ResetPasswordForm, UserForm } from "../user-forms";

export const metadata = { title: "Edit user" };

export default async function EditUserPage({ params }: PageProps<"/settings/users/[id]">) {
  const actor = await requireRole("ADMIN");
  const user = await pageData(getUser(actor, parseId((await params).id)));

  return (
    <>
      <PageHeader title={user.name} description={<span className="font-mono">@{user.username}</span>} />
      <div className="grid max-w-3xl gap-6">
        {user.mustChangePassword && (
          <Notice variant="warning">This user must change their password at next login.</Notice>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <UserForm
              action={updateUserAction.bind(null, user.id)}
              user={user}
              isSelf={user.id === actor.id}
            />
          </CardContent>
        </Card>

        {user.role === "SITE_INCHARGE" && (
          <Card>
            <CardHeader>
              <CardTitle>Assigned projects</CardTitle>
              <CardDescription>
                Site In-charges only see and enter expenses for these projects. Assign them from the
                project&apos;s edit page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects assigned yet.</p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-md border border-border/60 text-sm">
                  {user.projects.map(({ project }) => (
                    <li key={project.id} className="px-3 py-2">
                      <Link href={`/projects/${project.id}`} className="text-primary hover:underline">
                        <span className="font-mono text-xs">{project.code}</span> — {project.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>
              Set a temporary password and give it to the user. They must change it at next login.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetPasswordForm action={resetPasswordAction.bind(null, user.id)} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
