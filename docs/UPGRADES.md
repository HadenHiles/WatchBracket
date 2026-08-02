# Upgrade and rollback

## Upgrade

1. Record the current Git revision and running image IDs with `git rev-parse HEAD` and `docker compose images --quiet`.
2. Create and independently verify a database backup using `docs/BACKUP-RESTORE.md`.
3. Fetch the intended signed/tagged revision. Review release notes and migrations before changing the checkout.
4. Build images without stopping the current stack: `docker compose --env-file .env.production -f compose.prod.yml build`.
5. Start the stack. The one-shot migration container must complete before either private service becomes ready.
6. Verify container health, public security headers, integration health, room creation, live join updates, and Presentation Test Mode in a non-production build.

## Rollback

Application images can be rolled back to the recorded revision only when that revision supports the current schema. Database migrations are forward-only. If an upgrade introduced an incompatible schema change, stop the stack and restore the pre-upgrade dump into a new volume before starting the older images.

Never use `git reset --hard` in a deployment checkout with local configuration. Use `git switch --detach <known-good-revision>` or a tagged release, keep environment files untracked, rebuild, and validate Compose configuration before restart.

Keep the previous images and database volume until the upgraded stack completes a real smoke test. A rollback is complete only after readiness, room creation, realtime joining, and provider health checks pass.
