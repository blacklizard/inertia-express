import { createInertiaApp } from "@inertiajs/react";
import { createRoot } from "react-dom/client";

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob("./Pages/**/*.tsx");
    const page = pages[`./Pages/${name}.tsx`];

    if (!page) {
      throw new Error(`Page not found: ${name}`);
    }

    return page();
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />);
  },
}).then((_res) => {
  console.info("inertia app ready");
});
