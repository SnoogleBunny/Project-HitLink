import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const validatorPath = path.join(
  repoRoot,
  "scripts/pro-compliance/validate-dossier.mjs",
);
const dossierRoot = "docs/compliance/flowstate-pro";
const manifestPath = `${dossierRoot}/dossier-manifest.json`;
const registerPath = `${dossierRoot}/change-control-register.json`;
const manifestSchemaPath = `${dossierRoot}/schemas/dossier-document-metadata.schema.json`;
const registerSchemaPath = `${dossierRoot}/schemas/change-control-record.schema.json`;
const examplePath = `${dossierRoot}/example.md`;
const dossierPaths = JSON.parse(await readFile(path.join(repoRoot, manifestPath), "utf8"))
  .documents.map((entry) => entry.path);
const approvedStatuses = [
  "DRAFT",
  "PROPOSED",
  "COUNSEL_REVIEW_REQUIRED",
  "OWNER_APPROVAL_REQUIRED",
  "APPROVED",
  "SPECIFIED",
  "IMPLEMENTED",
  "TECHNICALLY_VERIFIED",
  "OPERATIONALLY_EXERCISED",
  "EVIDENCE_COMPLETE",
  "LEGALLY_REVIEWED",
  "APPROVED_FOR_PROFILE",
  "BLOCKED",
  "NOT_APPLICABLE",
  "SUPERSEDED",
];
const accountableFunctions = [
  "Architecture/Backend",
  "Database",
  "Legal/Privacy",
  "Legal/counsel",
  "Operations",
  "Operations/QA-Assurance",
  "Product",
  "QA/Assurance",
  "Security/Privacy",
];

async function runNode(args, options = {}) {
  try {
    const result = await execFileAsync(process.execPath, args, {
      cwd: repoRoot,
      encoding: "utf8",
      ...options,
    });
    return { ...result, code: 0 };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

async function runValidator(root, extraArgs = []) {
  return runNode([validatorPath, "--root", root, ...extraArgs]);
}

function baseDocument(overrides = {}) {
  return {
    document_id: "EXAMPLE-DOC",
    path: examplePath,
    title: "Example dossier document",
    status: "SPECIFIED",
    owner: "Architecture/Backend",
    source: ["Q1"],
    affected_profiles: ["ALL"],
    effective_date: "2026-09-23",
    required_review: ["QA/Assurance"],
    evidence_references: ["SYNTHETIC-EVIDENCE-001"],
    latest_change_id: "WP0.4-CC-001",
    ...overrides,
  };
}

function baseRecord(overrides = {}) {
  return {
    change_id: "WP0.4-CC-001",
    document_ids: ["EXAMPLE-DOC"],
    status: "SPECIFIED",
    owner: "Architecture/Backend",
    reason: "Synthetic validator fixture.",
    source: ["Q1"],
    affected_profiles: ["ALL"],
    effective_date: "2026-09-23",
    superseded_text: "NONE — no prior text superseded",
    required_review: ["QA/Assurance"],
    evidence_references: ["SYNTHETIC-EVIDENCE-001"],
    transition: {
      from_status: "DRAFT",
      to_status: "SPECIFIED",
      prerequisite_evidence: { DRAFT: ["SYNTHETIC-DRAFT-001"] },
    },
    legal_value: false,
    ...overrides,
  };
}

function namedApproval(overrides = {}) {
  return {
    approver_name: "Example Reviewer",
    approver_role: "Legal/counsel",
    approved_at: "2026-09-23T15:00:00Z",
    scope: "Synthetic profile and legal-value version 1",
    evidence_reference: "PROTECTED-EVIDENCE-001",
    candidate_identity: "SYNTHETIC-CANDIDATE-001",
    ...overrides,
  };
}

function approvedForProfileRecord(overrides = {}) {
  const statuses = [
    "EVIDENCE_COMPLETE",
    "IMPLEMENTED",
    "LEGALLY_REVIEWED",
    "OPERATIONALLY_EXERCISED",
    "OWNER_APPROVAL_REQUIRED",
    "SPECIFIED",
    "TECHNICALLY_VERIFIED",
  ];
  return baseRecord({
    status: "APPROVED_FOR_PROFILE",
    legal_value: true,
    transition: {
      from_status: "OWNER_APPROVAL_REQUIRED",
      to_status: "APPROVED_FOR_PROFILE",
      prerequisite_evidence: Object.fromEntries(
        statuses.map((status, index) => [status, [`SYNTHETIC-${index + 1}`]]),
      ),
      approval_reference: "PROTECTED-APPROVAL-001",
    },
    approval: namedApproval(),
    ...overrides,
  });
}

async function writeJson(root, relativePath, value) {
  const fullPath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function makeRepository({
  documents = [baseDocument()],
  records = [baseRecord()],
  documentText = "# Example dossier document\n\n**Status:** SPECIFIED\n",
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "flowstate-pro-dossier-"));
  await mkdir(path.join(root, ".git"));
  await mkdir(path.join(root, dossierRoot, "schemas"), { recursive: true });
  await copyFile(
    path.join(repoRoot, manifestSchemaPath),
    path.join(root, manifestSchemaPath),
  );
  await copyFile(
    path.join(repoRoot, registerSchemaPath),
    path.join(root, registerSchemaPath),
  );
  await mkdir(path.dirname(path.join(root, examplePath)), { recursive: true });
  await writeFile(path.join(root, examplePath), documentText);
  const entries = [...documents];
  for (const [index, file] of dossierPaths.entries()) {
    const target = path.join(root, file);
    assert.ok(target.startsWith(`${root}${path.sep}`), "fixture path escapes disposable root");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "# Synthetic dossier document\n");
    const entry = baseDocument({ document_id: `SYNTHETIC-DOC-${index}`, path: file });
    const before = entries.findIndex((candidate) => candidate?.path > file);
    entries.splice(before < 0 ? entries.length : before, 0, entry);
  }
  await writeJson(root, manifestPath, { schema_version: 1, documents: entries });
  await writeJson(root, registerPath, { schema_version: 1, records });
  return root;
}

async function withRepository(options, action) {
  const root = await makeRepository(options);
  try {
    return await action(root);
  } finally {
    await chmod(root, 0o700).catch(() => {});
    await rm(root, { force: true, recursive: true });
  }
}

function assertValidationFailure(result, code) {
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, new RegExp(code));
  assert.doesNotMatch(result.stderr, /\n\s*at\s/);
}

function assertValidationPass(result) {
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^VALIDATION_PASSED /);
  assert.equal(result.stderr, "");
}

test("required metadata, unknown fields, vocabulary, and dates fail closed", async () => {
  await withRepository(
    {
      documents: [
        baseDocument({
          owner: undefined,
          evidence_references: undefined,
          unexpected: true,
          status: "specified",
          effective_date: "2026-02-30",
        }),
      ],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "MANIFEST_REQUIRED_FIELD");
      assert.match(result.stderr, /field=owner/);
      assert.match(result.stderr, /field=evidence_references/);
      assert.match(result.stderr, /MANIFEST_UNKNOWN_FIELD/);
      assert.match(result.stderr, /MANIFEST_STATUS/);
      assert.match(result.stderr, /MANIFEST_DATE/);
    },
  );
});

test("profile vocabulary fails closed in manifest and register records", async () => {
  await withRepository(
    {
      documents: [baseDocument({ affected_profiles: ["invalid profile"] })],
      records: [baseRecord({ affected_profiles: ["invalid profile"] })],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "MANIFEST_PROFILES");
      assert.match(result.stderr, /REGISTER_PROFILES/);
    },
  );
});

test("owners must be exact accountable functions", async () => {
  await withRepository(
    {
      documents: [baseDocument({ owner: "Jane Doe" })],
      records: [baseRecord({ owner: "Jane Doe" })],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "MANIFEST_OWNER");
      assert.match(result.stderr, /REGISTER_OWNER/);
      assert.doesNotMatch(result.stderr, /Jane Doe/);
    },
  );
});

test("required reviews and approval roles must be exact accountable functions", async () => {
  await withRepository(
    {
      documents: [baseDocument({ required_review: ["Jane Doe"] })],
      records: [baseRecord({ required_review: ["banana"] })],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "MANIFEST_REVIEW");
      assert.match(result.stderr, /REGISTER_REVIEW/);
      assert.doesNotMatch(result.stderr, /Jane Doe|banana/);
    },
  );

  const approved = approvedForProfileRecord({
    approval: namedApproval({ approver_role: "banana" }),
  });
  await withRepository({ records: [approved] }, async (root) => {
    const result = await runValidator(root);
    assertValidationFailure(result, "APPROVAL_ROLE");
    assert.doesNotMatch(result.stderr, /banana/);
  });
});

test("all canonical declared statuses reconcile exactly and invalid values fail closed", async () => {
  for (const [index, status] of approvedStatuses.entries()) {
    await withRepository(
      {
        documents: [baseDocument({ status })],
        records: status === "APPROVED_FOR_PROFILE" ? [approvedForProfileRecord()] : undefined,
        documentText: `# Example dossier document\n\n**Status:** ${status}\n`,
      },
      async (root) => assertValidationPass(await runValidator(root)),
    );
    await withRepository(
      {
        documents: [
          baseDocument({ status: approvedStatuses[(index + 1) % approvedStatuses.length] }),
        ],
        documentText: `# Example dossier document\n\n**Status:** ${status}\n`,
      },
      async (root) =>
        assertValidationFailure(
          await runValidator(root),
          "DOCUMENT_STATUS_CONTRADICTION",
        ),
    );

    const mixed = `${status[0].toLowerCase()}${status.slice(1)}`;
    for (const declared of [
      status.toLowerCase(),
      mixed,
      ` ${status}`,
      `${status} `,
      `\u00a0${status}`,
      `${status}\u00a0`,
      `\u200b${status}`,
      `${status}\u200b`,
    ]) {
      await withRepository(
        { documentText: `# Example dossier document\n\n**Status:** ${declared}\n` },
        async (root) => {
          const result = await runValidator(root);
          assertValidationFailure(result, "DOCUMENT_STATUS_INVALID");
          assert.equal(result.stderr.includes(declared), false);
        },
      );
    }
  }

  for (const declared of ["BANANA", "APPROVEDLY UNRELATED", "APPROVED FOR PROFILE"]) {
    await withRepository(
      { documentText: `# Example dossier document\n\n**Status:** ${declared}\n` },
      async (root) => {
        const result = await runValidator(root);
        assertValidationFailure(result, "DOCUMENT_STATUS_INVALID");
        assert.equal(result.stderr.includes(declared), false);
      },
    );
  }
});

test("declared statuses are detected across the full document and reconciled together", async () => {
  const preamble = Array.from({ length: 20 }, (_, index) => `Preamble ${index + 1}`).join("\n");
  await withRepository(
    { documentText: `# Example dossier document\n${preamble}\n**Status:** SPECIFIED\n` },
    async (root) => assertValidationPass(await runValidator(root)),
  );
  await withRepository(
    {
      documents: [baseDocument({ status: "IMPLEMENTED" })],
      documentText: `# Example dossier document\n${preamble}\n**Status:** SPECIFIED\n`,
    },
    async (root) =>
      assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_CONTRADICTION"),
  );
  await withRepository(
    {
      documentText:
        "# Example dossier document\n\n**Status:** SPECIFIED\n\n**Status:** SPECIFIED\n",
    },
    async (root) => assertValidationPass(await runValidator(root)),
  );
  await withRepository(
    {
      documentText:
        "# Example dossier document\n\n**Status:** SPECIFIED\n\n**Status:** IMPLEMENTED\n",
    },
    async (root) =>
      assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_CONTRADICTION"),
  );
  await withRepository(
    {
      documentText:
        "# Example dossier document\n\n**Status:** SPECIFIED\n\n## Status\n\n`IMPLEMENTED`\n",
    },
    async (root) =>
      assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_CONTRADICTION"),
  );
});

test("malformed supported status declarations fail closed without scanning ordinary prose", async () => {
  for (const line of [
    "## status",
    "## STATUS",
    "## StAtUs",
    "## Status:",
    "## Status\u200b",
    "**Status :** SPECIFIED",
    "**Status\u200b:** SPECIFIED",
    "** Status:** SPECIFIED",
    "**Status** SPECIFIED",
    "**Status:**",
    "**Status:**SPECIFIED",
    "## Status\n\nSPECIFIED ",
  ]) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${line}\n` },
      async (root) =>
        assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_INVALID"),
    );
  }
  for (const line of [
    "**Status quo** is preserved in this discussion.",
    "**Status indicators:** this section explains monitoring.",
    "**Status page:** see the external dashboard.",
    "## Status indicators",
    "## Status history",
    "This prose discusses status SPECIFIED without declaring one.",
  ]) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${line}\n` },
      async (root) => assertValidationPass(await runValidator(root)),
    );
  }
  for (const line of [
    "**Status:** SPECIFIED",
    "## Status\n\n`SPECIFIED`",
  ]) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${line}\n` },
      async (root) => assertValidationPass(await runValidator(root)),
    );
  }
  await withRepository(
    {
      documentText:
        "# Example dossier document\n\nThis prose discusses status SPECIFIED without declaring one.\n\n```md\n**Status:** IMPLEMENTED\n## Status\n\n`IMPLEMENTED`\n```\n",
    },
    async (root) => assertValidationPass(await runValidator(root)),
  );
});

