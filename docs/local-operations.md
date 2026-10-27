# Local startup and recovery

Run the maintained Docker stack from the repository root:

```sh
docker compose up --build
```

Bootstrap applies migrations and seeds an empty local demo database once. Restarting preserves existing records, uploaded PDFs, generated secrets and landing-page submissions. The README lists the local ports and fictional accounts. This stack deliberately has no live payment or email credentials.

## Health and checks

```sh
docker compose ps
docker compose logs bootstrap admin-web member-web maintenance
docker compose --profile test run --build --rm checks
```

The checks profile migrates a separate temporary PostgreSQL database and runs package/tooling tests, lint and type checks. Its database is separate from `hitlink_demo`. Browser acceptance uses its own disposable database and the maintained Playwright configuration; a passing layout crawl is not a substitute for transactional tests.

## Snapshot and restore to a separate database

Save local backups outside the repository. The following uses standard PostgreSQL tools already in the database container. Choose a new restore database name; `createdb` stops if it already exists. These commands do not replace the application database.

```sh
mkdir -p ../hitlink-local-backups
docker compose exec -T postgres pg_dump -U postgres -Fc --no-owner --no-acl hitlink_demo > ../hitlink-local-backups/hitlink-demo.dump
chmod 600 ../hitlink-local-backups/hitlink-demo.dump
shasum -a 256 ../hitlink-local-backups/hitlink-demo.dump
docker compose exec -T postgres createdb -U postgres hitlink_restore_test
docker compose exec -T postgres pg_restore -U postgres --no-owner --no-acl --exit-on-error -d hitlink_restore_test < ../hitlink-local-backups/hitlink-demo.dump
docker compose exec -T postgres psql -U postgres -d hitlink_restore_test -c 'SELECT count(*) AS applied_migrations FROM _prisma_migrations WHERE finished_at IS NOT NULL;'
```

A database dump includes PDFs, signatures and prepared exports stored in PostgreSQL. It does not include the separate landing submissions or generated local-secrets volumes. Preserve those volumes separately if reconstructing the complete local environment. Keep a dump private even when it contains only fictional data; real deployments require their approved encrypted backup/storage and access policy.

After restoration, compare table counts and stable row fingerprints, exact document bytes/checksums, financial balances and representative authorized reads. Perform this in the separate database before changing any application connection. A successful `pg_restore` exit alone does not establish full data fidelity.

## Observed local recovery boundary

On October 26, 2026, a fictional browser database with 43 migrations was dumped and restored into a new isolated database. All **133 public tables and 142 rows** matched by table count and normalized row fingerprint, including exact stored file bytes. The 533,212-byte dump's SHA-256 was recorded with the external verification artifacts. No source database was replaced and no provider action was performed.

This is a small local recovery rehearsal. It does not establish production backup schedules, off-site encryption, alerts, measured production recovery objectives, retained-backup removal or an incident-response sign-off. Those require the actual deployment, named operators and representative production-scale evidence.
