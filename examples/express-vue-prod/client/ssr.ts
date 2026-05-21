import type { Page } from "@inertiajs/core";
import { createInertiaApp, type InertiaApp, type InertiaAppProps } from "@inertiajs/vue3";
import { createSSRApp, type DefineComponent, h, type Plugin } from "vue";
import { renderToString } from "vue/server-renderer";

type SSRSetup = {
  el: null;
  App: InertiaApp;
  props: InertiaAppProps;
  plugin: Plugin;
};

export async function render(page: Page) {
  return createInertiaApp({
    page,
    render: renderToString,
    resolve: (name: string) => {
      const pages = import.meta.glob<DefineComponent>("./Pages/**/*.vue");
      const resolved = pages[`./Pages/${name}.vue`];
      if (!resolved) {
        throw new Error(`Page not found: ${name}`);
      }
      return resolved();
    },
    setup({ App, props, plugin }: SSRSetup) {
      return createSSRApp({ render: () => h(App, props) }).use(plugin);
    },
  } as never);
}
