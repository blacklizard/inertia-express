// Compatibility shim for the NetworkError feature controller.
import { helper } from "@/routes";

/** Route that aborts with HTTP 403. */
export const httpException403 = helper(
  "/features/errors/http-exceptions/403",
);

/** Route that aborts with HTTP 404. */
export const httpException404 = helper(
  "/features/errors/http-exceptions/404",
);

/** Route that aborts with HTTP 500. */
export const httpException500 = helper(
  "/features/errors/http-exceptions/500",
);

/** Route that aborts with an unhandled status (HTTP 418). */
export const httpExceptionUnhandled = helper(
  "/features/errors/http-exceptions/unhandled",
);
