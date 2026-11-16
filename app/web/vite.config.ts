import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 本番は S3＋CloudFront に dist/ を置く静的SPA（ADR-011）
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: "127.0.0.1" },
});
