---
title: GitHub Copilot Instructions
description: Repository-wide guidance for AI-assisted work on Sunsum
---

## Project context

Sunsum is community-owned solar virtual power plant software. Treat energy
control, participant identity, billing, telemetry, and device integrations as
high-impact domains where incorrect behavior can create safety, privacy, or
financial harm.

## Review priorities

When reviewing a pull request, prioritize exploitable security weaknesses,
incorrect behavior, authorization gaps, unsafe device commands, privacy or
financial risks, dependency risk, and missing tests. Explain the concrete
failure scenario and point to the smallest relevant code location. Avoid
blocking on cosmetic preferences or speculative concerns without an observable
impact.

## Working rules

- Read the relevant issue, nearby code, tests, and documentation before editing
- Make focused changes that satisfy explicit acceptance criteria
- Prefer existing project patterns and standard libraries over new abstractions
- Do not invent device, tariff, regulatory, or market requirements
- State assumptions when requirements are incomplete
- Preserve unrelated work and avoid broad refactors without approval
- Never add secrets, personal data, production telemetry, or credentials
- Pin dependencies through the selected package manager and justify additions

## Correctness and safety

- Represent physical quantities with explicit units and validated ranges
- Treat time zones, daylight saving transitions, and interval boundaries explicitly
- Use decimal-safe arithmetic for money and document rounding rules
- Default device-control paths to fail-safe behavior and bounded commands
- Enforce authorization at service boundaries, not only in the user interface
- Keep audit-relevant actions attributable and avoid logging sensitive values
- Validate all data received from devices, users, files, and external services

## Validation

Add or update focused tests for behavior changes. Cover boundary values,
failure paths, authorization, time handling, and unit conversions when they
apply. Run the narrowest relevant checks first, then the repository-wide checks
before finishing. Report any check that could not be run.

Do not claim regulatory compliance, production readiness, security, or test
coverage without verifiable evidence.

## Database and Azure delivery

- Use Bicep and Azure CLI for Linux App Service **F1 code deployment** and
  separately billable Azure PostgreSQL. No orchestration framework is required.
  Do not add ACR, Container Apps, or a paid web-tier upgrade.
- The existing application client and `PostgresBackendStore` live in
  `src/backend/db`; `src/backend/composition.ts` selects that store with
  `SUNSUM_STORE=db`, otherwise the fixture store is the default. New clients for
  the separate Azure/operator tooling belong in `src/backend/infrastructure/database`.
  Inject stores at the composition boundary; core, handlers, and browser code
  must not construct clients. `/join` still saves nothing and endpoint identities
  remain fixed demo principals, not authenticated participants.
- Application persistence uses `DATABASE_URL` and `SUNSUM_DB_AUTH`; the separate
  connection/migration tooling uses `PG*` and `SUNSUM_DATABASE_AUTH`. Supplying
  `PG*` alone does not activate or configure the application store. Do not merge
  the contracts or add another client implementation without a reviewed change.
  Azure deployments must retain managed-identity authentication and verified TLS.
  Never use `NEXT_PUBLIC_*` for database configuration, log credentials, disable
  certificate checks, or fall back to demo data after an explicitly requested
  database operation fails.
- Provisioning, provider registration, narrow firewall approvals, Entra SQL
  bootstrap, migrations, and routine code deployment are distinct operations.
  Setup documentation is not permission to perform a cloud write.
