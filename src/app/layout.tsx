import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Project Expense Manager", template: "%s · Project Expense Manager" },
  description: "Record and report project expenses",
  applicationName: "Project Expense Manager",
  // Home-screen app on iPhone (Safari reads these instead of the manifest)
  appleWebApp: { capable: true, title: "Expenses", statusBarStyle: "default" },
  // Tab and home-screen icons come from app/icon.png and app/apple-icon.png (file conventions)
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the phone quick-add button respect the home-indicator area
  themeColor: "#1c398e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
