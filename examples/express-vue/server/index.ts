import { defer, inertia, lazy } from "@blacklizard/inertia-express";
import express from "express";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  inertia({
    version: () => "1",
    sharedProps: () => ({
      auth: { user: { name: "Demo User" } },
    }),
    rootView: ({ page }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Inertia Vue Example</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="application/json" data-page="app">${JSON.stringify(page).replace(/</g, "\\u003C")}</script>
    <script type="module" src="http://localhost:5173/@vite/client"></script>
    <script type="module" src="http://localhost:5173/client/main.ts"></script>
  </body>
</html>`,
  }),
);

app.get("/", async (_req, res) => {
  await res.inertia("Home", {
    greeting: "Hello from Express + Inertia + Vue",
    timestamp: lazy(() => new Date().toISOString()),
    expensive: defer(async () => {
      await new Promise((r) => setTimeout(r, 250));
      return { computed: true };
    }, "secondary"),
  });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`server: http://localhost:${port}`);
});
