import type { Page } from "@inertiajs/core";
import { createInertiaApp } from "@inertiajs/vue3";
import { createSSRApp, type DefineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

const appName = process.env.VITE_APP_NAME || "Inertia Kitchen Sink";

// Called in-process by the Express server via vite.ssrLoadModule.
export function render(page: Page) {
  return createInertiaApp({
    page,
    title: (title) => (title ? `${title} - ${appName}` : appName),
    render: renderToString,
    resolve: (name) => {
      // Mirrors the page glob in client/main.ts — keep both in sync.
      const pages = {
        ...import.meta.glob<DefineComponent>("./pages/Crm/**/*.vue"),
        ...import.meta.glob<DefineComponent>("./pages/Contacts/**/*.vue"),
        ...import.meta.glob<DefineComponent>("./pages/Organizations/**/*.vue"),
        ...import.meta.glob<DefineComponent>("./pages/Auth/**/*.vue"),
        ...import.meta.glob<DefineComponent>([
          "./pages/Features/**/*.vue",
          "!./pages/Features/Forms/Precognition.vue",
          "!./pages/Features/Forms/Wayfinder.vue",
          "!./pages/Features/DataLoading/InfiniteScroll.vue",
        ]),
        ...import.meta.glob<DefineComponent>("./pages/ErrorPage.vue"),
      };
      const resolved = pages[`./pages/${name}.vue`];
      if (!resolved) {
        throw new Error(`Page not found: ${name}`);
      }
      return resolved();
    },
    setup({ App, props, plugin }) {
      return createSSRApp({ render: () => h(App, props) }).use(plugin);
    },
  } as Parameters<typeof createInertiaApp>[0]);
}
