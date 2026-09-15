---
title: Sunsum Community Solar Virtual Power Plant
description: Community-owned virtual power plant software for the Microsoft 2026 Global Hackathon
---

## Overview

Sunsum is a Microsoft 2026 Global Hackathon project exploring software for a
community-owned solar virtual power plant. The project is currently in its
initial implementation phase.

## Goals

- Coordinate community solar generation, storage, and flexible demand
- Give participants transparent insight into energy and financial outcomes
- Support secure, reliable integrations with energy devices and services
- Build an open foundation that communities can adapt to local needs

## Project status

This contribution introduces the **WS1 public frontend foundation** plus the
**New User / Create Profile** workflow, built with Next.js and TypeScript. It is
not the complete hackathon MVP.

Available routes:

| Route   | Purpose                                                          |
| ------- | ---------------------------------------------------------------- |
| `/`     | Value proposition, the three ways to take part, journey, and FAQ |
| `/join` | The guided create-profile workflow                               |

`/join` accepts an optional `?start=` parameter so the landing page can open the
flow with a guided answer already selected. Unrecognised values are ignored.

**Nothing is saved.** The flow validates every answer and shows the assembled
profile back to you, but no account is created, no request leaves the browser,
and no value is persisted. The wire format is not settled yet, so the summary is
a local review rather than a preview of a request. The three federated sign-in
options are shown as unavailable because no identity provider is connected. A
password is validated in the browser, is never written into the profile draft or
the summary, and is discarded when the flow finishes; a browser password manager
may still offer to remember it, as on any sign-up form.

Site submission, screening, persistence, operator decisions, private documents,
and investor authorization require the backend and domain handoffs described in
[the contract register](docs/ws1/contracts.md).

The visual baseline is provisional, informed by earlier SolarEase mockups and
the project's VPP flow board. Team UX acceptance and the final Azure hosting
choice remain open. There is no Azure deployment, database, identity provider,
or hidden mock-service fallback in this increment.

## Application structure

| Path | Contains |
| --- | --- |
| `app/` | Routes, root layout and the shared `globals.css` |
| `src/domain/` | Shared vocabulary: roles, journey stages, participant types, guided prompts |
| `src/features/participation/` | Landing page, public shell and entry paths |
| `src/features/onboarding/` | The create-profile flow, its step model and validation |
| `src/components/ui/` | Domain-neutral controls and form primitives |
| `src/styles/` | Design tokens and shared layout helpers |
| `tests/` | Unit, component, boundary and browser tests |
| `docs/ws1/` | Architecture boundaries and the contract register |
| `infrastructure/` | Placeholders for templates, diagrams and infrastructure docs |

Routes compose a feature's public entry point. Features never import each
other's internals, and the domain layer depends on nothing above it. These
boundaries are enforced by ESLint and asserted in `tests/unit/architecture.test.ts`.

This replaces the earlier single-page template and its `app/api/submit` echo
route; both were scaffolding for this interface rather than product behaviour.

## Local development

Use Node.js 22.22.2 or newer within the Node 22 release line, and npm 10.
No credentials or environment file are needed for the public foundation.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. For a production-build check:

```sh
npm run build
npm run start
```

The lockfile pins versions and integrity without embedding a contributor's
registry/proxy URLs. npm resolves those locked versions through the configured
registry. Do not add credentials or a private registry address to `.npmrc`.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev --audit-level=high
npx --yes markdownlint-cli2@0.18.1 "**/*.md" "#node_modules"
npx --yes prettier@3.6.2 --check "**/*.{json,yml,yaml}"
```

The browser suite starts its own production server on port 3117; run the build
first. If that port is occupied, set `PLAYWRIGHT_PORT` to an unused port. It
does not attach to or stop an unrelated existing server. Linux CI also installs
Chromium's system dependencies with `npx playwright install --with-deps chromium`.

Browser screenshots and reports are generated under `test-results` and
`playwright-report`, which are not source files. npm owns the generated lockfile
format; authored JSON/YAML remains covered by Prettier.

These checks exercise the public foundation. They do not establish a working
three-role backend, complete accessibility conformance, hosted CI success, or
production readiness.

See [architecture and extension boundaries](docs/ws1/architecture.md) before
adding a feature. Proposals should begin as a GitHub issue so assumptions,
scope, ownership, and acceptance criteria are visible before implementation.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. By
participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Report security concerns privately according to [SECURITY.md](SECURITY.md).

## License

This project is licensed under the [MIT License](LICENSE).
