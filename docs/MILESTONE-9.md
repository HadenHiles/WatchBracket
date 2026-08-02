# Milestone 9: production hardening and open-source preparation

Milestone 9 completes the V1 engineering and maintainer surface.

- Production origins no longer accept localhost; HTTP and Socket.IO share the same allowlist.
- Cookie mutations retain signed double-submit CSRF protection, and global plus operation-specific request limits are active.
- API and web responses apply CSP, frame, content-type, referrer, permissions, opener, and resource policy controls.
- CI covers lint, types, unit/integration/E2E, image builds, critical dependency audits, secret scanning, and high/critical container scanning.
- Backup/restore verification and upgrade/rollback runbooks are executable and avoid in-place destructive restore.
- MIT licensing, contribution guidance, conduct rules, issue/PR templates, Dependabot, adapter/protocol guides, and a public roadmap are included.

Release verification must include a clean install, a restore into a clean stack, a header check, read-only live provider health, and a complete mock/presentation smoke test. Private FamFlix credentials and infrastructure details remain outside Git.
