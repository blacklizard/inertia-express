# Contributing

## Before you start

- For non-trivial changes, open an issue first. Alignment before code saves everyone time.
- Bug fixes and docs can go straight to a PR.
- Check existing issues and PRs to avoid duplicating work.

## Dev setup

Node ≥ 24 and pnpm are required.

```bash
git clone https://github.com/blacklizard/inertia-express.git
cd inertia-express
pnpm install
pnpm build
```

## Workflow

```bash
pnpm build          # build all packages
pnpm typecheck      # TypeScript across the whole monorepo
pnpm test           # unit tests (vitest)
pnpm lint           # ESLint (type-aware; run after build)
pnpm docs:dev       # VitePress docs site
```

CI runs `build → typecheck → test` and `build → lint` in parallel. All four must pass before a PR is merged.

## Conformance suite

The adapter is verified against the official Inertia Playwright suite (~1 150 browser tests). Run it locally to confirm protocol-level changes don't regress:

```bash
pnpm test:conformance
```

See [`conformance/HOW-IT-WORKS.md`](conformance/HOW-IT-WORKS.md) for details.

## Code style

- Follow the ESLint config — don't fight it, don't silence it.
- Descriptive names: verbs for functions (`resolveSharedProps`), role-suffix PascalCase for classes (`SsrWorkerPool`). No cryptic abbreviations.
- JSDoc block above every function, method, class, and constructor. One-line summary + `@param` for each argument.
- Comment the non-obvious **why** inside a function body. Skip the what.
- One class per file, default export, PascalCase filename.
- No cyclic imports — check before adding one. Cycles produce undefined-at-runtime and break tree-shaking.
- No speculative abstractions. Match scope to the task.

## Commits

Conventional Commits format, small and atomic — one logical change per commit.

```
feat(ssr): add worker-pool drain on SIGTERM
fix(flash): clear session key after first read
docs: update Redis cache example
```

Subject ≤ 50 chars. Body only when the *why* isn't obvious from the subject.

## Pull requests

- Fill in the PR template.
- Link the related issue (`Closes #N`).
- Keep the diff focused — unrelated cleanup goes in a separate PR.
- New features and non-trivial fixes need tests.
- Update docs if the change affects public API or behaviour.
