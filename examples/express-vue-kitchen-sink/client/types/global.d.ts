import type { Auth } from "./auth";

// Extend Vite's ImportMetaEnv for the app-name env var.
declare module "vite/client" {
  interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;
    [key: string]: string | boolean | undefined;
  }
}

// Augment Inertia's shared page props so `usePage().props.*` is typed.
declare module "@inertiajs/core" {
  interface PageProps {
    auth: Auth;
    sidebarOpen?: boolean;
    flash?: Record<string, unknown>;
    errors?: Record<string, string>;
  }
}

export {};
