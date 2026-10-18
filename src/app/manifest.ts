import type { MetadataRoute } from "next";

// Installable app for site staff (changes/changes.pdf §10: "mobile app for site staff to enter
// expenses and snap receipts on the spot"). Linked automatically by Next.js as /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Project Expense Manager",
    short_name: "Expenses",
    description: "Record project expenses and snap receipts on site",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1c398e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon (Android) for these
    shortcuts: [
      { name: "New expense", short_name: "Expense", url: "/expenses/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Attendance", short_name: "Attendance", url: "/attendance", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
