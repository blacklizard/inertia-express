import { inertia, lazy } from "@blacklizard/inertia-express";
import express from "express";

const app = express();
app.use(express.json());

app.use(
  inertia({
    version: "1",
    sharedProps: () => ({
      auth: { user: { name: "Demo User" } },
    }),
    rootView: ({ page }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Inertia React Example</title>
  </head>
  <body>
    <div id="app"></div>
    <script data-page="app" type="application/json">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>
    <script type="module">
      import RefreshRuntime from "http://localhost:5173/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script type="module" src="http://localhost:5173/@vite/client"></script>
    <script type="module" src="http://localhost:5173/client/main.tsx"></script>
  </body>
</html>`,
  }),
);

app.get("/", async (_req, res) => {
  await res.inertia("Home", {
    greeting: "Hello from Express + Inertia + React",
    now: lazy(() => Date.now()),
  });
});

app.listen(3000, () => console.log("http://localhost:3000"));
