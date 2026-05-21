import inertia from "@inertiajs/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [inertia({ ssr: false }), vue()],
  server: { port: 5173 },
});
