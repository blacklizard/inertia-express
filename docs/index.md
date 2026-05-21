---
layout: home

hero:
  name: "inertia-express"
  text: "Inertia.js v3 for Express"
  tagline: "Production-ready, TypeScript-first server adapter. Build modern SPAs with classic server-side routing."
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: Quick Start
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/blacklizard/inertia-express

features:
  - title: Full Inertia.js v3 Protocol
    details: Complete implementation of the v3 spec — partial reloads, deferred props, asset versioning, history encryption, and more.
  - title: TypeScript-First
    details: Declaration merging extends Express types so res.inertia(), req.inertia, and res.inertiaLocation() are fully typed out of the box.
  - title: Production SSR
    details: Out-of-process SSR worker with timeout, retries, circuit breaker, and graceful drain. Pairs with an in-process or Redis view cache.
  - title: Smart Prop Loading
    details: lazy(), optional(), defer(), always(), merge(), and deepMerge() helpers give fine-grained control over when and how props are evaluated and sent to the client.
  - title: CDN Ready
    details: Pluggable edge-cache policy applies Cache-Control headers with correct Vary directives so CDNs can safely cache HTML shells.
  - title: Framework-Agnostic Core
    details: The core is framework-agnostic. The Express adapter is built on top of it, so Fastify, Hono, and NestJS adapters are straightforward to build.
---
