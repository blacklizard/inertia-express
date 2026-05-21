import inertia from "@inertiajs/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [inertia({ ssr: false }), react()],
  server: { port: 5173 },
});
