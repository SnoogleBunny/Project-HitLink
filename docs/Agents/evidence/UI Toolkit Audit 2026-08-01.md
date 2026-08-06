# UI Toolkit Audit Evidence — 2026-08-01

## Scope

This record supports the committed policy in `docs/Agents/UI Skill Toolkit.md`. It covers the exact logic-only Impeccable artifact installed in the six canonical UI-facing Hermes profiles, a separately acquired larger bundle that was rejected but whose immutable source mapping was not retained, the two committed custom skill files, and the external documentation endpoints used by the toolkit.

It does not certify future registry bytes, Bklit registry items not inspected in a scoped packet, or a future Motion package version. Runtime installation remains fail-closed on the exact approved Impeccable `SKILL.md` hash.

Repository candidate base: `cb6e9ed348e00b938c9693c211615237950d65d0`

Hermes runtime:

```text
Hermes Agent v0.19.0 (2026.7.20) · upstream e444d165 · local 139282f2 (+9 carried commits)
Python: 3.11.15
```

## Approved Impeccable artifact

Registry acquisition command (no transformation step):

```text
hermes -p <profile> skills install skills-sh/pbakaus/impeccable/impeccable --yes --force
```

The registry identifier is mutable. The install is accepted only after the file-set and exact installed-file SHA-256 assertions in `UI Skill Toolkit.md` pass.

The 2026-08-01 registry installation scanner reported:

```text
Source: community
Files scanned: 1
Combined SHA-256: c16916be900b1add16edad189f86ffcbba9ceb81f965d21c1bb2ab9bdc550878
Verdict: SAFE
```

The installed file was independently hashed with `sha256sum` in every canonical UI-facing profile:

```text
hitlink-ceo          ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b
hitlink-design       ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b
hitlink-frontend-dev ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b
hitlink-ux           ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b
hitlink-qa           ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b
hitlink-orchestrator ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b
```

Command:

```text
hermes skills audit impeccable --deep
```

Output:

```text
Auditing 1 skill(s)...

Scan: impeccable (skills-sh/pbakaus/impeccable/impeccable/community)
Verdict: SAFE
  LOW      privilege_escalation SKILL.md:8 "allowed-tools:"

Decision: ALLOWED — Allowed (community source, safe verdict)
AST deep scan: impeccable
  No dynamic import/access patterns detected.
```

The LOW `allowed-tools` declaration is informational. The installed artifact contains only `impeccable/SKILL.md`; it contains no hook, live-server, or bundled script files. The committed role policy further prohibits executing those modes.

## Rejected larger bundle

A separately acquired 147-file bundle was audited in a throwaway directory. The retained audit output is reproduced below, but the checkout's immutable source URI/commit/path mapping was not retained. This record therefore makes no source attribution and does not use the bundle as provenance for the approved registry artifact.

Hermes returned:

```text
Found 3 potentially dangerous pattern(s):

1. SKILL.md:14 — prompt_injection
   References persistent hooks and a harness guide.
2. references/chat.md:7 — data_exfiltration
   Describes background jobs that persist after a session and send desktop notifications.
3. scripts/server.ts:646 — remote_code_execution
   Runs a localhost HTTP server and launches a browser against local content.

Verdict: DANGEROUS
Decision: BLOCKED
```

The throwaway directory was removed after inspection. No hook, live server, browser launcher, or bundled script from the larger bundle was installed or committed. Because immutable source provenance was not retained, this historical result supports only the fail-closed policy decision; it is not evidence about a named Git commit.

## Committed custom skills

The exact staged Git blobs, which use LF line endings, hash to:

```text
.agents/skills path                                                   SHA-256
.agents/skills/bklit-data-visualization/SKILL.md                    ddf4d00f39a15ed98f7311e37f5d4d0df20764f84c6afc5ed7843039056992fb
.agents/skills/motion-scroll-animations/SKILL.md                    d8a1077cca39f32a48a8e6bfa768cbd56ede43194c9cd762ee33a3a186a63826
```

Windows working copies may use CRLF. Each canonical profile mirror was read with CRLF normalized to LF and matched the corresponding staged hash above. This normalized comparison is the required cross-profile equality check.

Each skill directory contains only `SKILL.md`. Frontmatter names match directory names, descriptions are within Hermes limits, and the files explicitly preserve Design ownership, UX acceptance ownership, Frontend implementation ownership, and logic-only Impeccable use.

## External endpoint check

A Python `urllib.request` probe with redirects enabled returned:

```text
https://ui.bklit.com/r/line-chart.json        HTTP 200 -> https://bklit.com/r/line-chart.json
https://ui.bklit.com/docs                     HTTP 200 -> https://bklit.com/docs
https://motion.dev/docs/react-scroll-animations HTTP 200
```

The Bklit registry base is not a browsable index. Agents must discover and verify an exact `{name}.json` endpoint from current official documentation before adding a component.
