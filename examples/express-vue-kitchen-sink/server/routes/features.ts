// Express route definitions for the Inertia feature-showcase pages.
// Each `GET` handler renders a `Features/...` Inertia page; the `POST`
// handlers back the demo forms by flashing a message and redirecting back.
// A minimal in-memory backend covers the data-loading demos.

import { defer, merge, optional } from "@blacklizard/inertia-express";
import type { Express, Request, Response } from "express";
import multer from "multer";
import { contacts } from "../data.js";
import { contactJson } from "../serializers.js";

/** Current timestamp in the `YYYY-MM-DD HH:MM:SS` shape the demo pages expect. */
function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

/** A random integer in `[min, max]` inclusive. */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Picks a random element from a non-empty array. */
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Sleeps for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Flashes a success message and redirects back to the referring page. */
function flashBack(req: Request, res: Response, message: string): void {
  res.inertiaFlash({ message });
  res.redirect(req.get("referer") ?? "/dashboard");
}

/**
 * Registers every feature-showcase route on the Express app.
 * Mirrors the Laravel `features` route group from the original demo.
 *
 * @param app The Express application to attach the routes to.
 */
export function registerFeatureRoutes(app: Express): void {
  registerFormRoutes(app);
  registerNavigationRoutes(app);
  registerDataLoadingRoutes(app);
  registerPrefetchingRoutes(app);
  registerStateRoutes(app);
  registerLayoutRoutes(app);
  registerEventRoutes(app);
  registerErrorRoutes(app);
  registerHttpRoutes(app);
}

/** Forms category — useForm, <Form> component, validation, dotted keys. */
function registerFormRoutes(app: Express): void {
  const base = "/features/forms";

  app.get(`${base}/use-form`, async (_req, res) => {
    await res.inertia("Features/Forms/UseForm", {});
  });
  app.post(`${base}/use-form`, (req, res) => {
    const name = String((req.body as Record<string, string>).name ?? "");
    flashBack(req, res, `Form submitted successfully! Name: ${name}`);
  });

  app.get(`${base}/form-component`, async (_req, res) => {
    await res.inertia("Features/Forms/FormComponent", {});
  });
  app.post(`${base}/form-component`, (req, res) => {
    const name = String((req.body as Record<string, string>).name ?? "");
    flashBack(req, res, `Form submitted successfully! Name: ${name}`);
  });

  app.get(`${base}/use-form-context`, async (_req, res) => {
    await res.inertia("Features/Forms/UseFormContext", {});
  });

  app.get(`${base}/validation`, async (_req, res) => {
    await res.inertia("Features/Forms/Validation", {});
  });
  app.post(`${base}/validation`, (req, res) => {
    const body = req.body as Record<string, string>;
    const errors: Record<string, string> = {};
    if (!body.title?.trim()) {
      errors.title = "The title field is required.";
    }
    if (!body.body?.trim()) {
      errors.body = "The body field is required.";
    }
    if (Object.keys(errors).length > 0) {
      res.inertiaErrors(errors);
      res.redirect(req.get("referer") ?? `${base}/validation`);
      return;
    }
    flashBack(req, res, "Primary form submitted successfully!");
  });
  app.post(`${base}/validation/secondary`, (req, res) => {
    const body = req.body as Record<string, string>;
    const errors: Record<string, string> = {};
    if (!body.title?.trim()) {
      errors.title = "The title field is required.";
    }
    if (!body.body?.trim()) {
      errors.body = "The body field is required.";
    }
    if (Object.keys(errors).length > 0) {
      res.inertiaErrors(errors, "secondaryForm");
      res.redirect(req.get("referer") ?? `${base}/validation`);
      return;
    }
    flashBack(req, res, "Secondary form submitted successfully!");
  });

  app.get(`${base}/optimistic-updates`, async (_req, res) => {
    await res.inertia("Features/Forms/OptimisticUpdates", {
      contacts: [...contacts]
        .sort((a, b) => b.id - a.id)
        .slice(0, 10)
        .map(contactJson),
    });
  });
  app.post(`${base}/optimistic-toggle/:id`, async (req, res, next) => {
    const contact = contacts.find((c) => c.id === Number(req.params.id));
    if (!contact) {
      next();
      return;
    }
    await sleep(1000);
    const body = req.body as Record<string, string>;
    if (body.simulate_error === "true" || body.simulate_error === "1") {
      res.inertiaErrors({
        contact:
          "Simulated validation error for optimistic update rollback demo.",
      });
      res.redirect(req.get("referer") ?? `${base}/optimistic-updates`);
      return;
    }
    contact.is_favorite = !contact.is_favorite;
    flashBack(
      req,
      res,
      contact.is_favorite ? "Added to favorites." : "Removed from favorites.",
    );
  });

  app.get(`${base}/dotted-keys`, async (_req, res) => {
    await res.inertia("Features/Forms/DottedKeys", {});
  });
  app.post(`${base}/dotted-keys`, (req, res) => {
    res.inertiaFlash({ message: "Form submitted successfully!", parsedData: req.body });
    res.redirect(req.get("referer") ?? `${base}/dotted-keys`);
  });

  // Memory storage — uploaded bytes are discarded after the request. This is a
  // demo; no persistence is needed, and disk writes would complicate deployment.
  const upload = multer({ storage: multer.memoryStorage() });

  app.get(`${base}/file-uploads`, async (_req, res) => {
    await res.inertia("Features/Forms/FileUploads", {});
  });
  app.post(
    `${base}/file-uploads`,
    upload.fields([
      { name: "photo", maxCount: 1 },
      { name: "files", maxCount: 5 },
    ]),
    (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const photo = files?.["photo"]?.[0];
      const docs = files?.["files"] ?? [];
      const parts: string[] = [];
      if (photo) {
        parts.push(`photo "${photo.originalname}" (${(photo.size / 1024).toFixed(1)} KB)`);
      }
      if (docs.length > 0) {
        parts.push(`${docs.length} file${docs.length === 1 ? "" : "s"}`);
      }
      const summary = parts.length > 0 ? parts.join(" + ") : "no files";
      flashBack(req, res, `Upload received: ${summary}.`);
    },
  );
}

