---
"@blacklizard/inertia-express": minor
---

Port inertia-laravel 3.x live props.

- `live(value, { on, channel, throttle? })` creates a live prop, and `always`, `optional`, `defer` and `once` descriptors gain `.live(options)`. Events are strings; channels are explicit, a bare string being a public channel and `{ name, type }` setting `private`, `presence` or `encrypted-private`. Merge, deep-merge and scroll props reject `.live()` (`Live updates are not supported on merge properties.`), and `.merge()` rejects a live prop.
- Pages carry `liveProps` metadata (`{ [path]: { listeners, throttle? } }`) with the reference gating: every live prop on the first load, including optional, deferred and already-held once props; on partial reloads only the props the reload includes or that bypass filtering; not for a prop rescued on that response. The key is omitted when no prop is live.
- `broadcastProps(props, onRescue?)` resolves every prop into the `{ __inertia: { props } }` payload a realtime server sends with an event, leaving out rescued props; `resolveBroadcastProps(props, onRescue?)` returns the bare props map. Neither takes a request, and the adapter does not open sockets.
- `req.inertia.socketId` carries the `X-Socket-Id` request header (`null` when absent), and `INERTIA_HEADERS.socketId` is `"x-socket-id"`.
- New exported types: `LiveProp`, `LiveOptions`, `LiveChannelInput`, `LiveChannel`, `LiveChannelType`, `LiveListener`, `LiveMetadata`; `InertiaPage` and `PropsMetadata` gain an optional `liveProps`.

`InertiaRequestInfo` gains a required `socketId: string | null`, so code that builds request-info literals by hand must add it, as with `isPrefetch` in this release.
