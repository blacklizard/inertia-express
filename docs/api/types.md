# API: Types

## Core types

### `InertiaPage`

The page object sent to the client, following the Inertia v3 spec.

```ts
interface InertiaPage<TProps extends PageProps = PageProps> {
  component: string;
  props: TProps;
  url: string;
  version: string | null;
  clearHistory: boolean;
  encryptHistory: boolean;
  deferredProps?: Record<string, string[]>;
  mergeProps?: string[];
  deepMergeProps?: string[];
  matchPropsOn?: string[];
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
  method: string;
  url: string;
}
```

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
};

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
