import Image from "next/image";
import { redirect } from "next/navigation";
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
          <Image src="/brand/logo.png" alt={settings.companyName} width={385} height={83} className="h-auto w-64" priority />
          <div className="text-sm text-muted-foreground">Project Expense Manager</div>
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
