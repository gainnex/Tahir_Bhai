import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma, bcrypt and the PDF/Excel libraries run only on the server.
  serverExternalPackages: ["@prisma/client", "@react-pdf/renderer", "exceljs"],
  // The service worker must never be cached, so phones pick up a new version straight away.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  experimental: {
    // Enables forbidden() + app/forbidden.tsx for role checks in pages
    authInterrupts: true,
    serverActions: {
      // Receipts are max 5 MB each; allow a few per expense form submit.
      bodySizeLimit: "30mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
