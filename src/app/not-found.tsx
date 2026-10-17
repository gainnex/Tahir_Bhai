import Link from "next/link";
import { FileQuestion, LayoutDashboard } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="justify-items-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileQuestion className="size-5" />
          </div>
          <CardTitle className="text-xl">Page not found</CardTitle>
          <CardDescription>The page or record you are looking for does not exist.</CardDescription>
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
