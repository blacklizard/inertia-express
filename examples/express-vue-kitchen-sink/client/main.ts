import { createInertiaApp } from "@inertiajs/vue3";
import { createSSRApp, type DefineComponent, h } from "vue";
import { initializeTheme } from "@/composables/useAppearance";
import "./styles.css";

const appName = import.meta.env.VITE_APP_NAME || "Inertia Kitchen Sink";

// The server SSR-renders the first paint, so the client hydrates with
// createSSRApp rather than mounting a fresh tree.
createInertiaApp({
  title: (title) => (title ? `${title} - ${appName}` : appName),
  resolve: (name) => {
    // Ported sections: CRM, Auth, and the feature-showcase pages. The
    // negative globs exclude pages that hard-depend on Laravel-only runtime:
    // Precognition (requires laravel-precognition-vue), Wayfinder (codegen),
    // and InfiniteScroll (Inertia::scroll server helper).
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
    const page = pages[`./pages/${name}.vue`];
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

// Apply the persisted light / dark preference on load.
initializeTheme();