/** Navigation category — links, preserve state/scroll, redirects, fragments. */
function registerNavigationRoutes(app: Express): void {
  const base = "/features/navigation";

  app.get(`${base}/links`, async (_req, res) => {
    await res.inertia("Features/Navigation/Links", { timestamp: timestamp() });
  });
  app.all(`${base}/links`, (req, res, next) => {
    if (req.method === "GET") {
      next();
      return;
    }
    flashBack(
      req,
      res,
      `${req.method.toUpperCase()} request received at ${timestamp()}`,
    );
  });

  app.get(`${base}/preserve-state`, async (_req, res) => {
    await res.inertia("Features/Navigation/PreserveState", {
      serverCounter: randomInt(1, 1000),
      timestamp: timestamp(),
    });
  });

  app.get(`${base}/preserve-scroll`, async (_req, res) => {
    await res.inertia("Features/Navigation/PreserveScroll", {
      timestamp: timestamp(),
    });
  });

  app.get(`${base}/view-transitions`, async (_req, res) => {
    await res.inertia("Features/Navigation/ViewTransitions", {});
  });

  app.get(`${base}/history-management`, async (req, res) => {
    await res.inertia("Features/Navigation/HistoryManagement", {
      visit: Number(req.query.visit ?? 0),
      timestamp: timestamp(),
    });
  });
  app.post(`${base}/history-management`, (_req, res) => {
    res.redirect(`${base}/history-management`);
  });

  app.get(`${base}/async-requests`, async (req, res) => {
    if (req.get("X-Inertia")) {
      await sleep(1000);
    }
    await res.inertia("Features/Navigation/AsyncRequests", {
      timestamp: timestamp(),
    });
  });
  app.get(`${base}/async-slow`, async (req, res) => {
    const delay = Math.min(Number(req.query.delay ?? 2), 5);
    await sleep(delay * 1000);
    await res.inertia("Features/Navigation/AsyncRequests", {
      timestamp: timestamp(),
    });
  });

  app.get(`${base}/manual-visits`, async (_req, res) => {
    await res.inertia("Features/Navigation/ManualVisits", {
      timestamp: timestamp(),
      counter: randomInt(1, 1000),
    });
  });

  app.get(`${base}/redirects`, async (_req, res) => {
    await res.inertia("Features/Navigation/Redirects", {
      timestamp: timestamp(),
    });
  });
  app.post(`${base}/redirects/back`, (req, res) => {
    flashBack(req, res, "Redirected back via redirect()->back()");
  });
  app.post(`${base}/redirects/to-route`, (_req, res) => {
    res.inertiaFlash({ message: "Redirected via to_route()" });
    res.redirect(`${base}/redirects`);
  });
  app.post(`${base}/redirects/external`, (_req, res) => {
    res.inertiaLocation("https://inertiajs.com");
  });

  app.get(`${base}/scroll-management`, async (_req, res) => {
    await res.inertia("Features/Navigation/ScrollManagement", {
      timestamp: timestamp(),
      items: Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        title: `Item #${i + 1}`,
        description: pick([
          "A short note about this item.",
          "Another descriptive sentence here.",
          "Details worth scrolling to read.",
          "This row demonstrates scroll restoration.",
        ]),
      })),
    });
  });

  app.get(`${base}/instant-visits`, async (_req, res) => {
    await res.inertia("Features/Navigation/InstantVisits", {
      sourceTimestamp: timestamp(),
      message: "This is the source page.",
    });
  });
  app.get(`${base}/instant-visit-target`, async (req, res) => {
    const delay = Math.min(Number(req.query.delay ?? 2), 5);
    await sleep(delay * 1000);
    await res.inertia("Features/Navigation/InstantVisitTarget", {
      greeting: "Hello from the server!",
      serverTimestamp: timestamp(),
      items: [
        { id: 1, name: "Server Item A" },
        { id: 2, name: "Server Item B" },
        { id: 3, name: "Server Item C" },
      ],
    });
  });

  app.get(`${base}/url-fragments`, async (_req, res) => {
    await res.inertia("Features/Navigation/UrlFragments", {
      timestamp: timestamp(),
    });
  });
  app.all(`${base}/url-fragments/redirect-hash`, (_req, res) => {
    res.redirect(`${base}/url-fragments#server-section`);
  });
  app.get(`${base}/url-fragments/preserve-target`, async (_req, res) => {
    await res.inertia("Features/Navigation/UrlFragments", {
      timestamp: timestamp(),
      redirectedFrom: "preserveFragment redirect",
    });
  });
  app.get(`${base}/url-fragments/preserve-redirect`, (_req, res) => {
    res.redirect(`${base}/url-fragments/preserve-target`);
  });
}