test("declaration-shaped malformed status labels fail closed across Markdown forms", async () => {
  const malformed = [
    ["heading level 1", "# Status\n\n`SPECIFIED`"],
    ["heading level 3", "### Status\n\n`SPECIFIED`"],
    ["heading level 4", "#### Status\n\n`SPECIFIED`"],
    ["heading level 5", "##### Status\n\n`SPECIFIED`"],
    ["heading level 6", "###### Status\n\n`SPECIFIED`"],
    ["heading tab in label", "## Sta\ttus\n\n`SPECIFIED`"],
    ["heading mixed whitespace in label", "## St \ta tus\n\n`SPECIFIED`"],
    ["heading tab separator", "##\tStatus\n\n`SPECIFIED`"],
    ["heading duplicated colon", "## Status::\n\n`SPECIFIED`"],
    ["heading tripled colon", "## Status:::\n\n`SPECIFIED`"],
    ["heading spaced duplicated colon", "## Status : :\n\n`SPECIFIED`"],
    ["heading lower case", "## status\n\n`SPECIFIED`"],
    ["heading upper case", "## STATUS\n\n`SPECIFIED`"],
    ["heading spaced label", "## S tatus\n\n`SPECIFIED`"],
    ["heading zero width leading", "## \u200bStatus\n\n`SPECIFIED`"],
    ["heading zero width middle", "## Sta\u200btus\n\n`SPECIFIED`"],
    ["heading zero width before punctuation", "## Status\u2060::\n\n`SPECIFIED`"],
    ["heading zero width trailing", "## Status\ufeff\n\n`SPECIFIED`"],
    ["heading case and tab", "### StA\tTuS:\n\n`SPECIFIED`"],
    ["heading mixed adjacent variants", "###### \u200bST\tAT US::\u2060\n\nSPECIFIED"],
    ["heading exact label raw value", "## Status\n\nSPECIFIED"],
    ["heading alternate raw value", "### Status\n\nSPECIFIED"],
    ["heading exact label tab before raw value", "## Status\n\n\tSPECIFIED"],
    ["heading exact label malformed fenced value", "## Status\n\n``SPECIFIED``"],
    ["heading exact label extra backtick", "## Status\n\n``SPECIFIED`"],
    ["heading exact label empty value", "## Status\n\n``"],
    ["heading exact label invalid value", "## Status\n\n`BANANA`"],
    ["single emphasis", "*Status:* SPECIFIED"],
    ["triple emphasis", "***Status:*** SPECIFIED"],
    ["quadruple emphasis", "****Status:**** SPECIFIED"],
    ["bold leading label space", "** Status:** SPECIFIED"],
    ["bold missing colon", "**Status** SPECIFIED"],
    ["mismatched two-three emphasis", "**Status:*** SPECIFIED"],
    ["bold zero width before colon", "**Status\u200b:** SPECIFIED"],
    ["bold duplicated colon", "**Status::** SPECIFIED"],
    ["bold tripled colon", "**Status:::** SPECIFIED"],
    ["bold spaced duplicated colon", "**Status : :** SPECIFIED"],
    ["bold spaced colon", "**Status :** SPECIFIED"],
    ["bold no value", "**Status:**"],
    ["bold semicolon", "**Status;** SPECIFIED"],
    ["bold tab in label", "**Sta\ttus:** SPECIFIED"],
    ["bold mixed whitespace in label", "**St \ta tus:** SPECIFIED"],
    ["bold tab before punctuation", "**Status\t:** SPECIFIED"],
    ["bold tab after label", "**Status:**\tSPECIFIED"],
    ["bold no separator", "**Status:**SPECIFIED"],
    ["bold doubled separator", "**Status:**  SPECIFIED"],
    ["bold zero width leading", "**\u200bStatus:** SPECIFIED"],
    ["bold zero width middle", "**Sta\u200ctus:** SPECIFIED"],
    ["bold zero width before punctuation", "**Status\u2060::** SPECIFIED"],
    ["bold zero width trailing", "**Status:\ufeff** SPECIFIED"],
    ["bold case and tab", "**StA\tTuS::** SPECIFIED"],
    ["bold mixed adjacent variants", "***\u200bST\tAT US::\u2060***\tSPECIFIED"],
    ["bold mixed-case label", "**StAtUs:** SPECIFIED"],
    ["bold spaced label", "**Sta tus:** SPECIFIED"],
    ["bold trailing zero width label", "**Status:\ufeff** SPECIFIED"],
    ["bold empty value", "**Status:** "],
    ["bold lower-case value", "**Status:** specified"],
    ["bold leading-space value", "**Status:**  SPECIFIED"],
    ["bold trailing-space value", "**Status:** SPECIFIED "],
  ];
  assert.equal(malformed.length, 59);

  const bypasses = [];
  for (const [name, declaration] of malformed) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${declaration}\n` },
      async (root) => {
        const result = await runValidator(root);
        if (result.code !== 1 || !result.stderr.includes("DOCUMENT_STATUS_INVALID")) {
          bypasses.push(name);
        } else {
          assert.equal(result.stderr.includes(declaration), false);
        }
      },
    );
  }
  assert.deepEqual(bypasses, [], `malformed label bypasses: ${bypasses.join(", ")}`);

  const controls = [
    "**Status:** SPECIFIED",
    "## Status\n\n`SPECIFIED`",
    "**Status quo** is preserved in this discussion.",
    "**Status indicators:** this section explains monitoring.",
    "**Status page:** see the external dashboard.",
    "## Status indicators",
    "## Status history",
    "This prose discusses status SPECIFIED without declaring one.",
    "# Release status overview",
    "Inline `**Status:** IMPLEMENTED` is an example.",
    "```md\n**Status:** IMPLEMENTED\n### Status\n\n`IMPLEMENTED`\n```",
  ];
  for (const declaration of controls) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${declaration}\n` },
      async (root) => assertValidationPass(await runValidator(root)),
    );
  }
});

test("independent 250-case status fuzz corpus rejects declaration-shaped bypasses", async () => {
  const requirementRelevant = [
    ["unicode fullwidth colon heading", "## Status：\n\n`SPECIFIED`"],
    ["unicode em dash heading", "## Status—\n\n`SPECIFIED`"],
    ...Array.from({ length: 4 }, (_, index) => {
      const markers = "*".repeat(index + 5);
      const declaration = index === 3
        ? `${markers}Status:${markers}\n\nSPECIFIED`
        : `${markers}Status:${markers} SPECIFIED`;
      return [`matching emphasis count ${index + 5}`, declaration];
    }),
    ["escaped opening markers", "\\**Status:** SPECIFIED"],
    ["escaped opening triple markers", "\\***Status:*** SPECIFIED"],
    ["escaped opening and closing runs", "\\**Status:\\** SPECIFIED"],
    ["individually escaped markers", "\\*\\*Status:\\*\\* SPECIFIED"],
    ["mismatched emphasis five-six", "*****Status:****** SPECIFIED"],
    ["mismatched emphasis six-five", "******Status:***** SPECIFIED"],
    ["mismatched emphasis seven-eight", "*******Status:******** SPECIFIED"],
    ["mixed unicode and mismatched markers", "*****Status：****** SPECIFIED"],
    ["mixed escaped and unicode markers", "\\**Status—:\\*** SPECIFIED"],
  ].map(([name, declaration]) => ({
    name,
    declaration,
    expected: "reject",
    requirementRelevant: true,
  }));
  assert.equal(requirementRelevant.length, 15);

  const invalidValues = [
    { name: "escaped closing markers", declaration: "**Status:\\** SPECIFIED", expected: "reject" },
    ...approvedStatuses.flatMap((status) => [
      { name: `${status} lower-case value`, declaration: `**Status:** ${status.toLowerCase()}`, expected: "reject" },
      { name: `${status} leading NBSP value`, declaration: `**Status:** \u00a0${status}`, expected: "reject" },
      { name: `${status} embedded format value`, declaration: `**Status:** ${status.slice(0, 1)}\u200b${status.slice(1)}`, expected: "reject" },
      { name: `${status} suffix value`, declaration: `**Status:** ${status}_EXTRA`, expected: "reject" },
    ]).slice(1),
  ];
  const exactDeclarations = approvedStatuses.flatMap((status) => [
    { name: `${status} exact bold`, declaration: `**Status:** ${status}`, expected: "allow", manifestStatus: status },
    { name: `${status} exact heading`, declaration: `## Status\n\n\`${status}\``, expected: "allow", manifestStatus: status },
  ]);
  const semanticTerms = [
    "quo", "indicators", "page", "history", "overview", "report", "notes",
    "semantics", "model", "lifecycle", "timeline", "legend", "glossary",
    "rationale", "context", "discussion", "examples", "taxonomy", "mapping",
    "summary", "dashboard", "widget", "signal", "metric", "archive", "changes",
    "guidance", "policy", "narrative",
  ];
  const excludedForms = [
    (term) => `**Status ${term}:** descriptive text.`,
    (term) => `## Status ${term}`,
    (term) => `This status ${term} sentence is prose, not a declaration.`,
    () => "> **Status:** SPECIFIED",
    (term, index) => [
      "- **Status:** SPECIFIED",
      "<!-- **Status:** SPECIFIED -->",
      "Inline `**Status:** SPECIFIED` example.",
      "```md\n**Status:** SPECIFIED\n```",
    ][index % 4],
  ];
  const excludedNotDeclarationShaped = semanticTerms.flatMap((term, termIndex) =>
    excludedForms.map((form, formIndex) => ({
      name: `non-declaration ${termIndex + 1}-${formIndex + 1}`,
      declaration: form(term, termIndex),
      expected: "allow",
      exclusion: "not a top-level isolated Status label plus value attempt",
    })),
  );
  const corpus = [
    ...requirementRelevant,
    ...invalidValues,
    ...exactDeclarations,
    ...excludedNotDeclarationShaped,
  ];
  assert.equal(corpus.length, 250);

  const requirementBypasses = [];
  const otherFailures = [];
  for (const candidate of corpus) {
    await withRepository(
      {
        documents: [baseDocument({ status: candidate.manifestStatus ?? "SPECIFIED" })],
        records: candidate.manifestStatus === "APPROVED_FOR_PROFILE" ? [approvedForProfileRecord()] : undefined,
        documentText: `# Example dossier document\n\n${candidate.declaration}\n`,
      },
      async (root) => {
        const result = await runValidator(root);
        const rejected = result.code === 1 && result.stderr.includes("DOCUMENT_STATUS_INVALID");
        if (candidate.expected === "reject" && !rejected) {
          (candidate.requirementRelevant ? requirementBypasses : otherFailures).push(candidate.name);
        } else if (candidate.expected === "allow" && result.code !== 0) {
          otherFailures.push(candidate.name);
        }
        if (rejected) assert.equal(result.stderr.includes(candidate.declaration), false);
      },
    );
  }
  assert.deepEqual(
    requirementBypasses,
    [],
    `requirement-relevant bypasses: ${requirementBypasses.join(", ")}`,
  );
  assert.deepEqual(otherFailures, [], `other corpus failures: ${otherFailures.join(", ")}`);
});

test("independent 261-case extended status and fence matrix", async () => {
  const underscoreAndMixed = [
    ["single underscores", "_Status:_ SPECIFIED"],
    ["double underscores", "__Status:__ SPECIFIED"],
    ["triple underscores", "___Status:___ SPECIFIED"],
    ["quadruple underscores", "____Status:____ SPECIFIED"],
    ["underscore-star", "_*Status:*_ SPECIFIED"],
    ["underscore-double-star", "_**Status:**_ SPECIFIED"],
    ["double-underscore-star", "__*Status:*__ SPECIFIED"],
    ["double-underscore-double-star", "__**Status:**__ SPECIFIED"],
    ["underscore-star-underscore", "_*_Status:_*_ SPECIFIED"],
    ["underscore-double-star-underscore", "_**_Status:_**_ SPECIFIED"],
    ["double-underscore-star-underscore", "__*_Status:_*__ SPECIFIED"],
    ["underscore escaped star", "_\\*Status:\\*_ SPECIFIED"],
    ["escaped underscore", "\\_Status:\\_ SPECIFIED"],
    ["escaped double underscore", "\\_\\_Status:\\_\\_ SPECIFIED"],
    ["underscore mismatched one-two", "_Status:__ SPECIFIED"],
    ["underscore mismatched two-one", "__Status:_ SPECIFIED"],
    ["mixed mismatched short-long", "_*Status:_** SPECIFIED"],
    ["mixed mismatched long-short", "_**Status:*_ SPECIFIED"],
  ].map(([name, declaration]) => ({ name, declaration, expected: "reject" }));

  const indentedAtx = [1, 2, 3].flatMap((indent) =>
    Array.from({ length: 6 }, (_, index) => ({
      name: `${indent}-space level-${index + 1} ATX`,
      declaration: `${" ".repeat(indent)}${"#".repeat(index + 1)} Status\n\nSPECIFIED`,
      expected: "reject",
    })),
  );

  const position = [
    {
      name: "invalid declaration after ordinary section heading",
      declaration: "## Ordinary section\n\n**Status:** BANANA",
      expected: "reject",
    },
    {
      name: "contradictory declaration after ordinary section heading",
      declaration: "## Ordinary section\n\n**Status:** IMPLEMENTED",
      expected: "reject",
    },
  ];
  const fences = [
    {
      name: "three-space-indented fenced example",
      declaration: "   ```md\n**Status:** IMPLEMENTED\n   ```",
      expected: "allow",
    },
    {
      name: "shorter nested delimiter text inside longer fence",
      declaration: "````md\n```\n**Status:** IMPLEMENTED\n```\n````",
      expected: "allow",
    },
  ];
  const tenthReviewCases = [
    {
      name: "CRLF fence closes before contradictory declaration",
      declaration: "```md\r\nexample\r\n```\r\n**Status:** IMPLEMENTED",
      expected: "reject",
    },
    {
      name: "mixed-line-ending fence closes before invalid declaration",
      declaration: "~~~md\r\nexample\n~~~\r\n**Status:** BANANA",
      expected: "reject",
    },
    {
      name: "CRLF fenced declaration remains suppressed",
      declaration: "```md\r\n**Status:** IMPLEMENTED\r\n```",
      expected: "allow",
    },
    ...["```lang`bad", "```` `bad`", "   ```md`bad"].map((opening, index) => ({
      name: `invalid backtick info string ${index + 1}`,
      declaration: `${opening}\n**Status:** BANANA\n\`\`\`\``,
      expected: "reject",
    })),
    {
      name: "tilde info string may contain backticks",
      declaration: "~~~lang`valid\n**Status:** IMPLEMENTED\n~~~",
      expected: "allow",
    },
    {
      name: "long backtick fence with matching longer closer",
      declaration: "`````md\n**Status:** IMPLEMENTED\n``````",
      expected: "allow",
    },
    {
      name: "backtick opener is not closed by tilde delimiter",
      declaration: "```md\n~~~\n**Status:** IMPLEMENTED\n~~~\n```",
      expected: "allow",
    },
    ...[0, 1, 2, 3].map((indent) => ({
      name: `${indent}-space indented emphasis declaration`,
      declaration: `${" ".repeat(indent)}**Status:** BANANA`,
      expected: "reject",
    })),
    {
      name: "tab-indented emphasis declaration",
      declaration: "\t**Status:** BANANA",
      expected: "reject",
    },
    {
      name: "four-space emphasis remains code",
      declaration: "    **Status:** IMPLEMENTED",
      expected: "allow",
    },
  ];

  const exactControls = approvedStatuses.flatMap((status) => [
    {
      name: `${status} exact bold control`,
      declaration: `**Status:** ${status}`,
      expected: "allow",
      manifestStatus: status,
    },
    {
      name: `${status} exact heading control`,
      declaration: `## Status\n\n\`${status}\``,
      expected: "allow",
      manifestStatus: status,
    },
  ]);
  const semanticTerms = Array.from({ length: 44 }, (_, index) => `topic-${index + 1}`);
  const ordinaryControls = semanticTerms.flatMap((term) => [
    { name: `${term} bold prose`, declaration: `**Status ${term}:** descriptive text.`, expected: "allow" },
    { name: `${term} heading`, declaration: `## Status ${term}`, expected: "allow" },
    { name: `${term} sentence`, declaration: `This status ${term} sentence is prose.`, expected: "allow" },
    { name: `${term} inline example`, declaration: `Inline \`**Status:** IMPLEMENTED\` ${term}.`, expected: "allow" },
  ]);
  const corpus = [
    ...underscoreAndMixed,
    ...indentedAtx,
    ...position,
    ...fences,
    ...tenthReviewCases,
    ...exactControls,
    ...ordinaryControls,
  ];
  assert.equal(underscoreAndMixed.length, 18);
  assert.equal(indentedAtx.length, 18);
  assert.equal(position.length, 2);
  assert.equal(fences.length, 2);
  assert.equal(tenthReviewCases.length, 15);
  assert.equal(corpus.length, 261);

  const failures = [];
  for (const candidate of corpus) {
    await withRepository(
      {
        documents: [baseDocument({ status: candidate.manifestStatus ?? "SPECIFIED" })],
        records: candidate.manifestStatus === "APPROVED_FOR_PROFILE" ? [approvedForProfileRecord()] : undefined,
        documentText: `# Example dossier document\n\n${candidate.declaration}\n`,
      },
      async (root) => {
        const result = await runValidator(root);
        const rejected =
          result.code === 1 &&
          /DOCUMENT_STATUS_(?:INVALID|CONTRADICTION)/.test(result.stderr);
        if (candidate.expected === "reject" && !rejected) failures.push(candidate.name);
        if (candidate.expected === "allow" && result.code !== 0) failures.push(candidate.name);
      },
    );
  }
  assert.deepEqual(failures, [], `extended matrix failures (${failures.length}): ${failures.join(", ")}`);
});

test("Markdown fences use CRLF-safe CommonMark opening and closing boundaries", async () => {
  const cases = [
    ["LF", "```md\nexample\n```\n**Status:** BANANA"],
    ["CRLF", "```md\r\nexample\r\n```\r\n**Status:** BANANA"],
    ["mixed", "~~~md\r\nexample\n~~~\r\n**Status:** BANANA"],
    ["invalid backtick info", "```md`bad\n**Status:** BANANA\n```"],
  ];
  for (const [, body] of cases) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${body}\n` },
      async (root) =>
        assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_INVALID"),
    );
  }
  for (const body of [
    "~~~md`valid\n**Status:** IMPLEMENTED\n~~~",
    "   ````md\r\n**Status:** IMPLEMENTED\r\n   `````\t ",
  ]) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${body}\n` },
      async (root) => assertValidationPass(await runValidator(root)),
    );
  }
});

test("top-level emphasis declarations allow up to three spaces or tabs but not four spaces", async () => {
  for (const prefix of ["", " ", "  ", "   ", "\t", " \t", "\t "]) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${prefix}**Status:** BANANA\n` },
      async (root) =>
        assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_INVALID"),
    );
  }
  await withRepository(
    { documentText: "# Example dossier document\n\n    **Status:** IMPLEMENTED\n" },
    async (root) => assertValidationPass(await runValidator(root)),
  );
});

