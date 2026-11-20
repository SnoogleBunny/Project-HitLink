# Flowstate Pro evidence

**Scope:** redacted repository/tool evidence only. This directory is not a compliance certification, legal opinion, production approval, or substitute for protected operational evidence.

## Rules

- Evidence must identify the exact candidate commit or, for an uncommitted review candidate, a deterministic manifest of the base commit plus changed-file hashes; it must also identify branch/worktree, command, result, date, and limitation.
- Redact secrets, credentials, regulated/customer content, local database content, confidential agreements, legal advice, personnel data, and incident evidence. Use `[REDACTED]` when a value is necessary to understand the artifact.
- Do not commit `.env` files, databases, caches, generated clients, binaries, browser traces, giant logs, or vendor-console exports.
- A skipped, unavailable, stale, historical, or non-reproducible check is not a pass.
- Use the package status vocabulary. Code presence may support `IMPLEMENTED`; repeatable checks may support `TECHNICALLY_VERIFIED`; neither establishes `OPERATIONALLY_EXERCISED`, `EVIDENCE_COMPLETE`, `LEGALLY_REVIEWED`, or `APPROVED_FOR_PROFILE`.
- Historical evidence is context only. A release or gate candidate must rerun required checks against the exact candidate and configuration.
- Repository artifacts may contain metadata and protected evidence references, not protected evidence bodies.

## WP0.1 Standard baseline

`wp0.1-standard-baseline/` contains concise evidence for the Flowstate Standard boundary at base Git commit `d4f2098b4940cae61b9f36345cb480bda33d990d` and the uncommitted WP0.1 documentation candidate identified by `candidate-manifest.txt`:

- `snapshot-and-toolchain.txt` — worktree identity, dirty state, remotes, and toolchain.
- `candidate-manifest.txt` — deterministic SHA-256 identity for every candidate payload file; the manifest excludes only itself to avoid a recursive self-hash.
- `prisma-inventory.txt` — regenerated schema, migration, delegate-call, exclusion, and raw-SQL counts.
- `root-command-results.txt` — exact required root commands, exit codes, durations, and blockers.

The narrative interpretation and path inventory are in `../current-standard-baseline.md`.