/** Data Loading category — deferred, partial, when-visible, polling, merging. */
function registerDataLoadingRoutes(app: Express): void {
  const base = "/features/data-loading";

  app.get(`${base}/deferred-props`, async (_req, res) => {
    await res.inertia("Features/DataLoading/DeferredProps", {
      quickStat: "Loaded instantly",
      slowStats: defer(async () => {
        await sleep(800);
        return {
          totalContacts: contacts.length,
          totalFavorites: contacts.filter((c) => c.is_favorite).length,
        };
      }),
      heavyData: defer(async () => {
        await sleep(1500);
        return [...contacts]
          .sort((a, b) => b.id - a.id)
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }));
      }, "heavy"),
      flakyReport: defer(async () => {
        await sleep(600);
        return { value: randomInt(1000, 9999) };
      }),
    });
  });

  app.get(`${base}/partial-reloads`, async (_req, res) => {
    await res.inertia("Features/DataLoading/PartialReloads", {
      users: [
        { id: 1, name: "Alice", role: "Admin" },
        { id: 2, name: "Bob", role: "Editor" },
        { id: 3, name: "Charlie", role: "Viewer" },
      ],
      stats: {
        total: contacts.length,
        favorites: contacts.filter((c) => c.is_favorite).length,
      },
      timestamp: timestamp(),
      randomNumber: randomInt(1, 1000),
    });
  });

  app.get(`${base}/when-visible`, async (_req, res) => {
    await res.inertia("Features/DataLoading/WhenVisible", {
      section1: optional(async () => {
        await sleep(500);
        return contacts.slice(0, 3).map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
        }));
      }),
      section2: optional(async () => {
        await sleep(800);
        return { totalContacts: contacts.length, generated: timestamp() };
      }),
      section3: optional(async () => {
        await sleep(600);
        return contacts
          .filter((c) => c.is_favorite)
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }));
      }),
    });
  });

  app.get(`${base}/polling`, async (_req, res) => {
    await res.inertia("Features/DataLoading/Polling", {
      currentTime: timestamp(),
      randomNumber: randomInt(1, 1000),
      contactCount: contacts.length,
    });
  });

  app.get(`${base}/prop-merging`, async (req, res) => {
    const resetProps = String(req.get("X-Inertia-Reset") ?? "").split(",");
    const isPartial = req.get("X-Inertia-Partial-Data") != null;
    let count: number;
    if (resetProps.includes("contacts")) {
      count = 1;
    } else if (isPartial) {
      count = Math.min((req.session.propMergingCount ?? 1) + 1, 5);
    } else {
      count = 1;
    }
    req.session.propMergingCount = count;

    const pool = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Charlie" },
      { id: 4, name: "Diana" },
      { id: 5, name: "Eve" },
    ];
    const time = timestamp().slice(11);

    await res.inertia("Features/DataLoading/PropMerging", {
      notifications: merge([
        {
          id: randomInt(1000, 9999),
          message: `Notification at ${time}`,
          type: pick(["info", "success", "warning", "error", "update"]),
        },
      ]),
      activities: merge([
        {
          id: randomInt(1000, 9999),
          action: pick(["created", "updated", "deleted", "archived"]),
          subject: pick(["Contact", "Organization", "Note", "Report"]),
          time,
        },
      ]),
      contacts: merge(
        pool.slice(0, count).map((c) => ({ ...c, updated: time })),
        "id",
      ),
      timestamp: timestamp(),
    });
  });

  app.get(`${base}/optional-props`, async (_req, res) => {
    await res.inertia("Features/DataLoading/OptionalProps", {
      regularData: {
        timestamp: timestamp(),
        message: "This prop is always included in the response.",
      },
      optionalData: optional(async () => {
        await sleep(500);
        return {
          generatedAt: timestamp(),
          contacts: contacts.slice(0, 3).map((c) => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
          })),
        };
      }),
      deferredData: defer(async () => {
        await sleep(600);
        return { generatedAt: timestamp(), totalContacts: contacts.length };
      }),
    });
  });

  // The Laravel demo uses `Inertia::once` for response-level caching; the
  // Express adapter has no equivalent, so fresh data is sent every visit.
  const renderOnceProps = async (page: 1 | 2, res: Response): Promise<void> => {
    await res.inertia("Features/DataLoading/OnceProps", {
      page,
      staticData: { generatedAt: timestamp(), randomId: randomInt(1000, 9999) },
      freshData: { generatedAt: timestamp(), value: randomInt(1, 1000) },
      expiringData: { generatedAt: timestamp(), value: randomInt(1, 1000) },
      aliasedData: { generatedAt: timestamp(), value: randomInt(1, 1000) },
      dynamicData: { timestamp: timestamp(), randomNumber: randomInt(1, 1000) },
    });
  };
  app.get(`${base}/once-props`, async (_req, res) => {
    await renderOnceProps(1, res);
  });
  app.get(`${base}/once-props/:page`, async (req, res) => {
    await renderOnceProps(req.params.page === "2" ? 2 : 1, res);
  });
}