test("document H1 accepts valid non-fenced ATX and Setext headings only", async () => {
  const cases = [
    ["ATX LF", "# Real title\n\n**Status:** SPECIFIED\n", true],
    ["ATX CRLF", "  # Real title\r\n\r\n**Status:** SPECIFIED\r\n", true],
    ["Setext LF", "Real title\n=\n\n**Status:** SPECIFIED\n", true],
    ["Setext CRLF", " Real title\r\n  ===\t \r\n\r\n**Status:** SPECIFIED\r\n", true],
    ["Setext mixed endings", "  Real title\r\n   == \n\n**Status:** SPECIFIED\r\n", true],
    ["fenced ATX", "```md\n# Fake title\n```\n\n**Status:** SPECIFIED\n", false],
    ["fenced Setext", "~~~md\r\nFake title\r\n===\r\n~~~\r\n\r\n**Status:** SPECIFIED\r\n", false],
    ["Setext H2", "Real title\n---\n\n**Status:** SPECIFIED\n", false],
    ["blank title", "\n===\n\n**Status:** SPECIFIED\n", false],
    ["four-space title", "    Real title\n===\n\n**Status:** SPECIFIED\n", false],
    ["four-space underline", "Real title\n    ===\n\n**Status:** SPECIFIED\n", false],
    ["blockquote", "> Real title\n> ===\n\n**Status:** SPECIFIED\n", false],
    ["list", "- Real title\n  ===\n\n**Status:** SPECIFIED\n", false],
    ["malformed underline suffix", "Real title\n=== x\n\n**Status:** SPECIFIED\n", false],
    ["malformed underline gap", "Real title\n= =\n\n**Status:** SPECIFIED\n", false],
  ];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if (valid) assertValidationPass(result);
      else assertValidationFailure(result, "DOCUMENT_H1_REQUIRED");
    }).catch((error) => {
      error.message = `${name}: ${error.message}`;
      throw error;
    });
  }
});

test("independent 13-case Setext H1 paragraph-content edge matrix", async () => {
  const cases = [
    ["HTML comment", "<!-- comment -->\n===\n", false],
    ["asterisk thematic break", "***\n===\n", false],
    ["underscore thematic break", "  _ _ _\n ===\n", false],
    ["hyphen thematic break", "   ---\n===\n", false],
    ["HTML block tag", "<div>\n===\n", false],
    ["HTML declaration", "  <!DOCTYPE html>\r\n ===\r\n", false],
    ["link reference definition", "[foo]: /url\r\n  ===\r\n", false],
    ["ordinary text", "Real title\n=\n", true],
    ["ordinary punctuation", "Release notes: v1.0!\r\n ===\r\n", true],
    ["escaped thematic text", "\\***\n===\n", true],
    ["escaped HTML text", "\\<div>\r\n===\n", true],
    ["escaped link-reference text", "\\[foo]: /url\r\n ===\n", true],
    ["mixed-ending text", "Text with [link](https://example.invalid)\r\n  ==\n", true],
  ];
  const failures = [];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== valid) failures.push(name);
    });
  }
  assert.equal(cases.length, 13);
  assert.deepEqual(failures, [], `Setext edge failures (${failures.length}): ${failures.join(", ")}`);
});

test("independent 19-case multiline H1 state matrix", async () => {
  const cases = [
    ["multiline HTML comment", "<!--\n# Fake title\nFake Setext\n===\n-->\n", false],
    ["multiline div block", "<div>\r\n# Fake title\r\nFake Setext\r\n===\r\n</div>\r\n", false],
    ["multiline declaration", "<!DOCTYPE\n# Fake title\nFake Setext\n===\n>\n", false],
    ["multiline processing instruction", "<?target\r\n# Fake title\nFake Setext\r\n===\n?>\r\n", false],
    ["multiline CDATA", "<![CDATA[\n# Fake title\r\nFake Setext\n===\r\n]]>\n", false],
    ["multiline custom complete tag", "<x-foo>\n# Fake title\nFake Setext\n===\n</x-foo>\n", false],
    ["multiline link reference continuation", "[foo]:\n/url\n===\n", false],
    ["multiline footnote-like continuation", "[^foo]:\r\ncontinued definition\r\n===\r\n", false],
    ["incomplete raw HTML paragraph", "<a title=\"a lot\n===\n", true],
    ["ordinary ATX", "# Real title\n", true],
    ["ordinary Setext", "Real title\r\n===\r\n", true],
    ["fenced ATX", "```md\n# Fake title\n```\n", false],
    ["fenced Setext", "~~~md\r\nFake title\r\n===\r\n~~~\r\n", false],
    ["Setext H2", "Real title\n---\n", false],
    ["blank Setext title", "\n===\n", false],
    ["four-space title", "    Real title\n===\n", false],
    ["blockquote Setext", "> Real title\n===\n", false],
    ["list Setext", "- Real title\n===\n", false],
    ["single-line reference definition", "[foo]: /url\n===\n", false],
  ];
  const failures = [];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== valid) failures.push(name);
    });
  }
  assert.equal(cases.length, 19);
  assert.deepEqual(failures, [], `Multiline H1 state failures (${failures.length}): ${failures.join(", ")}`);
});

test("independent 27-case extended HTML and reference H1 state matrix", async () => {
  const cases = [
    ["script crosses blank line", "<script>\n\n# Fake title\n</script>\n", false],
    ["pre crosses blank line", "<PRE class=\"x\">\r\n\r\nFake title\r\n===\r\n</pre>\r\n", false],
    ["style crosses mixed blank line", "<style media=screen>\r\n\n# Fake title\n</STYLE> trailing\r\n", false],
    ["textarea crosses blank line", "<textarea>\n\nFake title\n===\n  </textarea>  \n", false],
    ["type 1 closes before ATX", "<script>ignored</script>\n# Real title\n", true],
    ["type 1 closing line permits surrounding content", "<pre>\nignored\n prefix </PRE> suffix\nReal title\n===\n", true],
    ["type 1 does not close on wrong tag", "<style>\n</script>\n# Fake title\n</style>\n", false],
    ["div attributes and trailing content", "<div class=\"x\"> trailing\n# Fake title\n\n", false],
    ["nested standard tag prefix", "<table><tr>\r\nFake title\r\n===\r\n\r\n", false],
    ["standard closing tag with trailing content", "</div> trailing\n# Fake title\n\n", false],
    ["complete custom closing tag", "</x-foo>\nFake title\n===\n\n", false],
    ["standard block ends at blank before ATX", "<div class=\"x\"> trailing\nignored\n\n# Real title\n", true],
    ["custom block ends at blank before Setext", "<x-foo>\r\nignored\r\n\r\nReal title\r\n===\r\n", true],
    ["incomplete raw HTML remains paragraph Setext", "<a title=\"a lot\n===\n", true],
    ["incomplete custom opening remains paragraph Setext", "<x-foo title=\"open\n===\n", true],
    ["inline complete anchor is not block start", "<a href=\"/\">link</a>\n===\n", true],
    ["single-line bare destination with double title", "[foo]: /url\n  \"title\"\n===\n", false],
    ["continued angle destination and single title", "[foo]:\r\n  <https://example.invalid>\r\n  'title'\r\n===\r\n", false],
    ["continued bare destination and parenthesized title", "[foo]:\n  /url\n  (title)\n===\n", false],
    ["single-line angle destination and parenthesized title", "[foo]: <https://example.invalid> (title)\n===\n", false],
    ["footnote-like destination continuation", "[^foo]:\r\n  /url\r\n===\r\n", false],
    ["reference blank ends state before Setext", "[foo]: /url\n  \"title\"\n\nReal title\n===\n", true],
    ["reference unrelated content ends state before Setext", "[foo]: /url\n  \"title\"\nReal title\n===\n", true],
    ["reference followed by ordinary ATX", "[foo]:\n  /url\n# Real title\n", true],
    ["ordinary quoted paragraph Setext", "  \"ordinary title\"\n===\n", true],
    ["ordinary parenthesized paragraph Setext", "(ordinary title)\r\n===\r\n", true],
    ["ordinary angle text Setext", "<not a complete tag\n===\n", true],
  ];
  const failures = [];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== valid) failures.push(name);
    });
  }
  assert.equal(cases.length, 27);
  assert.deepEqual(failures, [], `Extended HTML/reference failures (${failures.length}): ${failures.join(", ")}`);
});

test("independent 11-case multiline reference and custom-tag H1 matrix", async () => {
  const cases = [
    ["same-line bare destination multiline single title", "[foo]: /url '\ntitle\nline1\nline2\n'\n===\n", false],
    ["next-line bare destination multiline double title", "[foo]:\n/url\n\"title\nlast\n\"\n===\n", false],
    ["footnote-like multiple continuations", "[^foo]:\nfirst continuation\nsecond continuation\n===\n", false],
    ["same-line angle destination multiline double title mixed endings", "[foo]: <https://example.invalid> \"title\r\nlast\n\"\r\n===\n", false],
    ["next-line angle destination multiline parenthesized title", " [foo]:\r\n  <https://example.invalid>\n   (title\r\nlast\n)\r\n ===\n", false],
    ["three-space multiline single title", "   [foo]: /url\n   'title\n   last\n   '\n   ===\n", false],
    ["empty unquoted custom attribute remains paragraph", "<x-foo a=>\n===\n", true],
    ["unterminated quoted custom attribute remains paragraph", "<x-foo a=\"unterminated>\n===\n", true],
    ["completed reference permits following Setext", "[foo]: /url\n\"title\"\nReal title\n===\n", true],
    ["blank terminates reference before Setext", "[foo]: /url '\ntitle\n'\n\nReal title\n===\n", true],
    ["complete custom tag remains HTML block", "<x-foo disabled a=value b='one' c=\"two\">\nFake title\n===\n\n", false],
  ];
  const failures = [];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== valid) failures.push(name);
    });
  }
  assert.equal(cases.length, 11);
  assert.deepEqual(failures, [], `Fifteenth-review H1 failures (${failures.length}): ${failures.join(", ")}`);
});

test("fifteenth-review multiline-reference and strict-custom-tag boundaries", async () => {
  const cases = [
    ["double title same-line bare LF", "[foo]: /url \"first\nsecond\n\"\n===\n", false],
    ["single title next-line angle CRLF", " [foo]:\r\n <https://example.invalid>\r\n 'first\r\n second\r\n '\r\n ===\r\n", false],
    ["parenthesized title same-line angle mixed", "  [foo]: <https://example.invalid> (first\r\nsecond\n)\r\n  ===\n", false],
    ["three-space destination and title", "   [foo]:\n   /url\n   \"first\n   second\n   \"\n===\n", false],
    ["footnote-like three continuations CRLF", "   [^foo]:\r\nfirst\r\n second\r\n  third\r\n ===\r\n", false],
    ["blank terminates unclosed title", "[foo]: /url \"first\nsecond\n\nReal title\n===\n", true],
    ["unrelated line terminates destination state", "[foo]:\nReal title\n===\n", true],
    ["completed same-line title permits Setext", "[foo]: /url 'done'\nReal title\n===\n", true],
    ["completed multiline parenthesized title permits Setext", "[foo]: /url (first\nsecond\n)\nReal title\n===\n", true],
    ["custom boolean attribute with trailing content", "<x-foo disabled> trailing\nFake title\n===\n\n", false],
    ["custom unquoted attribute with trailing content", "<x-foo a=value> trailing\nFake title\n===\n\n", false],
    ["custom single-quoted attribute with trailing content", "<x-foo a='value'> trailing\nFake title\n===\n\n", false],
    ["custom double-quoted attribute with trailing content", "<x-foo a=\"value\"> trailing\nFake title\n===\n\n", false],
    ["custom self-closing tag", "<x-foo disabled />\nFake title\n===\n\n", false],
    ["custom closing tag with trailing content", "</x-foo> trailing\nFake title\n===\n\n", false],
    ["custom empty unquoted attribute is paragraph", "<x-foo a=>\n===\n", true],
    ["custom unterminated single quote is paragraph", "<x-foo a='unterminated>\n===\n", true],
    ["custom unterminated double quote is paragraph", "<x-foo a=\"unterminated>\n===\n", true],
    ["custom missing close bracket is paragraph", "<x-foo disabled\n===\n", true],
    ["incomplete standard raw HTML remains paragraph", "<a title=\"unterminated>\n===\n", true],
  ];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      assert.equal(result.code === 0, valid, name);
    });
  }
});

test("sixteenth-review reference termination and immediate custom-tag content", async () => {
  const cases = [
    ["double close with junk becomes Setext content", "[foo]: /url \"open\nReal heading\" junk\n===\n", true],
    ["single close with junk becomes Setext content", "[foo]: /url 'open\nReal heading' junk\n===\n", true],
    ["parenthesized close with junk becomes Setext content", "[foo]: /url (open\nReal heading) junk\n===\n", true],
    ["four-space content terminates double title", "[foo]: /url \"open\n    indented unrelated\nReal title\n===\n", true],
    ["tab content terminates single title", "[foo]: /url 'open\n\tindented unrelated\nReal title\n===\n", true],
    ["four-space content terminates parenthesized title CRLF", "[foo]: /url (open\r\n    indented unrelated\r\nReal title\r\n===\r\n", true],
    ["escaped double delimiter does not close", "[foo]: /url \"open\nescaped \\\" delimiter\nclose\"\n===\n", false],
    ["escaped single delimiter does not close", "[foo]: /url 'open\nescaped \\' delimiter\nclose'\n===\n", false],
    ["escaped parenthesis does not close", "[foo]: /url (open\nescaped \\) delimiter\nclose)\n===\n", false],
    ["double close permits spaces and tabs only", "[foo]: /url \"open\nclose\" \t\n===\n", false],
    ["single close permits trailing tabs only CRLF", "[foo]: /url 'open\r\nclose'\t\r\n===\r\n", false],
    ["parenthesized close permits trailing spaces mixed", "[foo]: /url (open\r\nclose)  \n===\r\n", false],
    ["next-line destination malformed close becomes Setext", "[foo]:\n/url \"open\nReal title\" junk\n===\n", true],
    ["next-line angle destination indentation terminates title", "[foo]:\r\n<https://example.invalid>\r\n'open\r\n\tunrelated\r\nReal title\r\n===\r\n", true],
    ["blank terminates title before ordinary Setext", "[foo]: /url (open\n\nReal title\n===\n", true],
    ["unrelated destination continuation permits Setext", "[foo]:\nunrelated destination text\nReal title\n===\n", true],
    ["well-formed multiline title still suppresses Setext", "[foo]: /url \"open\ncontinued\nclose\"\n===\n", false],
    ["custom nested tag starts HTML block", "<x-foo><x-bar>\nFake title\n===\n", false],
    ["custom immediate text starts HTML block", "<x-foo>tail\nFake title\n===\n", false],
    ["custom immediate closing tag starts HTML block", "<x-foo></x-foo>\nFake title\n===\n", false],
    ["custom attributes with immediate text remain HTML", "<x-foo disabled a=value b='one' c=\"two\">tail\nFake title\n===\n", false],
    ["empty unquoted custom attribute remains paragraph", "<x-foo a=>\n===\n", true],
    ["unterminated custom quote remains paragraph", "<x-foo a=\"unterminated>\n===\n", true],
    ["incomplete raw HTML remains paragraph", "<x-foo disabled\n===\n", true],
  ];
  const failures = [];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== valid) failures.push(name);
    });
  }
  assert.equal(cases.length, 24);
  assert.deepEqual(failures, [], `Sixteenth-review H1 failures (${failures.length}): ${failures.join(", ")}`);
});

