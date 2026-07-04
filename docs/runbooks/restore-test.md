# Restore-test runbook (quarterly, manual)

A backup that has never been restored is not a verified backup. This procedure is
**not automated** — run it manually once per quarter against the sandbox Supabase
project (which lives paused between uses, per the adendo).

## Prerequisites

- Access to the `returns-backups` R2 bucket (or the GitHub Actions run artifacts/logs).
- The `BACKUP_ENCRYPTION_PASSPHRASE` value (GitHub secret / password manager).
- The sandbox Supabase project's connection string (`SANDBOX_DB_URL`), unpaused for
  the duration of the test.
- `aws` CLI (or `rclone`) configured with the R2 credentials, `openssl`, `gunzip`,
  `psql`.

## Steps

1. **Unpause the sandbox Supabase project** in the Supabase dashboard (it is paused
   by default between tests to stay within free-tier limits).

2. **Download the latest daily backup** from R2:
   ```bash
   aws s3 cp "s3://returns-backups/daily/backup-<YYYY-MM-DD>.sql.gz.enc" . \
     --endpoint-url "https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com"
   ```

3. **Decrypt and decompress**:
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$BACKUP_ENCRYPTION_PASSPHRASE" \
     -in backup-<YYYY-MM-DD>.sql.gz.enc | gunzip > backup-<YYYY-MM-DD>.sql
   ```

4. **Sanity-check the plaintext dump** before restoring anything:
   ```bash
   head -5 backup-<YYYY-MM-DD>.sql   # should show "-- PostgreSQL database dump"
   ```

5. **Restore into the sandbox project** (never into production):
   ```bash
   psql "$SANDBOX_DB_URL" < backup-<YYYY-MM-DD>.sql
   ```

6. **Spot-check row counts against production** for the core tables (adjust names
   to match the current schema, e.g. `devolucoes`, `itens_devolucao`, `fornecedores`,
   `motivos`):
   ```bash
   psql "$SANDBOX_DB_URL" -c "SELECT count(*) FROM devolucoes;"
   psql "$PROD_DB_URL"    -c "SELECT count(*) FROM devolucoes;"
   ```
   Counts should match the backup's timestamp (i.e. sandbox count <= production
   count, with the gap explained by activity since the dump was taken).

7. **Re-pause the sandbox project** when done, and delete the local plaintext
   `.sql` file and the downloaded `.sql.gz.enc` — do not leave decrypted dumps or
   the passphrase on disk.

## Failure handling

If any step fails (download, decrypt, gunzip, or restore), treat it as a
production-severity incident: the backup pipeline is silently broken and must be
fixed before the next scheduled run is trusted. Do not wait for the next quarterly
test to investigate.
