// Compatibility shim — the copied demo pages import route helpers from
// `@/wayfinder/*` (Laravel Wayfinder paths). These re-export the hand-written
// static route module so the copied files need no edits.
export { dashboard, home, login, logout } from "@/routes";