test("seventeenth-review shared reference indentation boundaries", async () => {
  const delimiters = [
    ["double", "\"", "\""],
    ["single", "'", "'"],
    ["parenthesized", "(", ")"],
  ];
  const terminationPrefixes = [
    ["bare tab", "\t"],
    ["one space then tab", " \t"],
    ["two spaces then tab", "  \t"],
    ["three spaces then tab", "   \t"],
  ];
  const cases = [
    ...delimiters.flatMap(([name, open]) =>
      terminationPrefixes.map(([indentName, prefix]) => [
        `${name} title terminates on ${indentName}`,
        `[foo]: /url ${open}open\n${prefix}unrelated\nReal title\n===\n`,
        true,
      ]),
    ),
    ...delimiters.flatMap(([name, open, close]) =>
      [0, 1, 2, 3].map((indent) => [
        `${name} title preserves ${indent}-space continuation`,
        `[foo]: /url ${open}open\n${" ".repeat(indent)}continued\n${close}\n===\n`,
        false,
      ]),
    ),
    ...[
      ["four spaces", "    "],
      ["bare tab", "\t"],
      ["one space then tab", " \t"],
      ["two spaces then tab", "  \t"],
      ["three spaces then tab", "   \t"],
    ].map(([name, prefix]) => [
      `footnote terminates on ${name}`,
      `[^foo]:\n${prefix}unrelated\nReal title\n===\n`,
      true,
    ]),
    ...[0, 1, 2, 3].map((indent) => [
      `footnote preserves ${indent}-space continuation`,
      `[^foo]:\n${" ".repeat(indent)}continued\n===\n`,
      false,
    ]),
    ...delimiters.map(([name, open]) => [
      `${name} title terminates on blank line`,
      `[foo]: /url ${open}open\n\nReal title\n===\n`,
      true,
    ]),
    ["footnote terminates on blank line", "[^foo]:\ncontinued\n\nReal title\n===\n", true],
    ...delimiters.map(([name, open, close]) => [
      `completed ${name} title permits following Setext`,
      `[foo]: /url ${open}open\nclose${close}\nReal title\n===\n`,
      true,
    ]),
    ["completed footnote paragraph permits following Setext", "[^foo]:\ncontinued\n\nReal title\n===\n", true],
  ];
  const failures = [];
  for (const [name, documentText, valid] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== valid) failures.push(name);
    });
  }
  assert.equal(cases.length, 41);
  assert.deepEqual(
    failures,
    [],
    `Seventeenth-review H1 failures (${failures.length}; ${cases.length - failures.length}/${cases.length} passed): ${failures.join(", ")}`,
  );
});

test("independent 8-case malformed reference-destination corpus", async () => {
  const malformed = [
    ["unbalanced opening parenthesis", "[r]: /url(\n\"open\nFake title\n===\n"],
    ["unbalanced closing parenthesis", "[r]: /url)\n\"open\nFake title\n===\n"],
    ["incomplete angle destination", "[r]:\n<https://example.invalid\n\"open\nFake title\n===\n"],
    ["nested angle destination", "[r]: <https://example.invalid<nested>>\n\"open\nFake title\n===\n"],
    ["opening parenthesis before blank", "[r]: /url(\n\nReal title\n===\n"],
    ["closing parenthesis before blank", "[r]: /url)\r\n\r\nReal title\r\n===\r\n"],
    ["incomplete angle before blank", "[r]:\n<https://example.invalid\n\nReal title\n===\n"],
    ["nested angle before blank", "[r]: <https://example.invalid<nested>>\r\n\nReal title\r\n===\r\n"],
  ];
  const failures = [];
  for (const [name, documentText] of malformed) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if (result.code !== 0) failures.push(name);
    });
  }
  assert.equal(malformed.length, 8);
  assert.deepEqual(
    failures,
    [],
    `Malformed destination failures (${failures.length}; ${malformed.length - failures.length}/${malformed.length} passed): ${failures.join(", ")}`,
  );
});

test("eighteenth-review 109-case reference-destination indentation matrix", async () => {
  const malformedDestinations = [
    ["unbalanced opening parenthesis", "/url("],
    ["unbalanced closing parenthesis", "/url)"],
    ["incomplete angle", "<https://example.invalid"],
    ["nested angle", "<https://example.invalid<nested>>"],
  ];
  const endings = [
    ["LF", ["\n", "\n", "\n", "\n"]],
    ["CRLF", ["\r\n", "\r\n", "\r\n", "\r\n"]],
    ["mixed", ["\r\n", "\n", "\r\n", "\n"]],
  ];
  const malformed = malformedDestinations.flatMap(([destinationName, destination]) =>
    ["same-line", "next-line"].flatMap((placement) =>
      [0, 1, 2, 3].flatMap((indent) =>
        endings.map(([endingName, lineEndings]) => {
          const spaces = " ".repeat(indent);
          const [afterReference, afterDestination, afterTitle, afterHeading] = lineEndings;
          const definition = placement === "same-line"
            ? `${spaces}[r]: ${destination}${afterDestination}`
            : `${spaces}[r]:${afterReference}${spaces}${destination}${afterDestination}`;
          return [
            `${destinationName} ${placement} ${indent}-space ${endingName}`,
            `${definition}${spaces}\"open${afterTitle}${spaces}Fake title${afterHeading}${spaces}===${afterHeading}`,
            true,
          ];
        }),
      ),
    ),
  );
  const controls = [
    ["bare simple same-line", "[r]: /url\n\"open\nFake title\n===\n", false],
    ["bare simple next-line", "[r]:\r\n/url\r\n\"open\r\nFake title\r\n===\r\n", false],
    ["balanced single parentheses", "[r]: /url(one)\n\"open\nFake title\n===\n", false],
    ["balanced nested parentheses", "[r]:\n/url(one(two))\r\n\"open\nFake title\r\n===\n", false],
    ["escaped parentheses", "[r]: /url\\(one\\)\n\"open\nFake title\n===\n", false],
    ["complete angle same-line", "[r]: <https://example.invalid>\n\"open\nFake title\n===\n", false],
    ["complete angle next-line", "[r]:\r\n<https://example.invalid>\r\n\"open\r\nFake title\r\n===\r\n", false],
    ["query and fragment", "[r]: /url?one=(two)#fragment\n\"open\nFake title\n===\n", false],
    ["same-line title start", "[r]: /url \"open\nFake title\n===\n", false],
    ["next-line title start", "[r]:\n/url\n\"open\nFake title\n===\n", false],
    ["three-space definition", "   [r]: /url(one)\n   \"open\n   Fake title\n   ===\n", false],
    ["escaped punctuation", "[r]: /url\\?one\\#two\n\"open\nFake title\n===\n", false],
    ["bounded deeper nesting", "[r]: /url(one(two(three)))\n\"open\nFake title\n===\n", false],
  ];
  const cases = [...malformed, ...controls];
  const failures = [];
  for (const [name, documentText, expectedPass] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== expectedPass) failures.push(name);
    });
  }
  assert.equal(malformed.length, 96);
  assert.equal(controls.length, 13);
  assert.equal(cases.length, 109);
  assert.deepEqual(failures, [], `Destination indentation failures (${failures.length}): ${failures.join(", ")}`);
});

test("eighteenth-review 15-case HTML and angle-destination neighbor matrix", async () => {
  const cases = [
    ["complete div block", "<div>\nFake title\n===\n\n", false],
    ["complete custom block", "<x-foo>\nFake title\n===\n\n", false],
    ["complete closing block", "</section>\nFake title\n===\n\n", false],
    ["comment block", "<!--\nFake title\n===\n-->\n", false],
    ["declaration block", "<!DOCTYPE\nFake title\n===\n>\n", false],
    ["processing block", "<?target\nFake title\n===\n?>\n", false],
    ["CDATA block", "<![CDATA[\nFake title\n===\n]]>\n", false],
    ["incomplete inline HTML remains heading", "<a title=\"open\n===\n", true],
    ["complete angle destination", "[r]: <https://example.invalid>\n\"open\nFake title\n===\n", false],
    ["angle destination with parentheses", "[r]: <https://example.invalid/(one)>\n\"open\nFake title\n===\n", false],
    ["angle destination with query fragment", "[r]: <https://example.invalid/?a=(b)#c>\n\"open\nFake title\n===\n", false],
    ["escaped angle punctuation", "[r]: <https://example.invalid/\\<one\\>>\n\"open\nFake title\n===\n", false],
    ["incomplete angle remains heading", "[r]: <https://example.invalid\n\"open\nReal title\n===\n", true],
    ["nested angle remains heading", "[r]: <https://example.invalid<nested>>\n\"open\nReal title\n===\n", true],
    ["unmatched closing angle remains heading", "[r]: https://example.invalid>\n\"open\nReal title\n===\n", true],
  ];
  const failures = [];
  for (const [name, documentText, expectedPass] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== expectedPass) failures.push(name);
    });
  }
  assert.equal(cases.length, 15);
  assert.deepEqual(failures, [], `HTML/angle neighbor failures (${failures.length}): ${failures.join(", ")}`);
});

test("nineteenth-review 38-case reference-destination character corpus", async () => {
  const malformed = [
    ["bare dangling escape", "[r]: /a\\\n\"open\nReal title\n===\n"],
    ["angle space", "[r]: <https://example.invalid/a b>\n\"open\nReal title\n===\n"],
    ["angle tab", "[r]: <https://example.invalid/a\tb>\r\n\"open\r\nReal title\r\n===\r\n"],
    ["angle NUL", "[r]: <https://example.invalid/a\u0000b>\n\"open\nReal title\n===\n"],
    ["angle unit separator", "[r]: <https://example.invalid/a\u001fb>\r\n\"open\nReal title\r\n===\r\n"],
    ["angle DEL", "[r]: <https://example.invalid/a\u007fb>\n\"open\nReal title\n===\n"],
    ["invalid next-line angle with space", "  [r]:\r\n  <https://example.invalid/a b>\n  \"open\r\n  Real title\n  ===\r\n"],
    ["invalid next-line dangling escape", "   [r]:\n   /a\\\r\n   \"open\n   Real title\r\n   ===\n"],
  ].map(([name, documentText]) => [name, documentText, true]);
  const rejectedNeighbors = [
    ["bare escaped space", "[r]: /a\\ b\n\"open\nReal title\n===\n"],
    ["bare escaped tab", "[r]: /a\\\tb\n\"open\nReal title\n===\n"],
  ].map(([name, documentText]) => [name, documentText, true]);
  const validDestinations = [
    ["percent escapes", "/a%20b"],
    ["percent-encoded tab", "/a%09b"],
    ["escaped parentheses", "/a\\(b\\)"],
    ["escaped backslash nonterminal", "/a\\\\b"],
    ["escaped punctuation", "/a\\?b\\#c"],
    ["Unicode bare", "/café/東京"],
    ["Unicode angle", "<https://example.invalid/café/東京>"],
    ["query and fragment", "/a?b=(c)#d"],
    ["balanced parentheses", "/a(b)"],
    ["nested balanced parentheses", "/a(b(c))"],
    ["complete angle URL", "<https://example.invalid/a?b=c#d>"],
    ["angle escaped punctuation", "<https://example.invalid/a\\>b>"],
    ["non-ASCII whitespace", "<https://example.invalid/a\u00a0b>"],
    ["bare percent query", "/a%2Fb?c=d#e"],
    ["bare Unicode query", "/café?x=東京#節"],
    ["angle Unicode query", "<https://example.invalid/café?x=東京#節>"],
    ["escaped bracket punctuation", "/a\\[b\\]"],
    ["escaped asterisk punctuation", "/a\\*b"],
    ["escaped underscore punctuation", "/a\\_b"],
    ["escaped tilde punctuation", "/a\\~b"],
    ["escaped backtick punctuation", "/a\\`b"],
    ["escaped brace punctuation", "/a\\{b\\}"],
    ["escaped colon punctuation", "/a\\:b"],
    ["escaped semicolon punctuation", "/a\\;b"],
    ["escaped comma punctuation", "/a\\,b"],
    ["escaped exclamation punctuation", "/a\\!b"],
    ["escaped equals punctuation", "/a\\=b"],
    ["escaped plus punctuation", "/a\\+b"],
  ];
  const placements = validDestinations.map(([name, destination], index) => {
    const indent = " ".repeat(index % 4);
    const endings = index % 3 === 0 ? ["\n", "\n"] : index % 3 === 1 ? ["\r\n", "\r\n"] : ["\r\n", "\n"];
    const definition = index % 2 === 0
      ? `${indent}[r]: ${destination}${endings[0]}`
      : `${indent}[r]:${endings[0]}${indent}${destination}${endings[1]}`;
    return [
      `${name} ${index % 2 === 0 ? "same-line" : "next-line"}`,
      `${definition}${indent}\"open${endings[0]}${indent}Fake title${endings[1]}${indent}===${endings[0]}`,
      false,
    ];
  });
  const cases = [...malformed, ...rejectedNeighbors, ...placements];
  const failures = [];
  for (const [name, documentText, expectedPass] of cases) {
    await withRepository({ documentText }, async (root) => {
      const result = await runValidator(root);
      if ((result.code === 0) !== expectedPass) failures.push(name);
    });
  }
  assert.equal(cases.length, 38);
  assert.deepEqual(
    failures,
    [],
    `Nineteenth-review destination failures (${failures.length}; ${cases.length - failures.length}/${cases.length} passed): ${failures.join(", ")}`,
  );
});

test("independent 115-case adjacent H1 scanner corpus", async () => {
  const valid = [
    ...[0, 1, 2, 3].flatMap((indent) =>
      ["\n", "\r\n"].flatMap((ending) =>
        ["", "\t "].map(
          (trailing) => `${" ".repeat(indent)}# Real title${trailing}${ending}${ending}**Status:** SPECIFIED${ending}`,
        ),
      ),
    ),
    ...[0, 1, 2, 3].flatMap((titleIndent) =>
      [0, 1, 2, 3].flatMap((underlineIndent) =>
        [
          ["\n", "\n"],
          ["\r\n", "\r\n"],
          ["\r\n", "\n"],
        ].map(
          ([titleEnding, underlineEnding]) =>
            `${" ".repeat(titleIndent)}Real title${titleEnding}${" ".repeat(underlineIndent)}===\t ${underlineEnding}${underlineEnding}**Status:** SPECIFIED${underlineEnding}`,
        ),
      ),
    ),
  ];
  const invalid = [
    ...["`", "~"].flatMap((marker) =>
      [0, 1, 2, 3].map((indent) => {
        const fence = marker.repeat(3);
        const spaces = " ".repeat(indent);
        return `${spaces}${fence}md\n# Fake title\n${spaces}${fence}\n\n**Status:** SPECIFIED\n`;
      }),
    ),
    ...["`", "~"].flatMap((marker) =>
      [0, 1, 2, 3].map((indent) => {
        const fence = marker.repeat(3);
        const spaces = " ".repeat(indent);
        return `${spaces}${fence}md\r\nFake title\r\n===\r\n${spaces}${fence}\r\n\r\n**Status:** SPECIFIED\r\n`;
      }),
    ),
    ...[0, 1, 2, 3].flatMap((titleIndent) =>
      [0, 1, 2].map(
        (underlineIndent) =>
          `${" ".repeat(titleIndent)}Real title\n${" ".repeat(underlineIndent)}---\n\n**Status:** SPECIFIED\n`,
      ),
    ),
    "\n===\n\n**Status:** SPECIFIED\n",
    " \n===\n\n**Status:** SPECIFIED\n",
    "  \r\n===\r\n\r\n**Status:** SPECIFIED\r\n",
    "   \n ===\n\n**Status:** SPECIFIED\n",
    ...["    Real title\n===\n", "     Real title\n===\n", "\tReal title\n===\n", "    Real title\r\n ===\r\n"].map(
      (body) => `${body}\n**Status:** SPECIFIED\n`,
    ),
    ...["Real title\n    ===\n", "Real title\n     ===\n", "Real title\n\t===\n", " Real title\r\n    ===\r\n"].map(
      (body) => `${body}\n**Status:** SPECIFIED\n`,
    ),
    "> Real title\n===\n\n**Status:** SPECIFIED\n",
    " > Real title\n ===\n\n**Status:** SPECIFIED\n",
    "  > Real title\r\n  ===\r\n\r\n**Status:** SPECIFIED\r\n",
    "- Real title\n===\n\n**Status:** SPECIFIED\n",
    "  * Real title\n ===\n\n**Status:** SPECIFIED\n",
    "3. Real title\r\n===\r\n\r\n**Status:** SPECIFIED\r\n",
    "Real title\n=== x\n\n**Status:** SPECIFIED\n",
    "Real title\n= =\n\n**Status:** SPECIFIED\n",
    "Real title\n==#\n\n**Status:** SPECIFIED\n",
    "Real title\n===\\\n\n**Status:** SPECIFIED\n",
    "Real title\n==== text\r\n\r\n**Status:** SPECIFIED\r\n",
  ];
  assert.equal(valid.length, 64);
  assert.equal(invalid.length, 51);
  const failures = [];
  for (const [expected, corpus] of [[true, valid], [false, invalid]]) {
    for (const [index, documentText] of corpus.entries()) {
      await withRepository({ documentText }, async (root) => {
        const result = await runValidator(root);
        if ((result.code === 0) !== expected) failures.push(`${expected ? "valid" : "invalid"}-${index + 1}`);
      });
    }
  }
  assert.deepEqual(failures, [], `H1 adjacent failures (${failures.length}): ${failures.join(", ")}`);
});

