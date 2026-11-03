# Independent source repository

This repository is the sole maintained source of the Codex Web UI and reusable service. Make changes here; do not edit exported archives, deployment snapshots, or copies in an enclosing host application.

Keep the host behind the documented factory and versioned HTTP interface. Authentication, existing engine ownership, private storage, notification providers, devices, credentials, and host administration remain injected host responsibilities. Desktop integration is optional. Do not import a private host application into this package.

Before committing, run `npm run check`, `npm test`, and `node scripts/audit-source.mjs`. Do not include runtime data, personal paths, credentials, or signing material. Tests use isolated engines and fake notification sinks; do not send real notifications without explicit authorization.

Embedded deployments consume a tested Git commit as an immutable release. Keep the v1 interface compatible, and retain release-pinned browser asset support. Do not stop or restart injected engines or shared desktop connections during updates or rollback.

See `docs/UPDATING.md` for the source and deployment boundary. Do not change repository visibility or select a license without the owner's instruction.
