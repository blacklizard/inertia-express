import { createInertiaApp } from "@inertiajs/vue3";
import { createSSRApp, type DefineComponent, h } from "vue";

// The server SSR-renders the first paint, so the client hydrates with
// createSSRApp rather than mounting a fresh tree.
createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob<DefineComponent>("./Pages/**/*.vue");
    const page = pages[`./Pages/${name}.vue`];
    if (!page) {
      throw new Error(`Page not found: ${name}`);
    }
    return page();
  },
  setup({ el, App, props, plugin }) {
    createSSRApp({ render: () => h(App, props) })
      .use(plugin)
      .mount(el);
  },
});