test("CommonMark fence boundaries suppress status-like content only while fenced", async () => {
  const allowed = [
    ...["`", "~"].flatMap((marker) =>
      [0, 1, 2, 3].map((indent) => {
        const fence = marker.repeat(3);
        const spaces = " ".repeat(indent);
        return `${spaces}${fence}md\n**Status:** IMPLEMENTED\n${spaces}${fence}`;
      }),
    ),
    "````md\n```\n**Status:** IMPLEMENTED\n```\n````",
    "~~~~md\n~~~\n**Status:** IMPLEMENTED\n~~~\n~~~~",
    "```md\n~~~\n**Status:** IMPLEMENTED\n~~~\n```",
    "~~~md\n```\n**Status:** IMPLEMENTED\n```\n~~~",
    "```md\n**Status:** IMPLEMENTED\n````",
    "~~~md\n**Status:** IMPLEMENTED\n~~~~~\t ",
    "````md\n```\n**Status:** IMPLEMENTED\n`````",
    "~~~~md\n~~~ trailing\n**Status:** IMPLEMENTED\n~~~~",
  ];
  for (const declaration of allowed) {
    await withRepository(
      { documentText: `# Example dossier document\n\n${declaration}\n` },
      async (root) => assertValidationPass(await runValidator(root)),
    );
  }

  await withRepository(
    {
      documentText:
        "# Example dossier document\n\n    ```md\n**Status:** BANANA\n    ```\n",
    },
    async (root) =>
      assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_INVALID"),
  );
});

test("indented ATX candidates and declarations after sections are scanned", async () => {
  for (const indent of [0, 1, 2, 3]) {
    await withRepository(
      {
        documents: [baseDocument({ status: "IMPLEMENTED" })],
        documentText: `# Example dossier document\n\n${" ".repeat(indent)}## Status\n\n\`SPECIFIED\`\n`,
      },
      async (root) =>
        assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_CONTRADICTION"),
    );
  }
  await withRepository(
    {
      documentText:
        "# Example dossier document\n\n## Ordinary section\n\n### Another section\n\n**Status:** BANANA\n",
    },
    async (root) =>
      assertValidationFailure(await runValidator(root), "DOCUMENT_STATUS_INVALID"),
  );
});

test("every current status prose declaration is exact and rejects boundary mutations", async () => {
  const forms = [
    ["bold", "APPROVED PLANNING BASELINE — implementation and production approval remain separate", "APPROVED"],
    ["bold", "APPROVED PLANNING BASELINE. Product and architecture decisions Q1–Q206 are approved; supporting specifications, legal values, vendor agreements, operating evidence, production activation, and public claims remain separately gated. This plan is not legal advice, certification, an executed agreement, or proof that Flowstate currently operates a compliant service.", "APPROVED"],
    ["bold", "APPROVED PRODUCT/ARCHITECTURE DECISIONS; WP0.3 is complete; WP0.4 implementation is technically verified and awaiting independent reviews and human acceptance; legal, vendor, policy, accountable-human, evidence, and production approvals remain `BLOCKED`; G0 remains `BLOCKED`; WP1.x is unauthorized", "APPROVED"],
    ["bold", "SPECIFIED BENCHMARK — G0 `BLOCKED`; WP1.x unauthorized; benchmark evidence only", "SPECIFIED"],
    ["bold", "SPECIFIED on 2026-09-23; G0 remains `BLOCKED`; WP1.x is unauthorized", "SPECIFIED"],
    ["bold", "`TECHNICALLY_VERIFIED` repository snapshot; root package gates are `BLOCKED` by missing local prerequisites  ", "TECHNICALLY_VERIFIED"],
    ["bold", "SPECIFIED PLANNING TARGET — WP0.3 reconciled; field inventory, legal values, vendors, agreements, accountable humans and deployed evidence remain `BLOCKED`; G0 remains `BLOCKED`", "SPECIFIED"],
    ["bold", "SPECIFIED counsel-input contract; all tenant/profile conclusions remain `COUNSEL_REVIEW_REQUIRED`; G0 remains `BLOCKED`", "SPECIFIED"],
    ["bold", "SPECIFIED — G0 `BLOCKED`; WP1.x unauthorized; staffing, operating evidence, exercises, legal review, vendor approval, profile approval, and production authorization remain `BLOCKED`", "SPECIFIED"],
    ["bold", "SPECIFIED — WP0.2 HUMAN REVIEWS ACCEPTED 2026-09-22; Gate G0 remains `BLOCKED`", "SPECIFIED"],
    ["bold", "SPECIFIED PLANNING TARGET — Gate G0 remains `BLOCKED`; no current compliance, implementation, operational-evidence, or production-approval claim", "SPECIFIED"],
    ["bold", "SPECIFIED PLANNING TARGET — Gate G0 remains `BLOCKED`; not implemented, deployed, legally reviewed, or approved for production", "SPECIFIED"],
    ["heading", "COMPLETED 2026-09-22 — TECHNICALLY VERIFIED; PROJECT OWNER ACCEPTED ALL FIVE REQUIRED WP0.2 REVIEW ROLES; G0 BLOCKED; PRE-EXISTING WP0.1 STATUS PATHS PRESENT", "APPROVED"],
    ["heading", "COMPLETED 2026-09-23 — SPECIFICATION PASS; TECHNICAL QUALITY APPROVED; HUMAN ACCEPTANCE RECORDED; WP0.4 AUTHORIZED BUT NOT STARTED; COUNSEL VALUES UNRESOLVED; G0 BLOCKED; WP1.x UNAUTHORIZED", "APPROVED"],
  ];
  const documentText = (kind, prose) =>
    kind === "heading"
      ? `# Example dossier document\n\n## Status\n\n\`${prose}\`\n`
      : `# Example dossier document\n\n**Status:** ${prose}\n`;

  for (const [kind, prose, status] of forms) {
    await withRepository(
      {
        documents: [baseDocument({ status })],
        documentText: documentText(kind, prose),
      },
      async (root) => assertValidationPass(await runValidator(root)),
    );
    for (const mutation of [`EXTRA ${prose}`, `${prose}EXTRA`, `${prose} EXTRA`]) {
      await withRepository(
        {
          documents: [baseDocument({ status })],
          documentText: documentText(kind, mutation),
        },
        async (root) => {
          const result = await runValidator(root);
          assertValidationFailure(result, "DOCUMENT_STATUS_INVALID");
          assert.equal(result.stderr.includes(prose), false);
        },
      );
    }
  }
});

test("the inherited evidence README may rely on valid manifest status when no declaration exists", async () => {
  const evidenceReadme = await readFile(
    path.join(repoRoot, dossierRoot, "evidence/README.md"),
    "utf8",
  );
  await withRepository(
    {
      documents: [baseDocument({ status: "SPECIFIED" })],
      documentText: evidenceReadme,
    },
    async (root) => assertValidationPass(await runValidator(root)),
  );
  await withRepository(
    {
      documents: [baseDocument({ status: "specified" })],
      documentText: evidenceReadme,
    },
    async (root) => assertValidationFailure(await runValidator(root), "MANIFEST_STATUS"),
  );
});

test("manifest profile approval requires a matching registered change", async () => {
  const document = baseDocument({ status: "APPROVED_FOR_PROFILE", affected_profiles: ["VIRGINIA"] });
  const change = approvedForProfileRecord({ affected_profiles: ["VIRGINIA"] });
  for (const [record, expected] of [
    [baseRecord(), "MANIFEST_PROFILE_APPROVAL_MISMATCH"],
    [{ ...change, document_ids: ["SYNTHETIC-DOC-0"] }, "MANIFEST_PROFILE_APPROVAL_MISMATCH"],
    [{ ...change, affected_profiles: ["BC_PRIVATE_CLINIC"] }, "MANIFEST_PROFILE_APPROVAL_MISMATCH"],
    [{ ...change, approval: undefined }, "APPROVAL_REQUIRED"],
    [change, null],
  ]) {
    await withRepository({ documents: [document], records: [record], documentText: "# Synthetic document\n" }, async (root) => {
      const result = await runValidator(root);
      if (expected) assertValidationFailure(result, expected);
      else assertValidationPass(result);
    });
  }
});

test("duplicate IDs and paths, ordering, and path escape fail", async () => {
  await withRepository(
    {
      documents: [
        baseDocument(),
        baseDocument({ title: "Duplicate", path: examplePath }),
      ],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "MANIFEST_DUPLICATE_DOCUMENT_ID");
      assert.match(result.stderr, /MANIFEST_DUPLICATE_PATH/);
      assert.match(result.stderr, /MANIFEST_ORDER/);
    },
  );
  await withRepository(
    { documents: [baseDocument({ path: "../outside.md" })] },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "MANIFEST_PATH");
    },
  );
});

test("an invalid manifest document path is not read", async () => {
  const schema = JSON.parse(await readFile(path.join(repoRoot, manifestSchemaPath), "utf8"));
  const pattern = new RegExp(schema.$defs.document.properties.path.pattern);
  for (const invalid of [".md", `${dossierRoot}/absent.txt`, "folder/../absent.md", "line\nbreak.md"]) {
    assert.equal(pattern.test(invalid), false);
    await withRepository({ documents: [baseDocument({ path: invalid })] }, async (root) => {
      assertValidationFailure(await runValidator(root), "MANIFEST_PATH");
    });
  }
  assert.equal(pattern.test(examplePath), true);
  await withRepository({}, async (root) => {
    await unlink(path.join(root, examplePath));
    const result = await runValidator(root);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /^TOOLING_ERROR category=READ_FAILED /);
  });
});

test("dossier registration excludes unrelated repository documents", async () => {
  const outsidePath = "docs/standard-synthetic.md";
  await withRepository({ documents: [baseDocument({ path: outsidePath })] }, async (root) => {
    await writeFile(path.join(root, outsidePath), "# Synthetic Standard document\n");
    assertValidationFailure(await runValidator(root), "MANIFEST_PATH");
    const schema = JSON.parse(await readFile(path.join(root, manifestSchemaPath), "utf8"));
    const pattern = new RegExp(schema.$defs.document.properties.path.pattern);
    assert.equal(pattern.test(outsidePath), false);
    assert.equal(pattern.test(examplePath), true);
  });

  await withRepository({}, async (root) => {
    await writeFile(path.join(root, outsidePath), "# Synthetic Standard document\n");
    await unlink(path.join(root, examplePath));
    await symlink(path.join(root, outsidePath), path.join(root, examplePath));
    assertValidationFailure(await runValidator(root), "DOCUMENT_PATH_ESCAPE");
  });
});

test("symlinks cannot escape the repository", async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "flowstate-pro-outside-"));
  await writeFile(path.join(outside, "outside.md"), "# Outside\n");
  try {
    await withRepository({}, async (root) => {
      await unlink(path.join(root, examplePath));
      await symlink(path.join(outside, "outside.md"), path.join(root, examplePath));
      const result = await runValidator(root);
      assertValidationFailure(result, "DOCUMENT_PATH_ESCAPE");
    });
  } finally {
    await rm(outside, { force: true, recursive: true });
  }
});

test("governed JSON symlinks cannot escape the repository", async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "flowstate-pro-outside-"));
  const outsideSchema = path.join(outside, "manifest-schema.json");
  await copyFile(path.join(repoRoot, manifestSchemaPath), outsideSchema);
  try {
    await withRepository({}, async (root) => {
      await unlink(path.join(root, manifestSchemaPath));
      await symlink(outsideSchema, path.join(root, manifestSchemaPath));
      assertValidationFailure(await runValidator(root), "GOVERNED_PATH_ESCAPE");
    });
  } finally {
    await rm(outside, { force: true, recursive: true });
  }
});

test("repository-path references must exist and cannot escape through symlinks", async () => {
  await withRepository(
    { documents: [baseDocument({ source: ["docs/missing-source.md"] })] },
    async (root) =>
      assertValidationFailure(await runValidator(root), "REFERENCE_MISSING"),
  );

  const outside = await mkdtemp(path.join(os.tmpdir(), "flowstate-pro-reference-"));
  await writeFile(path.join(outside, "outside.md"), "# Outside\n");
  try {
    await withRepository(
      { documents: [baseDocument({ source: ["docs/reference.md"] })] },
      async (root) => {
        await mkdir(path.join(root, "docs"), { recursive: true });
        await symlink(
          path.join(outside, "outside.md"),
          path.join(root, "docs/reference.md"),
        );
        assertValidationFailure(await runValidator(root), "REFERENCE_PATH_ESCAPE");
      },
    );
  } finally {
    await rm(outside, { force: true, recursive: true });
  }
});

test("repository-path references reject symlinks in intermediate components", async () => {
  await withRepository(
    { documents: [baseDocument({ source: ["docs/link/nested/reference.md"] })] },
    async (root) => {
      const realDirectory = path.join(root, "docs/real/nested");
      await mkdir(realDirectory, { recursive: true });
      await writeFile(path.join(realDirectory, "reference.md"), "# Reference\n");
      await symlink(path.join(root, "docs/real"), path.join(root, "docs/link"));
      assertValidationFailure(await runValidator(root), "REFERENCE_SYMLINK");
    },
  );

  await withRepository(
    { documents: [baseDocument({ source: ["docs/real/nested/reference.md"] })] },
    async (root) => {
      const realDirectory = path.join(root, "docs/real/nested");
      await mkdir(realDirectory, { recursive: true });
      await writeFile(path.join(realDirectory, "reference.md"), "# Reference\n");
      assertValidationPass(await runValidator(root));
    },
  );
});

test("all repository-path reference fields must resolve", async () => {
  const missing = (name) => `docs/missing-${name}.md`;
  await withRepository(
    {
      documents: [
        baseDocument({
          source: [missing("manifest-source")],
          evidence_references: [missing("manifest-evidence")],
        }),
      ],
      records: [
        baseRecord({
          status: "APPROVED",
          legal_value: true,
          source: [missing("record-source")],
          evidence_references: [missing("record-evidence")],
          transition: {
            from_status: "OWNER_APPROVAL_REQUIRED",
            to_status: "APPROVED",
            prerequisite_evidence: {
              OWNER_APPROVAL_REQUIRED: [missing("prerequisite")],
            },
            approval_reference: missing("transition-approval"),
          },
          approval: namedApproval({
            evidence_reference: missing("approval-evidence"),
          }),
        }),
      ],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "REFERENCE_MISSING");
      for (const field of [
        "source",
        "evidence_references",
        "OWNER_APPROVAL_REQUIRED",
        "approval_reference",
        "approval.evidence_reference",
      ]) {
        assert.ok(result.stderr.includes(`field=${field}`));
      }
    },
  );
});

