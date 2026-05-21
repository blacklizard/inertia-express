import type { Page } from "@inertiajs/core";
import { createInertiaApp } from "@inertiajs/vue3";
import { createSSRApp, type DefineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";

// Called in-process by the Express server via vite.ssrLoadModule.
export function render(page: Page) {
  return createInertiaApp({
    page,
    render: renderToString,
    resolve: (name) => {
      const pages = import.meta.glob<DefineComponent>("./Pages/**/*.vue");
      const resolved = pages[`./Pages/${name}.vue`];
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