/** Prefetching category — link prefetch, SWR, manual prefetch, cache. */
function registerPrefetchingRoutes(app: Express): void {
  const base = "/features/prefetching";
  const pages: Record<string, string> = {
    "link-prefetch": "Features/Prefetching/LinkPrefetch",
    "stale-while-revalidate": "Features/Prefetching/StaleWhileRevalidate",
    "manual-prefetch": "Features/Prefetching/ManualPrefetch",
    "cache-management": "Features/Prefetching/CacheManagement",
  };
  for (const [path, component] of Object.entries(pages)) {
    app.get(`${base}/${path}`, async (_req, res) => {
      await res.inertia(component, {});
    });
  }
}

/** State category — useRemember, flash data, shared props. */
function registerStateRoutes(app: Express): void {
  const base = "/features/state";

  app.get(`${base}/remember`, async (_req, res) => {
    await res.inertia("Features/State/Remember", {});
  });

  app.get(`${base}/flash-data`, async (_req, res) => {
    await res.inertia("Features/State/FlashData", {});
  });
  app.post(`${base}/flash-data`, (req, res) => {
    res.inertiaFlash({
      message: "This is a flash message from the server!",
      type: "success",
    });
    res.redirect(req.get("referer") ?? `${base}/flash-data`);
  });
  app.post(`${base}/flash-data/error`, (req, res) => {
    res.inertiaFlash({ message: "Something went wrong!", type: "error" });
    res.redirect(req.get("referer") ?? `${base}/flash-data`);
  });
  app.post(`${base}/flash-data/warning`, (req, res) => {
    res.inertiaFlash({ message: "Please check your input.", type: "warning" });
    res.redirect(req.get("referer") ?? `${base}/flash-data`);
  });

  app.get(`${base}/shared-props`, async (_req, res) => {
    await res.inertia("Features/State/SharedProps", {});
  });
}

