# Backup and restore

Back up before every upgrade and on a schedule appropriate for your household. Database dumps and environment files are sensitive and are ignored by Git.

## Create and verify a backup

From the deployment checkout:

```sh
./scripts/backup.sh .env.production ./backups
./scripts/verify-restore.sh ./backups/watchbracket-YYYYMMDDTHHMMSSZ.dump
```

The first command runs `pg_dump` inside the private production PostgreSQL container, writes a custom-format dump with mode `0600`, and verifies its archive catalog. The second command restores that dump into an isolated disposable PostgreSQL container, verifies the five core tables, and removes the disposable container. It never connects to or modifies the production database.

Copy verified dumps to a second encrypted storage location. Separately back up `.env.production`, `.env.integration.production`, Compose configuration, and reverse-proxy configuration in an encrypted secret store. Do not place secrets inside the Git checkout history.

## Restore a production installation

1. Stop `web`, `game-api`, `integration-service`, and `cast-receiver`. Leave PostgreSQL available.
2. Create one final dump if the database is healthy.
3. Restore only into an empty database or a newly created PostgreSQL volume. Do not use `--clean` against an unverified target.
4. Run `pg_restore --exit-on-error --no-owner --no-acl` from the matching PostgreSQL major version.
5. Start the one-shot `migrate` service and confirm it exits successfully.
6. Start the remaining services, check both readiness endpoints, and complete a mock room smoke test.

For disaster recovery, prefer creating a new Compose project/volume, restoring there, validating it, and then switching the proxy. Keep the old volume untouched until the restored stack passes verification.
