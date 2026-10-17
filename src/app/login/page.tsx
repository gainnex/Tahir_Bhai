import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings-service";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  const settings = await getSettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-sidebar text-sidebar-primary-foreground shadow-sm">
            <HardHat className="size-5" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">{settings.companyName}</div>
            <div className="text-sm text-muted-foreground">Project Expense Manager</div>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Enter your username or email and password to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={typeof next === "string" ? next : undefined} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
