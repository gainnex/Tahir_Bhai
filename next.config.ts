import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma, bcrypt and the PDF/Excel libraries run only on the server.
  serverExternalPackages: ["@prisma/client", "@react-pdf/renderer", "exceljs"],
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
