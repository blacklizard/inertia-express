// Compatibility shim for `@/wayfinder/routes/login`.
// Re-exports the hand-written login route helpers.
export { login as default } from "@/routes";
export { login } from "@/routes";

import { login } from "@/routes";

/** Login form-submit action — `store.form()` feeds the <Form> component. */
export const store = login.store;
