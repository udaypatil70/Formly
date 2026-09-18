import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const path = id.split("node_modules")[1];
          if (!path) return undefined;
          if (path.includes("recharts") || path.includes("/d3-")) return "charts";
          if (path.includes("@dnd-kit")) return "dnd-kit";
          if (path.includes("@radix-ui") || path.includes("cmdk") || path.includes("sonner") || path.includes("react-resizable-panels") || path.includes("embla-carousel")) return "ui";
          if (path.includes("lucide-react")) return "icons";
          if (path.includes("react-hook-form") || path.includes("@hookform")) return "forms";
          if (path.includes("react-day-picker") || path.includes("date-fns")) return "date";
          if (path.includes("react-router-dom")) return "router";
          if (path.includes("@tanstack") || path.includes("@trpc")) return "query";
          if (path.includes("react-dom")) return "react";
          if (path.includes("react/") || path.startsWith("/react")) return "react";
          return undefined;
        },
      },
    },
  },
});