test("transition graph blocks direct profile approval and missing prerequisites", async () => {
  const direct = approvedForProfileRecord({
    transition: {
      ...approvedForProfileRecord().transition,
      from_status: "SPECIFIED",
    },
  });
  await withRepository({ records: [direct] }, async (root) => {
    const result = await runValidator(root);
    assertValidationFailure(result, "TRANSITION_APPROVED_FOR_PROFILE_SOURCE");
  });

  const incomplete = approvedForProfileRecord();
  delete incomplete.transition.prerequisite_evidence.EVIDENCE_COMPLETE;
  await withRepository({ records: [incomplete] }, async (root) => {
    const result = await runValidator(root);
    assertValidationFailure(result, "TRANSITION_MISSING_PREREQUISITE");
    assert.match(result.stderr, /field=EVIDENCE_COMPLETE/);
  });
  const reused = approvedForProfileRecord();
  reused.transition.prerequisite_evidence.EVIDENCE_COMPLETE = [
    ...reused.transition.prerequisite_evidence.SPECIFIED,
  ];
  await withRepository({ records: [reused] }, async (root) =>
    assertValidationFailure(await runValidator(root), "TRANSITION_PREREQUISITE_REUSE"));
  const schema = JSON.parse(await readFile(path.join(repoRoot, registerSchemaPath), "utf8"));
  const graph = schema.$defs.transition.allOf.find((rule) => rule.if?.properties?.to_status?.enum?.includes("BLOCKED"));
  const rules = schema["x-transition-rules"];
  assert.deepEqual(graph.else?.anyOf.map(({ properties }) => [properties.from_status.const, properties.to_status.const]),
    [...rules.adjacent, [rules.approved_for_profile_from, "APPROVED_FOR_PROFILE"]]);
  assert.deepEqual(graph.else.anyOf.at(-1).properties.prerequisite_evidence.required,
    rules.approved_for_profile_prerequisites);
});

test("adjacent and complete profile-approval transitions pass synthetically", async () => {
  await withRepository({}, async (root) => {
    assertValidationPass(await runValidator(root));
  });
  await withRepository(
    { records: [approvedForProfileRecord()] },
    async (root) => assertValidationPass(await runValidator(root)),
  );
});

test("profile approval requires a named person regardless of legal-value classification", async () => {
  const { approval, ...record } = approvedForProfileRecord({ legal_value: false });
  await withRepository({ records: [record] }, async (root) =>
    assertValidationFailure(await runValidator(root), "APPROVAL_REQUIRED"));
  await withRepository({ records: [{ ...record, approval }] }, async (root) =>
    assertValidationPass(await runValidator(root)));
});

test("dispositions append a non-activating record with predecessor evidence", async () => {
  const schema = JSON.parse(await readFile(path.join(repoRoot, registerSchemaPath), "utf8"));
  const rule = schema.$defs.transition.allOf.find((branch) => branch.if?.properties?.to_status?.enum?.includes("BLOCKED"));
  const terminal = ["BLOCKED", "NOT_APPLICABLE", "SUPERSEDED"];
  assert.deepEqual(rule?.if.properties.to_status.enum, terminal);
  assert.deepEqual(rule.then.anyOf.map(({ properties }) => properties.from_status.const),
    approvedStatuses.filter((status) => !terminal.includes(status)));
  for (const { properties } of rule.then.anyOf) {
    assert.deepEqual(properties.prerequisite_evidence.required, [properties.from_status.const]);
  }
  for (const status of ["BLOCKED", "NOT_APPLICABLE", "SUPERSEDED"]) {
    const transition = {
      from_status: "SPECIFIED",
      to_status: status,
      prerequisite_evidence: { SPECIFIED: ["SYNTHETIC-PRIOR-SPECIFICATION"] },
    };
    const disposition = baseRecord({ change_id: "WP0.4-CC-002", status, transition });
    await withRepository({
      documents: [baseDocument({ status: "APPROVED_FOR_PROFILE", latest_change_id: disposition.change_id })],
      documentText: "# Example\n\n**Status:** APPROVED_FOR_PROFILE\n",
      records: [baseRecord(), disposition],
    }, async (root) =>
      assertValidationFailure(await runValidator(root), "MANIFEST_DISPOSITION_MISMATCH"));
    for (const [record, diagnostic] of [
      [disposition, null],
      [{ ...disposition, change_id: "WP0.4-CC-001" }, "REGISTER_DUPLICATE_CHANGE_ID"],
      [{ ...disposition, transition: { ...transition, prerequisite_evidence: { DRAFT: ["SYNTHETIC-DRAFT"] } } }, "TRANSITION_MISSING_PREREQUISITE"],
      [{ ...disposition, transition: { ...transition, approval_reference: "SYNTHETIC-APPROVAL" } }, "TRANSITION_APPROVAL_REFERENCE_FORBIDDEN"],
      [{ ...disposition, status: "IMPLEMENTED", transition: { ...transition, from_status: status, to_status: "IMPLEMENTED" } }, "TRANSITION_UNLISTED"],
      [{ ...disposition, transition: { ...transition, from_status: status } }, "TRANSITION_UNLISTED"],
    ]) {
      await withRepository({ records: [baseRecord(), record] }, async (root) => {
        const result = await runValidator(root);
        if (diagnostic) assertValidationFailure(result, diagnostic);
        else assertValidationPass(result);
      });
    }
  }
});

test("bounded role grammar rejects titles without excluding names that share role words", async () => {
  const titles = ["General Counsel", "deputy  general counsel", "Product  owner", "Chief Legal Officer",
    "Legal Counsel", "Staff Counsel", "Privacy Officer", "ACTING\u00a0Data Protection Officer",
    "Senior Staff Counsel", "In-House Counsel", "Security Director", "Chief Compliance Officer"];
  const names = ["Zoë Counsel", "李小龍", "Jean-Luc O’Neill", "Example Officer"];
  for (const approver_name of [...titles, ...names]) {
    const record = approvedForProfileRecord({ legal_value: false, approval: namedApproval({ approver_name }) });
    await withRepository({ records: [record] }, async (root) => {
      const result = await runValidator(root);
      if (names.includes(approver_name)) assertValidationPass(result);
      else assertValidationFailure(result, "APPROVAL_NAMED_PERSON");
    });
  }
});

test("prerequisite status keys use the same vocabulary in the schema and CLI", async () => {
  const schema = JSON.parse(await readFile(path.join(repoRoot, registerSchemaPath), "utf8"));
  const keyRule = schema.$defs.transition.properties.prerequisite_evidence.propertyNames;
  for (const [key, valid] of [["DRAFT", true], ["draft", false], ["UNKNOWN", false]]) {
    const record = baseRecord();
    record.transition.prerequisite_evidence = { [key]: ["SYNTHETIC-DRAFT-001"] };
    await withRepository({ records: [record] }, async (root) => {
      const result = await runValidator(root);
      if (valid) assertValidationPass(result);
      else assertValidationFailure(result, "TRANSITION_PREREQUISITE_ENTRY");
    });
    assert.equal(keyRule ? schema.$defs[keyRule.$ref.split("/").at(-1)].enum.includes(key) : true, valid, key);
  }
});

test("approval name schema and CLI agree on raw name spelling", async () => {
  const schema = JSON.parse(await readFile(path.join(repoRoot, registerSchemaPath), "utf8"));
  const rule = schema.$defs.approval.properties.approver_name;
  const pattern = new RegExp(rule.pattern, "u");
  const excluded = new RegExp(rule.not.pattern, "u");
  for (const [approver_name, valid] of [
    ["[REDACTED]", false], ["redacted", false],
    ["oPeRaTiOnS/qA-aSsUrAnCe", false], ["LEGAL/COUNSEL", false],
    ["  Zoë Counsel  ", false], ["Zoë Counsel\n", false], ["\tZoë Counsel", false],
    ["Zoë  Counsel", true], ["𠮷", true],
  ]) {
    const record = approvedForProfileRecord({ approval: namedApproval({ approver_name }) });
    await withRepository({ records: [record] }, async (root) => {
      const result = await runValidator(root);
      if (valid) assertValidationPass(result);
      else assertValidationFailure(result, "APPROVAL_NAMED_PERSON");
    });
    assert.equal(pattern.test(approver_name) && !excluded.test(approver_name), valid,
      `schema verdict for ${JSON.stringify(approver_name)}`);
  }
});

test("progression and approvals cannot cite terminal disposition records as evidence", async () => {
  const disposition = baseRecord({ change_id: "WP0.4-CC-002", status: "BLOCKED", transition: {
    from_status: "SPECIFIED", to_status: "BLOCKED",
    prerequisite_evidence: { SPECIFIED: ["SYNTHETIC-SPECIFICATION"] },
  } });
  const approval = approvedForProfileRecord({ change_id: "WP0.4-CC-003" });
  approval.transition.prerequisite_evidence.EVIDENCE_COMPLETE = [disposition.change_id];
  await withRepository({ records: [baseRecord(), disposition, approval] }, async (root) =>
    assertValidationFailure(await runValidator(root), "TRANSITION_DISPOSITION_EVIDENCE"));
  const progress = baseRecord({ change_id: approval.change_id, status: "IMPLEMENTED", transition: {
    from_status: "SPECIFIED", to_status: "IMPLEMENTED",
    prerequisite_evidence: { SPECIFIED: [disposition.change_id] },
  } });
  const approvalRecord = approvedForProfileRecord({ change_id: approval.change_id });
  for (const record of [
    progress,
    { ...approvalRecord, transition: { ...approvalRecord.transition, approval_reference: disposition.change_id } },
    { ...approvalRecord, approval: { ...approvalRecord.approval, evidence_reference: disposition.change_id } },
    { ...approvalRecord, evidence_references: [disposition.change_id] },
  ]) {
    await withRepository({ records: [baseRecord(), disposition, record] }, async (root) =>
      assertValidationFailure(await runValidator(root), "TRANSITION_DISPOSITION_EVIDENCE"));
  }
});

test("record and document IDs require strings without coercion", async () => {
  for (const value of [["EXAMPLE-DOC"], { toString: null }]) {
    await withRepository({ documents: [baseDocument({ document_id: value })], records: [baseRecord({
      document_ids: ["SYNTHETIC-DOC-0"],
    })] }, async (root) =>
      assertValidationFailure(await runValidator(root), "MANIFEST_DOCUMENT_ID"));
  }
  const value = { toString: null };
  await withRepository({ documents: [baseDocument({ latest_change_id: value })], records: [baseRecord({ change_id: value })] }, async (root) => {
    const result = await runValidator(root);
    assertValidationFailure(result, "REGISTER_CHANGE_ID");
    assert.match(result.stderr, /MANIFEST_CHANGE_ID/);
  });
});

test("closed schema roots reject additional keywords", async () => {
  for (const file of [manifestSchemaPath, registerSchemaPath]) {
    await withRepository({}, async (root) => {
      const schema = JSON.parse(await readFile(path.join(root, file), "utf8"));
      await writeJson(root, file, { ...schema, not: {} });
      assertValidationFailure(await runValidator(root), "SCHEMA_CONTRACT_DRIFT");
    });
  }
});

test("approval timestamps accept published leap seconds, not invented ones", async () => {
  for (const [approved_at, valid] of [
    ["2016-12-31T23:59:60Z", true], ["2017-01-01t00:59:60.2+01:00", true],
    ["2017-12-31T23:59:60Z", false], ["2016-12-31T22:59:60Z", false],
  ]) {
    const record = approvedForProfileRecord({ approval: namedApproval({ approved_at }) });
    await withRepository({ records: [record] }, async (root) => {
      const result = await runValidator(root);
      if (valid) assertValidationPass(result);
      else assertValidationFailure(result, "APPROVAL_TIMESTAMP");
    });
  }
});

test("approval timestamps require RFC 3339 syntax even without format assertions", async () => {
  const schema = JSON.parse(await readFile(path.join(repoRoot, registerSchemaPath), "utf8"));
  const pattern = new RegExp(schema.$defs.approval.properties.approved_at.pattern);
  for (const [approved_at, valid] of [["2026-09-23t15:00:00z", true], ["tomorrow", false], ["2026-09-23T24:00:00Z", false]]) {
    assert.equal(pattern.test(approved_at), valid);
    const record = approvedForProfileRecord({ approval: namedApproval({ approved_at }) });
    await withRepository({ records: [record] }, async (root) => {
      const result = await runValidator(root);
      if (valid) assertValidationPass(result);
      else assertValidationFailure(result, "APPROVAL_TIMESTAMP");
    });
  }
});

test("approved legal values require valid named approval metadata", async () => {
  await withRepository(
    { records: [approvedForProfileRecord({ approval: namedApproval({ approver_name: "Legal/counsel" }) })] },
    async (root) => assertValidationFailure(await runValidator(root), "APPROVAL_NAMED_PERSON"),
  );
  const approvedTransition = {
    from_status: "OWNER_APPROVAL_REQUIRED",
    to_status: "APPROVED",
    prerequisite_evidence: {
      OWNER_APPROVAL_REQUIRED: ["SYNTHETIC-OWNER-001"],
    },
    approval_reference: "PROTECTED-APPROVAL-001",
  };
  await withRepository(
    {
      records: [
        baseRecord({
          status: "APPROVED",
          legal_value: true,
          transition: approvedTransition,
        }),
      ],
    },
    async (root) =>
      assertValidationFailure(await runValidator(root), "APPROVAL_REQUIRED"),
  );
  await withRepository(
    {
      records: [
        baseRecord({
          status: "APPROVED",
          legal_value: true,
          transition: approvedTransition,
          approval: namedApproval({
            approver_name: "cOuNsEl",
            approved_at: "2026-02-30T15:00:00Z",
          }),
        }),
      ],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "APPROVAL_NAMED_PERSON");
      assert.match(result.stderr, /APPROVAL_TIMESTAMP/);
    },
  );
  await withRepository(
    {
      records: [
        baseRecord({
          status: "APPROVED",
          legal_value: true,
          transition: approvedTransition,
          approval: namedApproval({ approved_at: "2026-09-23t15:00:00z" }),
        }),
      ],
    },
    async (root) => assertValidationPass(await runValidator(root)),
  );
});

test("superseded_text must be explicit and non-empty", async () => {
  for (const superseded_text of ["", "   "]) {
    await withRepository(
      { records: [baseRecord({ superseded_text })] },
      async (root) =>
        assertValidationFailure(
          await runValidator(root),
          "REGISTER_SUPERSEDED_TEXT",
        ),
    );
  }
  await withRepository({}, async (root) => {
    assertValidationPass(await runValidator(root));
  });
});

test("invalid secret-shaped document IDs never reach diagnostics", async () => {
  const secretId = ["Bearer ", "IndependentSecretToken9999"].join("");
  await withRepository(
    {
      documents: [baseDocument({ document_id: secretId })],
      records: [baseRecord({ document_ids: [secretId] })],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "MANIFEST_DOCUMENT_ID");
      assert.doesNotMatch(result.stderr, /IndependentSecretToken9999|SecretToken|Bearer/);
    },
  );
});

test("secret-shaped unreadable paths never reach tooling diagnostics", async () => {
  const secretPath = [`${dossierRoot}/Bearer `, "SyntheticSecretToken99999.md"].join("");
  await withRepository(
    { documents: [baseDocument({ path: secretPath })] },
    async (root) => {
      const result = await runValidator(root);
      assert.equal(result.code, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /path=UNKNOWN_PATH/);
      assert.doesNotMatch(result.stderr, /Bearer|SyntheticSecretToken99999|SecretToken/);
    },
  );
});

