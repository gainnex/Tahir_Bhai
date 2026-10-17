import Link from "next/link";
import { ArrowLeft, KeyRound, LogOut } from "lucide-react";
import { Notice } from "@/components/notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth";
import { logoutAction } from "../login/actions";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="size-4" />
          </div>
          <CardTitle className="text-xl">Change password</CardTitle>
          <CardDescription>
            Signed in as <span className="font-mono">{user.username}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {user.mustChangePassword && (
            <Notice variant="warning">You must set a new password before continuing.</Notice>
          )}
          <ChangePasswordForm />
        </CardContent>
        <CardFooter className="justify-between border-t border-border/60 [.border-t]:pt-4">
          {!user.mustChangePassword ? (
            <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ArrowLeft /> Back
            </Link>
          ) : (
            <span />
          )}
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <LogOut /> Sign out
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}
