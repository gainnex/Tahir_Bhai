import Link from "next/link";
import { LayoutDashboard, ShieldX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Forbidden() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="justify-items-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <ShieldX className="size-5" />
          </div>
          <CardTitle className="text-xl">Access denied</CardTitle>
          <CardDescription>You do not have permission to view this page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={buttonVariants()}>
            <LayoutDashboard /> Go to dashboard
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