test("card-shaped substrings never reach validation or tooling diagnostics", async () => {
  const sample = "4242".repeat(4);
  for (const stem of [`2.fixture-${sample}`, `2-${sample}-3`]) {
    const documentPath = `${dossierRoot}/${stem}.md`;
    const documentId = `FIXTURE-${stem.toUpperCase()}`;
    await withRepository({ documents: [baseDocument({ path: documentPath, document_id: documentId })] }, async (root) => {
      const missing = await runValidator(root);
      assert.equal(missing.code, 2);
      assert.ok(!missing.stderr.includes(sample), "tooling locator disclosed the test value");
      assert.match(missing.stderr, /^TOOLING_ERROR category=READ_FAILED path=UNKNOWN_PATH/);

      await writeFile(path.join(root, documentPath), "# Synthetic document\n\n**Status:** INVALID\n");
      const invalid = await runValidator(root);
      assert.ok(!invalid.stderr.includes(sample), "validation locator disclosed the test value");
      assertValidationFailure(invalid, "PAYMENT_CARD_LUHN");
      assert.match(invalid.stderr, /^DOCUMENT_STATUS_INVALID UNKNOWN_PATH id=INVALID_ID\b/m);
    });
  }
});

test("secret-shaped unknown field names never reach diagnostics", async () => {
  const cases = [
    ["manifest root", ["Bearer ", "SyntheticSecretToken99999"].join(""), (manifest) => manifest],
    ["manifest entry", "client_secret", (manifest) => manifest.documents[0]],
    ["register root", ["4242", " 4242", " 4242", " 4242"].join(""), (_, register) => register],
    ["register record", ["-----BEGIN ", "CONTRACT", "-----"].join(""), (_, register) => register.records[0]],
    ["transition", ["Bearer ", "TransitionSecretToken99999"].join(""), (_, register) => register.records[0].transition],
    ["approval", ["Bearer ", "ApprovalSecretToken999999"].join(""), (_, register) => register.records[0].approval],
  ];
  for (const [name, secretKey, select] of cases) {
    const approved = approvedForProfileRecord();
    await withRepository({ records: [approved] }, async (root) => {
      const manifest = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
      const register = JSON.parse(await readFile(path.join(root, registerPath), "utf8"));
      select(manifest, register)[secretKey] = true;
      await writeJson(root, manifestPath, manifest);
      await writeJson(root, registerPath, register);
      const result = await runValidator(root);
      assertValidationFailure(result, "UNKNOWN_FIELD");
      assert.match(result.stderr, /field=UNKNOWN_FIELD/);
      assert.equal(result.stderr.includes(secretKey), false, name);
    });
  }

  await withRepository({}, async (root) => {
    const manifest = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
    manifest.documents[0].ordinary_extra = true;
    await writeJson(root, manifestPath, manifest);
    const result = await runValidator(root);
    assertValidationFailure(result, "MANIFEST_UNKNOWN_FIELD");
    assert.match(result.stderr, /field=ordinary_extra/);
  });
});

test("secret-shaped content is rejected without value disclosure", async () => {
  const cases = [
    ["PRIVATE_KEY_HEADER", ["-----BEGIN ", "PRIVATE KEY", "-----"].join("")],
    ["AWS_ACCESS_KEY", ["AKIA", "EXAMPLE000000000"].join("")],
    ["GITHUB_TOKEN", ["ghp_", "A".repeat(36)].join("")],
    ["STRIPE_LIVE_SECRET", ["sk_", "live_", "A1".repeat(12)].join("")],
    ["GOOGLE_API_KEY", ["AI", "za", "A1".repeat(17), "A"].join("")],
    ["JWT", ["eyJ", "AAAAAA1A", ".", "BBBBBB2B", ".", "CCCCCC3C"].join("")],
    ["BEARER_TOKEN", ["Bearer ", "SyntheticAlphabeticToken"].join("")],
    [
      "QUOTED_CREDENTIAL_ASSIGNMENT",
      ["client", "_secret", "=\"", "SyntheticValue", "\""].join(""),
    ],
    [
      "DATABASE_URL_CREDENTIALS",
      ["postgresql://", "example", ":", "synthetic", "@db.invalid/test"].join(""),
    ],
    ["PAYMENT_CARD_LUHN", ["4242", " 4242", " 4242", " 4242"].join("")],
    ["CONTRACT_BODY_MARKER", ["-----BEGIN ", "CONTRACT", "-----"].join("")],
  ];
  for (const [category, sentinel] of cases) {
    await withRepository(
      { documentText: `# Example dossier document\n\n**Status:** SPECIFIED\n\n${sentinel}\n` },
      async (root) => {
        const result = await runValidator(root);
        assertValidationFailure(result, "PROHIBITED_CONTENT");
        assert.match(result.stderr, new RegExp(`category=${category}`));
        assert.match(result.stderr, /id=EXAMPLE-DOC/);
        assert.doesNotMatch(result.stderr, new RegExp(sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      },
    );
  }
});

test("only fully redacted credential values are exempt", async () => {
  const sample = "synthetic-fixture";
  for (const [category, value] of [
    ["QUOTED_CREDENTIAL_ASSIGNMENT", `password="[REDACTED]${sample}"`],
    ["DATABASE_URL_CREDENTIALS", `postgresql://example:${sample}@db.invalid/[REDACTED]`],
    ["DATABASE_URL_CREDENTIALS", `postgresql://${sample}:[REDACTED]@db.invalid/test`],
  ]) {
    await withRepository({ documentText: `# Example dossier document\n\n**Status:** SPECIFIED\n\n${value}\n` }, async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "PROHIBITED_CONTENT");
      assert.match(result.stderr, new RegExp(`category=${category}`));
      assert.ok(!result.stderr.includes(sample));
    });
  }
  await withRepository({
    documentText: '# Example dossier document\n\n**Status:** SPECIFIED\n\npassword="[REDACTED]" password="********"\npostgresql://[REDACTED]:[REDACTED]@db.invalid/test\n',
  }, async (root) => assertValidationPass(await runValidator(root)));
});

test("prohibited JSON payload keys fail while redacted/reference-only controls pass", async () => {
  const unsafeValue = ["synthetic", " prohibited", " payload"].join("");
  await withRepository(
    {
      records: [baseRecord({ contract_text: unsafeValue })],
    },
    async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "PROHIBITED_JSON_PAYLOAD");
      assert.match(result.stderr, /field=UNKNOWN_FIELD/);
      assert.match(result.stderr, /id=WP0.4-CC-001/);
      assert.doesNotMatch(result.stderr, new RegExp(unsafeValue));
    },
  );
  await withRepository(
    {
      documentText:
        "# Example dossier document\n\n**Status:** SPECIFIED\n\nContract and agreement metadata only. password=\"[REDACTED]\".\n",
      records: [
        baseRecord({
          evidence_references: ["PROTECTED-CONTRACT-REFERENCE-001"],
        }),
      ],
    },
    async (root) => assertValidationPass(await runValidator(root)),
  );
});

test("quoted credential values use their own closing delimiter", async () => {
  const sample = "synthetic-fixture";
  for (const value of [`password="[REDACTED]'${sample}"`, `password='[REDACTED]"${sample}'`,
    String.raw`password="[REDACTED]\"${sample}"`]) {
    await withRepository({ documentText: `# Example dossier document\n\n**Status:** SPECIFIED\n\n${value}\n` }, async (root) => {
      const result = await runValidator(root);
      assertValidationFailure(result, "category=QUOTED_CREDENTIAL_ASSIGNMENT");
      assert.ok(!result.stderr.includes(sample));
    });
  }
});

test("fenced JSON credential assignments are scanned without value disclosure", async () => {
  const sample = "synthetic-fixture";
  for (const value of [sample, "[REDACTED]"]) {
    const literal = JSON.stringify({ password: value });
    const escaped = literal.replace('"password"', String.raw`"\u0070assword"`);
    for (const snippet of [literal, escaped]) {
      await withRepository({ documentText: `# Example dossier document\n\n**Status:** SPECIFIED\n\n\`\`\`json\n${snippet}\n\`\`\`\n` }, async (root) => {
        const result = await runValidator(root);
        if (value === sample) {
          assertValidationFailure(result, "category=QUOTED_CREDENTIAL_ASSIGNMENT");
          assert.ok(!result.stderr.includes(sample));
        } else assertValidationPass(result);
      });
    }
    await withRepository({ records: [baseRecord({ password: value })] }, async (root) => {
      const target = path.join(root, registerPath);
      await writeFile(target, (await readFile(target, "utf8")).replace('"password"', String.raw`"\u0070assword"`));
      const result = await runValidator(root);
      assert.equal(result.code, 1); // The register schema also rejects unknown fields.
      assert.equal(result.stderr.includes("category=QUOTED_CREDENTIAL_ASSIGNMENT"), value === sample);
      assert.ok(!result.stderr.includes(sample));
    });
  }
});

test("Markdown and governed JSON reject non-redacted payload members without printing them", async () => {
  const sample = "synthetic evidence body fixture";
  for (const [value, reject] of [
    [sample, true], [[sample], true], [{ body: sample }, true], [0, true], [false, true],
    ["[REDACTED]", false], [" ", false], [null, false], [[], false], [{}, false],
  ]) {
    const snippet = JSON.stringify({ nested: [{ contract_text: value }] }, null, 2);
    for (const [options, location] of [
      [{ documentText: `# Example dossier document\n\n**Status:** SPECIFIED\n\n~~~json\n${snippet}\n~~~\n` }, examplePath],
      [{ records: [baseRecord({ contract_text: value })] }, registerPath],
    ]) {
      await withRepository(options, async (root) => {
        const result = await runValidator(root);
        const payloadFindings = result.stderr.split("\n").filter((line) => line.includes("PROHIBITED_JSON_PAYLOAD"));
        if (reject) {
          assertValidationFailure(result, "PROHIBITED_JSON_PAYLOAD");
          assert.ok(payloadFindings.some((line) => line.includes(location)));
          assert.ok(!result.stderr.includes(sample));
        } else {
          assert.deepEqual(payloadFindings, []);
          if (location !== registerPath) assertValidationPass(result);
        }
      });
    }
  }
});

test("Markdown scans JSON members independently of earlier prose quotes", async () => {
  const sample = "synthetic evidence body fixture";
  for (const [value, reject] of [[sample, true], ["[REDACTED]", false]]) {
    const snippet = String.raw`Draft " notes: {"\u0063ontract_body": ${JSON.stringify(value)}}`;
    await withRepository({ documentText: `# Example dossier document\n\n**Status:** SPECIFIED\n\n${snippet}\n` }, async (root) => {
      const result = await runValidator(root);
      if (reject) {
        assertValidationFailure(result, "PROHIBITED_JSON_PAYLOAD");
        assert.ok(!result.stderr.includes(sample));
      } else assertValidationPass(result);
    });
  }
});

test("governed JSON and Markdown scan decoded strings without printing their values", async () => {
  const sample = "synthetic-fixture";
  for (const value of [sample, "[REDACTED]"]) {
    const reason = `password="${value}"`;
    await withRepository({ records: [baseRecord({ [reason]: "metadata" })] }, async (root) => {
      const result = await runValidator(root);
      assert.equal(result.code, 1); // Unknown record fields are independently invalid.
      assert.equal(result.stderr.includes("category=QUOTED_CREDENTIAL_ASSIGNMENT"), value === sample);
      assert.ok(!result.stderr.includes(sample));
    });
    for (const options of [
      { records: [baseRecord({ reason })] },
      ...[{ evidence_description: reason }, { evidence_description: [reason] }, reason, { [reason]: "metadata" }].map((snippet) => ({
        documentText: `# Example dossier document\n\n**Status:** SPECIFIED\n\n~~~json\n${JSON.stringify(snippet)}\n~~~\n`,
      })),
    ]) {
      await withRepository(options, async (root) => {
        const result = await runValidator(root);
        if (value === sample) {
          assertValidationFailure(result, "PROHIBITED_CONTENT");
          assert.match(result.stderr, /category=QUOTED_CREDENTIAL_ASSIGNMENT/);
          assert.ok(!result.stderr.includes(sample));
        } else assertValidationPass(result);
      });
    }
  }
});

test("governed JSON rejects duplicate members before using parsed data", async () => {
  for (const [file, key] of [[registerPath, "schema_version"], [registerSchemaPath, "type"]]) {
    await withRepository({}, async (root) => {
      const target = path.join(root, file);
      const text = await readFile(target, "utf8");
      const escapedKey = `"\\u${key.charCodeAt(0).toString(16).padStart(4, "0")}${key.slice(1)}"`;
      const token = key === "type" ? '"type": "string"' : `"${key}":`;
      const rewritten = text.replace(token, `${escapedKey}: "synthetic-fixture", ${token}`);
      assert.notEqual(rewritten, text);
      await writeFile(target, rewritten);
      const result = await runValidator(root);
      assertValidationFailure(result, "DUPLICATE_JSON_MEMBER");
      assert.ok(!result.stderr.includes("synthetic-fixture"));
    });
  }
});

test("governed inputs must be regular files", { skip: process.platform === "win32" }, async () => {
  for (const file of [manifestPath, examplePath]) {
    await withRepository({}, async (root) => {
      const target = path.join(root, file);
      await unlink(target);
      await execFileAsync("mkfifo", [target]);
      const result = await runNode([validatorPath, "--root", root], { timeout: 3000 });
      assert.equal(result.code, 2);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, `TOOLING_ERROR category=READ_FAILED path=${file}\n`);
    });
  }
});

test("malformed JSON is exit 1; missing required files and CLI misuse are exit 2", async () => {
  await withRepository({}, async (root) => {
    await writeFile(path.join(root, manifestPath), "{not-json\n");
    const result = await runValidator(root);
    assertValidationFailure(result, "MALFORMED_JSON");
  });
  await withRepository({}, async (root) => {
    await unlink(path.join(root, registerSchemaPath));
    const result = await runValidator(root);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^TOOLING_ERROR category=READ_FAILED /);
    assert.doesNotMatch(result.stderr, /\n\s*at\s/);
  });
  for (const args of [["--unknown"], ["--root"], ["--root", "--root"], ["--root", ".", "--root", "."]]) {
    const usage = await runNode([validatorPath, ...args]);
    assert.equal(usage.code, 2);
    assert.equal(usage.stdout, "");
    assert.equal(usage.stderr, "TOOLING_ERROR category=USAGE path=command-line\n");
  }
});

test("invalid governed root shapes are validation findings and invalid UTF-8 is tooling failure", async () => {
  for (const [file, value, code] of [
    [manifestPath, [], "MANIFEST_ROOT_TYPE"],
    [manifestPath, null, "MANIFEST_ROOT_TYPE"],
    [manifestPath, { schema_version: 1, documents: {} }, "MANIFEST_DOCUMENTS_TYPE"],
    [manifestPath, { schema_version: 1, documents: [null] }, "MANIFEST_TYPE"],
    [registerPath, null, "REGISTER_ROOT_TYPE"],
    [registerPath, { schema_version: 1, records: {} }, "REGISTER_RECORDS_TYPE"],
    [registerPath, { schema_version: 1, records: [null] }, "REGISTER_TYPE"],
  ]) {
    await withRepository({}, async (root) => {
      await writeJson(root, file, value);
      assertValidationFailure(await runValidator(root), code);
    });
  }
  await withRepository({}, async (root) => {
    await writeFile(path.join(root, examplePath), Uint8Array.from([0xff]));
    const result = await runValidator(root);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      `TOOLING_ERROR category=INVALID_UTF8 path=${examplePath}\n`,
    );
  });
});

test("structurally invalid readable schemas are validation findings", async () => {
  await withRepository({}, async (root) => {
    await writeJson(root, manifestSchemaPath, {});
    assertValidationFailure(await runValidator(root), "SCHEMA_CONTRACT");
  });
});

