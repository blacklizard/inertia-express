// Compatibility shim for `@/wayfinder/App/Http/Controllers/Feature/FormController`.
// Wayfinder-style callable helpers for the ported Forms feature routes.
import { helper } from "@/routes";

/** POST handler for the `useForm` demo. */
export const submitUseForm = helper("/features/forms/use-form", "post");

/** POST handler for the `<Form>` component demo. */
export const submitFormComponent = helper(
  "/features/forms/form-component",
  "post",
);

/** Primary POST handler for the validation demo. */
export const submitValidation = helper("/features/forms/validation", "post");

/** Secondary (error-bag) POST handler for the validation demo. */
export const submitValidationSecondary = helper(
  "/features/forms/validation/secondary",
  "post",
);

/** POST handler for the dotted-keys form demo. */
export const submitDottedKeys = helper("/features/forms/dotted-keys", "post");

/** POST handler for the file-uploads demo. */
export const submitFileUploads = helper("/features/forms/file-uploads", "post");
