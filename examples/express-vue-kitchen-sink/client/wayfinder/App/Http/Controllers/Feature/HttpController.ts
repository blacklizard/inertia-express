// Compatibility shim for the Http feature controller.
import { helper } from "@/routes";

/** JSON API endpoint backing the `useHttp` demo. */
export const useHttpApi = helper("/features/http/use-http/api", "post");