test("required dossier documents cannot be removed from the manifest", async () => {
  await withRepository({}, async (root) => {
    const indexPath = `${dossierRoot}/README.md`;
    const manifest = JSON.parse(await readFile(path.join(root, manifestPath), "utf8"));
    await writeFile(path.join(root, indexPath), "# Synthetic dossier index\n");
    manifest.documents = manifest.documents.filter((entry) => entry.path !== indexPath);
    await writeJson(root, manifestPath, manifest);
    const result = await runValidator(root);
    assertValidationFailure(result, "MANIFEST_REQUIRED_DOCUMENT");
    assert.match(result.stderr, /flowstate-pro\/README\.md/);
  });
});

test("schema contract accepts reordered object members", async () => {
  await withRepository({}, async (root) => {
    const reorder = (value) => Array.isArray(value) ? value.map(reorder)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]))
        : value;
    for (const file of [manifestSchemaPath, registerSchemaPath]) {
      const schema = JSON.parse(await readFile(path.join(root, file), "utf8"));
      await writeJson(root, file, reorder(schema));
    }
    assertValidationPass(await runValidator(root));
  });
});

test("every canonical schema contract mutation fails through production", async () => {
  const mutations = [
    [manifestSchemaPath, (s) => { s.$schema = "https://example.invalid/schema"; }],
    [manifestSchemaPath, (s) => { s.$id = "flowstate-pro/drifted-manifest.schema.json"; }],
    [manifestSchemaPath, (s) => { s.title = "Drift"; }],
    [manifestSchemaPath, (s) => { s.type = "array"; }],
    [manifestSchemaPath, (s) => { s.additionalProperties = true; }],
    [manifestSchemaPath, (s) => s.required.pop()],
    [manifestSchemaPath, (s) => { s.properties.schema_version.const = 2; }],
    [manifestSchemaPath, (s) => { s.properties.documents.type = "object"; }],
    [manifestSchemaPath, (s) => { s.properties.documents.minItems = 0; }],
    [manifestSchemaPath, (s) => { s.properties.documents.items.$ref = "#/$defs/status"; }],
    [manifestSchemaPath, (s) => s.$defs.status.enum.pop()],
    [manifestSchemaPath, (s) => s.$defs.accountableFunction.enum.pop()],
    [manifestSchemaPath, (s) => { s.$defs.profile.pattern = ".*"; }],
    [manifestSchemaPath, (s) => { s.$defs.nonEmptyString.minLength = 0; }],
    [manifestSchemaPath, (s) => { s.$defs.nonEmptySortedUniqueStrings.uniqueItems = false; }],
    [manifestSchemaPath, (s) => { s.$defs.nonEmptySortedUniqueStrings.items.$ref = "#/$defs/status"; }],
    [manifestSchemaPath, (s) => { s.$defs.reference.maxLength = 512; }],
    [manifestSchemaPath, (s) => { s.$defs.referenceArray.items.$ref = "#/$defs/nonEmptyString"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.additionalProperties = true; }],
    [manifestSchemaPath, (s) => s.$defs.document.required.pop()],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.document_id.pattern = ".*"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.path.pattern = ".*"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.title.$ref = "#/$defs/status"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.status.$ref = "#/$defs/nonEmptyString"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.owner.$ref = "#/$defs/nonEmptyString"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.source.$ref = "#/$defs/nonEmptySortedUniqueStrings"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.affected_profiles.items.$ref = "#/$defs/nonEmptyString"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.effective_date.format = "date-time"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.effective_date.pattern = ".*"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.required_review.items.$ref = "#/$defs/nonEmptyString"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.evidence_references.$ref = "#/$defs/nonEmptySortedUniqueStrings"; }],
    [manifestSchemaPath, (s) => { s.$defs.document.properties.latest_change_id.pattern = ".*"; }],
    [manifestSchemaPath, (s) => { s["x-ordering"].documents = "unspecified"; }],
    [registerSchemaPath, (s) => { s.$schema = "https://example.invalid/schema"; }],
    [registerSchemaPath, (s) => { s.$id = "flowstate-pro/drifted-register.schema.json"; }],
    [registerSchemaPath, (s) => { s.title = "Drift"; }],
    [registerSchemaPath, (s) => { s.type = "array"; }],
    [registerSchemaPath, (s) => { s.additionalProperties = true; }],
    [registerSchemaPath, (s) => s.required.pop()],
    [registerSchemaPath, (s) => { s.properties.schema_version.const = 2; }],
    [registerSchemaPath, (s) => { s.properties.records.type = "object"; }],
    [registerSchemaPath, (s) => { s.properties.records.minItems = 0; }],
    [registerSchemaPath, (s) => { s.properties.records.items.$ref = "#/$defs/status"; }],
    [registerSchemaPath, (s) => { s.$defs.approval.additionalProperties = true; }],
    [registerSchemaPath, (s) => s.$defs.approval.required.pop()],
    [registerSchemaPath, (s) => { s.$defs.approval.properties.approver_name.not.pattern = "^Legal$"; }],
    [registerSchemaPath, (s) => { s.$defs.approval.properties.approver_role.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.approval.properties.approved_at.format = "date"; }],
    [registerSchemaPath, (s) => { s.$defs.approval.properties.scope.$ref = "#/$defs/status"; }],
    [registerSchemaPath, (s) => { s.$defs.approval.properties.evidence_reference.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.approval.properties.candidate_identity.$ref = "#/$defs/status"; }],
    [registerSchemaPath, (s) => { s.$defs.transition.additionalProperties = true; }],
    [registerSchemaPath, (s) => s.$defs.transition.required.pop()],
    [registerSchemaPath, (s) => { s.$defs.transition.properties.from_status.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.transition.properties.to_status.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.transition.properties.prerequisite_evidence.minProperties = 0; }],
    [registerSchemaPath, (s) => { s.$defs.transition.properties.prerequisite_evidence.additionalProperties.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.transition.properties.approval_reference.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.transition.allOf = []; }],
    [registerSchemaPath, (s) => { s.$defs.record.additionalProperties = true; }],
    [registerSchemaPath, (s) => s.$defs.record.required.pop()],
    [registerSchemaPath, (s) => { s.$defs.record.properties.change_id.pattern = ".*"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.document_ids.$ref = "#/$defs/referenceArray"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.status.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.owner.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.reason.$ref = "#/$defs/status"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.source.$ref = "#/$defs/nonEmptySortedUniqueStrings"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.affected_profiles.items.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.effective_date.format = "date-time"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.superseded_text.$ref = "#/$defs/status"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.required_review.items.$ref = "#/$defs/nonEmptyString"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.evidence_references.$ref = "#/$defs/nonEmptySortedUniqueStrings"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.transition.$ref = "#/$defs/status"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.legal_value.type = "string"; }],
    [registerSchemaPath, (s) => { s.$defs.record.properties.approval.$ref = "#/$defs/status"; }],
    [registerSchemaPath, (s) => { s.$defs.record.allOf = []; }],
    [registerSchemaPath, (s) => { s["x-ordering"].records = "unspecified"; }],
    [registerSchemaPath, (s) => { s["x-transition-rules"].adjacent = [["DRAFT", "IMPLEMENTED"]]; }],
  ];
  const contractKeys = [
    "$schema",
    "$id",
    "title",
    "type",
    "additionalProperties",
    "required",
    "properties",
    "$defs",
    "x-ordering",
    "x-transition-rules",
  ];
  const leafPaths = (value, prefix = []) => {
    if (value === null || typeof value !== "object") return [prefix];
    return Object.entries(value).flatMap(([key, child]) =>
      leafPaths(child, [...prefix, Array.isArray(value) ? Number(key) : key])
    );
  };
  for (const schemaPath of [manifestSchemaPath, registerSchemaPath]) {
    const schema = JSON.parse(await readFile(path.join(repoRoot, schemaPath), "utf8"));
    const contract = Object.fromEntries(
      contractKeys.filter((key) => Object.hasOwn(schema, key)).map((key) => [key, schema[key]]),
    );
    for (const leafPath of leafPaths(contract)) {
      mutations.push([
        schemaPath,
        (candidate) => {
          let target = candidate;
          for (const key of leafPath.slice(0, -1)) target = target[key];
          const key = leafPath.at(-1);
          const value = target[key];
          target[key] = typeof value === "boolean"
            ? !value
            : typeof value === "number"
              ? value + 1
              : `${value}-DRIFT`;
        },
      ]);
    }
  }
  for (const [schemaPath, mutate] of mutations) {
    await withRepository({}, async (root) => {
      const schema = JSON.parse(
        await readFile(path.join(root, schemaPath), "utf8"),
      );
      mutate(schema);
      await writeJson(root, schemaPath, schema);
      const result = await runValidator(root);
      assertValidationFailure(result, "SCHEMA_");
    });
  }
});

test("diagnostics are sorted and byte-stable", async () => {
  await withRepository(
    {
      documents: [
        baseDocument({ status: "bad", effective_date: "bad", owner: "" }),
      ],
    },
    async (root) => {
      const first = await runValidator(root);
      const second = await runValidator(root);
      assert.equal(first.code, 1);
      assert.equal(first.stderr, second.stderr);
      const lines = first.stderr.trim().split("\n");
      const diagnostics = lines.slice(0, -1);
      assert.deepEqual(diagnostics, [...diagnostics].sort());
    },
  );
});

test("schema contracts retain required fields, vocabulary, and transition rules", async () => {
  const [manifestSchema, registerSchema] = await Promise.all([
    readFile(path.join(repoRoot, manifestSchemaPath), "utf8").then(JSON.parse),
    readFile(path.join(repoRoot, registerSchemaPath), "utf8").then(JSON.parse),
  ]);
  assert.equal(
    manifestSchema.$schema,
    "https://json-schema.org/draft/2020-12/schema",
  );
  assert.equal(
    manifestSchema.$id,
    "flowstate-pro/dossier-document-metadata.schema.json",
  );
  assert.equal(
    registerSchema.$schema,
    "https://json-schema.org/draft/2020-12/schema",
  );
  assert.equal(
    registerSchema.$id,
    "flowstate-pro/change-control-record.schema.json",
  );
  assert.deepEqual(manifestSchema.$defs.document.required, [
    "document_id",
    "path",
    "title",
    "status",
    "owner",
    "source",
    "affected_profiles",
    "effective_date",
    "required_review",
    "evidence_references",
    "latest_change_id",
  ]);
  assert.deepEqual(registerSchema.$defs.status.enum, manifestSchema.$defs.status.enum);
  assert.deepEqual(manifestSchema.$defs.status.enum, approvedStatuses);
  assert.deepEqual(
    manifestSchema.$defs.accountableFunction.enum,
    registerSchema.$defs.accountableFunction.enum,
  );
  assert.deepEqual(manifestSchema.$defs.accountableFunction.enum, accountableFunctions);
  assert.deepEqual(
    manifestSchema.$defs.document.properties.required_review,
    {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { $ref: "#/$defs/accountableFunction" },
    },
  );
  assert.deepEqual(
    registerSchema.$defs.record.properties.required_review,
    {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { $ref: "#/$defs/accountableFunction" },
    },
  );
  assert.equal(manifestSchema.$defs.nonEmptyString.pattern, "\\S");
  assert.equal(
    manifestSchema.$defs.document.properties.effective_date.format,
    "date",
  );
  const manifestPathPattern = new RegExp(
    manifestSchema.$defs.document.properties.path.pattern,
  );
  assert.equal(manifestPathPattern.test(examplePath), true);
  assert.equal(manifestPathPattern.test("../example.md"), false);
  assert.equal(manifestPathPattern.test("docs/../example.md"), false);
  assert.equal(manifestPathPattern.test("docs/./example.md"), false);
  assert.equal(manifestPathPattern.test("/docs/example.md"), false);
  assert.equal(manifestPathPattern.test("docs\\\\example.md"), false);
  assert.deepEqual(registerSchema.$defs.approval.required, [
    "approver_name",
    "approver_role",
    "approved_at",
    "scope",
    "evidence_reference",
    "candidate_identity",
  ]);
  assert.equal(
    registerSchema.$defs.approval.properties.approved_at.format,
    "date-time",
  );
  assert.equal(
    registerSchema.$defs.approval.properties.approver_role.$ref,
    "#/$defs/accountableFunction",
  );
  assert.equal(
    registerSchema.$defs.record.properties.superseded_text.$ref,
    "#/$defs/nonEmptyString",
  );
  assert.equal(registerSchema.$defs.record.allOf.length, 1);
  const statusBindings = registerSchema.$defs.record.oneOf ?? [];
  for (const [status, valid] of [["SPECIFIED", true], ["IMPLEMENTED", false]]) {
    const record = baseRecord({ status });
    await withRepository({ records: [record] }, async (root) => {
      const result = await runValidator(root);
      if (valid) assertValidationPass(result);
      else assertValidationFailure(result, "TRANSITION_TO_STATUS");
    });
    const matches = statusBindings.filter(({ properties }) =>
      properties.status.const === status &&
      properties.transition.properties.to_status.const === record.transition.to_status);
    assert.equal(matches.length, valid ? 1 : 0);
  }
  assert.deepEqual(statusBindings.map(({ properties }) => properties.status.const), approvedStatuses);
  for (const { properties } of statusBindings) {
    assert.equal(properties.transition.properties.to_status.const, properties.status.const);
  }
  assert.deepEqual(registerSchema.$defs.transition.allOf, [
    {
      if: {
        properties: { to_status: { enum: ["APPROVED", "LEGALLY_REVIEWED", "APPROVED_FOR_PROFILE"] } },
        required: ["to_status"],
      },
      then: { required: ["approval_reference"] },
      else: { not: { required: ["approval_reference"] } },
    },
    registerSchema.$defs.transition.allOf.find((rule) => rule.if?.properties?.to_status?.enum?.includes("BLOCKED")),
  ]);
  const excludedName = new RegExp(registerSchema.$defs.approval.properties.approver_name.not.pattern, "u");
  for (const role of accountableFunctions) {
    assert.ok(excludedName.test(role.toLowerCase()));
    assert.ok(excludedName.test(role.toUpperCase()));
  }
  assert.equal(
    new RegExp(
      registerSchema.$defs.approval.properties.approver_name.pattern,
    ).test("cOuNsEl"),
    false,
  );
  assert.equal(manifestSchema.$defs.reference.maxLength, 256);
  assert.deepEqual(
    manifestSchema.$defs.reference.anyOf,
    registerSchema.$defs.reference.anyOf,
  );
  assert.deepEqual(
    registerSchema["x-transition-rules"].approved_for_profile_prerequisites,
    [
      "SPECIFIED",
      "IMPLEMENTED",
      "TECHNICALLY_VERIFIED",
      "OPERATIONALLY_EXERCISED",
      "EVIDENCE_COMPLETE",
      "LEGALLY_REVIEWED",
      "OWNER_APPROVAL_REQUIRED",
    ],
  );
});

test("current dossier passes and package scripts remain dependency-free", async () => {
  const result = await runNode([validatorPath], { cwd: repoRoot });
  assertValidationPass(result);

  const rootPackage = JSON.parse(
    await readFile(path.join(repoRoot, "package.json"), "utf8"),
  );
  assert.equal(
    rootPackage.scripts["validate:pro-compliance-dossier"],
    "node scripts/pro-compliance/validate-dossier.mjs",
  );
  assert.equal(
    rootPackage.scripts["test:pro-compliance-dossier"],
    "node --test tests/tooling/pro-compliance-dossier.test.mjs",
  );
  const dependencyNames = Object.keys({
    ...rootPackage.dependencies,
    ...rootPackage.devDependencies,
  });
  assert.deepEqual(
    dependencyNames.filter((name) => /ajv|json.?schema/i.test(name)),
    [],
  );
  const lockfileDiff = await execFileAsync(
    "git",
    ["diff", "--name-only", "--", "pnpm-lock.yaml"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(lockfileDiff.stdout, "");
});
