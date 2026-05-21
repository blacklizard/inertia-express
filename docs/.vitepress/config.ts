import { defineConfig } from "vitepress";

export default defineConfig({
  title: "inertia-express",
  description:
    "A production-ready, TypeScript-first Inertia.js v3 server adapter for Express.js",
  // GitHub Pages project site: https://blacklizard.github.io/inertia-express/
  base: "/inertia-express/",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "API Reference", link: "/api/middleware" },
      {
        text: "Packages",
        items: [
          {
            text: "@blacklizard/inertia-express",
            link: "/packages/inertia-express",
          },
          {
            text: "@blacklizard/inertia-cache-redis",
            link: "/packages/inertia-cache-redis",
          },
          {
            text: "@blacklizard/inertia-ssr-worker",
            link: "/packages/inertia-ssr-worker",
          },
        ],
      },
      {
        text: "Examples",
        items: [
          { text: "Vue 3", link: "/examples/vue" },
          { text: "React", link: "/examples/react" },
          { text: "Production (Vue + SSR + Redis)", link: "/examples/production" },
        ],
      },
    ],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Installation", link: "/guide/installation" },
          { text: "Quick Start", link: "/guide/quick-start" },
        ],
      },
      {
        text: "Core Concepts",
        items: [
          { text: "Middleware", link: "/core/middleware" },
          { text: "Rendering Pages", link: "/core/rendering" },
          { text: "Props", link: "/core/props" },
          { text: "Redirects & Errors", link: "/core/redirects" },
          { text: "Asset Versioning", link: "/core/versioning" },
        ],
      },
      {
        text: "Advanced",
        items: [
          { text: "Server-Side Rendering", link: "/advanced/ssr" },
          { text: "View Cache", link: "/advanced/caching" },
          { text: "Prerendering", link: "/advanced/prerendering" },
          { text: "Edge Caching (CDN)", link: "/advanced/edge-caching" },
        ],
      },
      {
        text: "Packages",
        items: [
          {
            text: "inertia-express",
            link: "/packages/inertia-express",
          },
          {
            text: "inertia-cache-redis",
            link: "/packages/inertia-cache-redis",
          },
          {
            text: "inertia-ssr-worker",
            link: "/packages/inertia-ssr-worker",
          },
        ],
      },
      {
        text: "Examples",
        items: [
          { text: "Vue 3", link: "/examples/vue" },
          { text: "React", link: "/examples/react" },
          { text: "Production", link: "/examples/production" },
        ],
      },
      {
        text: "API Reference",
        items: [
          { text: "Middleware", link: "/api/middleware" },
          { text: "Props Helpers", link: "/api/props" },
          { text: "Types", link: "/api/types" },
          { text: "Utilities", link: "/api/utils" },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/blacklizard/inertia-express",
      },
    ],
    editLink: {
      pattern:
        "https://github.com/blacklizard/inertia-express/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
    },
    search: {
      provider: "local",
    },
  },
});
