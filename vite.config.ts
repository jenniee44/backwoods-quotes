import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: process.env.BACKWOODS_E2E === "1" ? undefined : {
    proxy: { "/api": { target: "http://127.0.0.1:8788", changeOrigin: true } },
  },
});
