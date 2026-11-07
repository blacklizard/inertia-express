# API: Types

## Core types

### `InertiaPage`

The page object sent to the client, following the Inertia v3 spec. Metadata keys are omitted when empty.

```ts
interface InertiaPage<TProps extends PageProps = PageProps> {
  component: string;
  props: TProps;
  url: string;
  version: string | null;
  clearHistory: boolean;
  encryptHistory: boolean;
  preserveFragment: boolean;                 // required since 3.0
  sharedProps?: string[];                    // top-level keys that came from shared props
  mergeProps?: string[];                     // paths the client appends
  prependProps?: string[];                   // paths the client prepends
  deepMergeProps?: string[];                 // paths the client deep-merges
  matchPropsOn?: string[];                   // dotted prop.field match-on paths
  deferredProps?: Record<string, string[]>;  // group → deferred prop paths
  rescuedProps?: string[];                   // deferred props whose producer threw and was rescued
  scrollProps?: Record<string, ScrollMetadata & { reset: boolean }>; // keyed by prop path
  onceProps?: Record<string, OnceMetadata>;  // keyed by once key
  flash?: unknown;                           // read-once flash data (top-level, not a prop)
}
```

### `InertiaRequestInfo`

Parsed Inertia XHR headers, available on `req.inertia`.

```ts
interface InertiaRequestInfo {
  isInertia: boolean;
  version: string | null;
  partialComponent: string | null;
  partialOnly: string[] | null;
  partialExcept: string[] | null;
  errorBag: string | null;
  resetKeys: string[] | null;
  exceptOnceProps: string[];          // X-Inertia-Except-Once-Props; [] when absent
  mergeIntent: "append" | "prepend";  // X-Inertia-Infinite-Scroll-Merge-Intent; "prepend" only on that exact value
  isPrefetch: boolean;                // true when Purpose, Sec-Purpose or X-Moz is "prefetch" (case-insensitive)
  method: string;
  url: string;
}
```

### `ScrollMetadata`

Pagination metadata for one [`scroll()`](/api/props#scroll-fn-options) prop.

```ts
interface ScrollMetadata {
  pageName: string;
  previousPage: number | string | null;
  nextPage: number | string | null;
  currentPage: number | string | null;
}
```

### `OnceMetadata`

Metadata for one [`once()`](/api/props#once-fn) prop: the prop path it resolves and its expiry as a millisecond epoch timestamp, or `null` when it never expires.

```ts
interface OnceMetadata {
  prop: string;
  expiresAt: number | null;
}
```

### `PropsMetadata`

Page-level metadata produced by [`resolveProps`](/api/props#resolveprops-input-core); every key is omitted when empty.

```ts
interface PropsMetadata {
  sharedProps?: string[];
  mergeProps?: string[];
  prependProps?: string[];
  deepMergeProps?: string[];
  matchPropsOn?: string[];
  deferredProps?: Record<string, string[]>;
  rescuedProps?: string[];
  scrollProps?: Record<string, ScrollMetadata & { reset: boolean }>;
  onceProps?: Record<string, OnceMetadata>;
}
```

### `RescueHandler`

Core-level rescue hook passed to `resolveProps`. The Express middleware's [`onRescue`](/api/middleware#inertiamiddlewareoptions) option adds the request as a third argument. A synchronous throw or rejected promise from the hook is logged with `console.error` and never propagated.

```ts
type RescueHandler = (error: unknown, path: string) => void;
```

### Prop descriptor types

`OptionalProp<T>`, `DeferProp<T>`, `AlwaysProp<T>`, `MergeProp<T>`, `OnceProp<T>`, `ScrollProp<T>` and `ScrollOptions<T>` are documented in [Props API → Type definitions](/api/props#type-definitions).

### `PageProps`

```ts
type PageProps = Record<string, unknown>;
```

### `ValidationErrors`

```ts
type ValidationErrors = Record<string, string>;
```

---

## Express types

### `InertiaMiddlewareOptions`

See [Middleware API](/api/middleware#inertia-middleware-options).

### `InertiaResponseOptions`

```ts
interface InertiaResponseOptions {
  url?: string;
  clearHistory?: boolean;
  encryptHistory?: boolean;
  preserveFragment?: boolean;
}
```

### `RootViewRenderer`

```ts
type RootViewRenderer = (input: RootViewInput) => string | Promise<string>;

interface RootViewInput {
  page: InertiaPage;
  req: Request;
  res: Response;
}
```

### `SsrRenderer`

```ts
type SsrRenderer = (input: SsrRendererInput) => Promise<SsrResult | null>;

interface SsrRendererInput {
  page: InertiaPage;
  req: Request;
  res: Response;
}
```

### `SsrResult`

```ts
interface SsrResult {
  body: string;
  head?: string | string[];
  bodyIsFullRoot?: boolean;
}
```

### `InertiaCacheOptions`

```ts
interface InertiaCacheOptions {
  store: SsrCacheStore;
  ttlSeconds?: number;
  keyPrefix?: string;
  vary?: (input: { req: Request; page: InertiaPage }) => boolean;
  discriminator?: (req: Request) => string | undefined;
  onError?: (op: "get" | "set" | "delete", err: unknown) => void;
}
```

### `ResInertiaApi`

Signature of `res.inertia()`:

```ts
type ResInertiaApi = <TProps extends PageProps>(
  component: string,
  props?: TProps,
  options?: InertiaResponseOptions,
) => Promise<void>;
```

---

## Cache types

### `SsrCacheStore`

Interface for cache backend implementations.

```ts
interface SsrCacheStore {
  get(key: string): Promise<SsrCacheEntry | null>;
  set(key: string, value: SsrCacheEntry, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

### `SsrCacheEntry`

```ts
interface SsrCacheEntry {
  head: string | string[];
  body: string;
  bodyIsFullRoot?: boolean;
  /** ISO timestamp when this entry was stored. */
  storedAt: string;
  /** Page object the entry corresponds to. */
  page: InertiaPage;
}
```

---

## Header constants

```ts
const INERTIA_HEADERS = {
  inertia: "x-inertia",
  version: "x-inertia-version",
  partialComponent: "x-inertia-partial-component",
  partialData: "x-inertia-partial-data",
  partialExcept: "x-inertia-partial-except",
  errorBag: "x-inertia-error-bag",
  reset: "x-inertia-reset",
  location: "x-inertia-location",
  exceptOnceProps: "x-inertia-except-once-props",
  mergeIntent: "x-inertia-infinite-scroll-merge-intent",
  redirect: "x-inertia-redirect",
};

const PREFETCH_HEADERS = ["purpose", "sec-purpose", "x-moz"]; // any one equal to "prefetch" marks a prefetch

const INERTIA_REDIRECT_STATUS = 303;
const INERTIA_LOCATION_STATUS = 409;
```

---

## Express module augmentation

The package extends `express-serve-static-core` automatically:

```ts
// Applied globally when @blacklizard/inertia-express is imported
declare module "express-serve-static-core" {
  interface Request {
    inertia?: InertiaRequestInfo;
  }
  interface Response {
    inertia: ResInertiaApi;
    inertiaLocation: (url: string) => void;
    inertiaErrors: (errors: ValidationErrors, bag?: string) => void;
  }
}
```