/** Layouts category — persistent, nested, head, layout props. */
function registerLayoutRoutes(app: Express): void {
  const base = "/features/layouts";

  app.get(`${base}/persistent-layouts`, async (_req, res) => {
    await res.inertia("Features/Layouts/PersistentLayouts", {});
  });
  app.get(`${base}/persistent-layouts/page-2`, async (_req, res) => {
    await res.inertia("Features/Layouts/PersistentLayoutsPageTwo", {});
  });
  app.get(`${base}/nested-layouts`, async (_req, res) => {
    await res.inertia("Features/Layouts/NestedLayouts", {});
  });
  app.get(`${base}/head`, async (_req, res) => {
    await res.inertia("Features/Layouts/Head", {});
  });
  app.get(`${base}/layout-props`, async (_req, res) => {
    await res.inertia("Features/Layouts/LayoutProps", {});
  });
}

/** Events category — global events, visit callbacks, progress. */
function registerEventRoutes(app: Express): void {
  const base = "/features/events";

  app.get(`${base}/global-events`, async (_req, res) => {
    await res.inertia("Features/Events/GlobalEvents", {});
  });
  app.post(`${base}/global-events/action`, (req, res) => {
    flashBack(req, res, "Action completed successfully!");
  });

  app.get(`${base}/visit-callbacks`, async (_req, res) => {
    await res.inertia("Features/Events/VisitCallbacks", {});
  });
  app.post(`${base}/visit-callbacks/action`, (req, res) => {
    flashBack(req, res, "Visit callback action completed!");
  });

  app.get(`${base}/progress`, async (_req, res) => {
    await res.inertia("Features/Events/Progress", {});
  });
  app.get(`${base}/progress/slow`, async (_req, res) => {
    await sleep(2000);
    await res.inertia("Features/Events/Progress", {});
  });
}

/** Error Handling category — HTTP exceptions, network errors. */
function registerErrorRoutes(app: Express): void {
  const base = "/features/errors";

  app.get(`${base}/http-exceptions`, async (_req, res) => {
    await res.inertia("Features/Errors/HttpExceptions", {});
  });
  app.get(`${base}/http-exceptions/403`, (_req, res) => {
    res.status(403).send("Forbidden");
  });
  app.get(`${base}/http-exceptions/404`, (_req, res) => {
    res.status(404).send("Not Found");
  });
  app.get(`${base}/http-exceptions/500`, (_req, res) => {
    res.status(500).send("Server Error");
  });
  app.get(`${base}/http-exceptions/unhandled`, (_req, res) => {
    res.status(418).send("I'm a teapot");
  });

  app.get(`${base}/network-errors`, async (_req, res) => {
    await res.inertia("Features/Errors/NetworkErrors", {});
  });
}

/** HTTP category — useHttp composable demo plus its JSON API endpoint. */
function registerHttpRoutes(app: Express): void {
  const base = "/features/http";

  app.get(`${base}/use-http`, async (_req, res) => {
    await res.inertia("Features/Http/UseHttp", {});
  });
  app.post(`${base}/use-http/api`, (req, res) => {
    const name = String((req.body as Record<string, string>).name ?? "World");
    res.json({ message: `Hello, ${name}!`, timestamp: new Date().toISOString() });
  });
}
