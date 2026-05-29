---
"@blacklizard/inertia-express": minor
---

Add `res.inertiaError(status, message?)` and `renderErrorPage({ status, message? })`. Inertia requests render the client `Error` component with the status as a prop; plain browser loads and render/SSR failures fall back to a minimal standalone HTML page, so users never see a raw JSON error.
