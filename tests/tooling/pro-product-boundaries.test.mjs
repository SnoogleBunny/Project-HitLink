import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const proWorkspaces = new Map([
  ["apps/pro-provider-web", "@flowstate/pro-provider-web"],
  ["apps/pro-patient-web", "@flowstate/pro-patient-web"],
  ["apps/pro-api", "@flowstate/pro-api"],
  ["packages/pro-db", "@flowstate/pro-db"],
]);

const proBrowsers = new Set([
  "@flowstate/pro-provider-web",
  "@flowstate/pro-patient-web",
]);
const dependencyFields = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
];
const generatedDirectories = new Set([
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

function displayPath(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function packageName(specifier) {
  const pattern = specifier.startsWith("@") ? /^@[^/]+\/[^/@]+/ : /^[^/@]+/;
  return specifier.match(pattern)?.[0];
}

function pathIsInside(directory, file) {
  const relative = path.relative(directory, file);
  return (
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep)
  );
}

function isInstalledDependency(file) {
  return file.split(path.sep).includes("node_modules");
}

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && !generatedDirectories.has(entry.name)) {
      yield* sourceFiles(file);
    } else if (entry.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)) {
      yield file;
    }
  }
}

function sourceReferences(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const references = [
    ...source.referencedFiles,
    ...source.typeReferenceDirectives,
  ].map(({ fileName, pos }) => ({ specifier: fileName, position: pos }));

  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    } else if (ts.isExternalModuleReference(node)) {
      specifier = node.expression;
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      specifier = node.argument.literal;
    } else if (ts.isCallExpression(node)) {
      const target = node.expression;
      if (
        target.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(target) && target.text === "require") ||
        (ts.isPropertyAccessExpression(target) &&
          ((target.expression.getText(source) === "module" &&
            target.name.text === "require") ||
            (target.expression.getText(source) === "require" &&
              target.name.text === "resolve")))
      ) {
        specifier = node.arguments[0];
      }
    }
    if (specifier && ts.isStringLiteralLike(specifier)) {
      references.push({
        specifier: specifier.text,
        position: specifier.getStart(source),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return references.map(({ specifier, position }) => ({
    specifier,
    line: source.getLineAndCharacterOfPosition(position).line + 1,
  }));
}

function checkBoundaries(root) {
  root = realpathSync(root);
  const violations = [];
  const workspaces = [];
  const workspacesByName = new Map();

  for (const [directory, name] of proWorkspaces) {
    const file = path.join(root, directory, "package.json");
    const manifest = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : {};
    if (manifest.name !== name) {
      violations.push(`${directory}/package.json must declare ${name}`);
    } else if (manifest.private !== true) {
      violations.push(`${directory}/package.json must set private to true`);
    }
  }

  // These are the two package patterns in pnpm-workspace.yaml.
  for (const group of ["apps", "packages"]) {
    const base = path.join(root, group);
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const directory = path.join(base, entry.name);
      const file = path.join(directory, "package.json");
      if (!entry.isDirectory() || !existsSync(file)) continue;

      const manifest = JSON.parse(readFileSync(file, "utf8"));
      const workspace = {
        directory,
        manifest,
        name: manifest.name,
        pro: proWorkspaces.has(displayPath(root, directory)),
      };
      workspaces.push(workspace);
      if (workspacesByName.has(workspace.name)) {
        violations.push(
          `${displayPath(root, file)} duplicates workspace name ${workspace.name}`,
        );
      }
      workspacesByName.set(workspace.name, workspace);
    }
  }

  function owner(file) {
    if (isInstalledDependency(path.relative(root, file))) return undefined;
    return workspaces.find((workspace) =>
      pathIsInside(workspace.directory, file),
    );
  }

  function checkEdge(from, to, location, specifier) {
    if (from === to) return;
    if (from.pro !== to.pro) {
      violations.push(
        `${location} ${from.name} references "${specifier}" across products (${to.name})`,
      );
    } else if (
      from.pro &&
      !(from.name === "@flowstate/pro-api" && to.name === "@flowstate/pro-db")
    ) {
      violations.push(
        `${location} ${from.name} references "${specifier}" across Pro workspaces (${to.name})`,
      );
    }
  }

  function checkBrowserExternal(from, location, specifier) {
    if (proBrowsers.has(from.name)) {
      violations.push(
        `${location} ${from.name} references unapproved browser dependency "${specifier}"`,
      );
    }
  }

  const resolutionByConfig = new Map();
  function resolveModule(specifier, file) {
    const config = ts.findConfigFile(path.dirname(file), ts.sys.fileExists);
    if (!resolutionByConfig.has(config)) {
      const options = config
        ? ts.getParsedCommandLineOfConfigFile(
            config,
            {},
            {
              ...ts.sys,
              readDirectory: () => [],
              onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                throw new Error(
                  ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
                );
              },
            },
          ).options
        : { moduleResolution: ts.ModuleResolutionKind.Bundler };
      const cache = ts.createModuleResolutionCache(
        root,
        (fileName) => fileName,
        options,
      );
      resolutionByConfig.set(config, { options, cache });
    }
    const { options, cache } = resolutionByConfig.get(config);
    return ts.resolveModuleName(specifier, file, options, ts.sys, cache)
      .resolvedModule?.resolvedFileName;
  }

  for (const workspace of workspaces) {
    const manifestLocation = `${displayPath(root, workspace.directory)}/package.json`;
    for (const field of dependencyFields) {
      for (const [name, version] of Object.entries(
        workspace.manifest[field] ?? {},
      )) {
        const location = `${manifestLocation} ${field}`;
        const alias = version.match(/^(?:npm|workspace):(.+)$/)?.[1];
        const local =
          version.match(/^(?:file|link):(.+)$/)?.[1] ??
          version.match(/^workspace:(\.{1,2}[/\\].+)$/)?.[1];
        const localPath = local && path.resolve(workspace.directory, local);
        const target = local
          ? owner(existsSync(localPath) ? realpathSync(localPath) : localPath)
          : (workspacesByName.get(packageName(alias ?? name)) ??
            workspacesByName.get(name));
        if (target) {
          checkEdge(workspace, target, location, name);
        } else if (workspace.pro && local) {
          violations.push(
            `${location} ${workspace.name} references "${name}" outside of any workspace`,
          );
        } else if (field !== "devDependencies") {
          checkBrowserExternal(workspace, location, name);
        }
      }
    }

    for (const file of sourceFiles(workspace.directory)) {
      for (const { specifier, line } of sourceReferences(file)) {
        const location = `${displayPath(root, file)}:${line}`;
        const explicitPath = specifier.startsWith("file:")
          ? fileURLToPath(specifier)
          : path.isAbsolute(specifier) || /^\.{1,2}[/\\]/.test(specifier)
            ? path.resolve(path.dirname(file), specifier)
            : undefined;
        const resolved = specifier.startsWith("file:")
          ? explicitPath
          : resolveModule(specifier, file);
        const realResolved =
          resolved &&
          (existsSync(resolved) ? realpathSync(resolved) : resolved);
        const localPath = realResolved ?? explicitPath;
        const resolvedRepositoryPath =
          realResolved &&
          pathIsInside(root, realResolved) &&
          !isInstalledDependency(path.relative(root, realResolved));
        const target =
          (localPath && owner(localPath)) ??
          (!explicitPath && workspacesByName.get(packageName(specifier)));
        if (target) {
          checkEdge(workspace, target, location, specifier);
        } else if (workspace.pro && (explicitPath || resolvedRepositoryPath)) {
          violations.push(
            `${location} ${workspace.name} references "${specifier}" outside of any workspace`,
          );
        } else {
          checkBrowserExternal(workspace, location, specifier);
        }
      }
    }
  }

  return violations.sort();
}

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "flowstate-boundary-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  function write(file, content) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }

  for (const [directory, name] of proWorkspaces) {
    write(directory + "/package.json", { name, private: true });
  }
  write("apps/standard-web/package.json", { name: "standard-web" });
  write("packages/db/package.json", { name: "@flowstate/db" });
  write("packages/shared/package.json", { name: "@flowstate/shared" });
  write("apps/standard-web/session.ts", "export const session = 'synthetic';");
  write(
    "packages/pro-db/repository.ts",
    "export const repository = 'synthetic';",
  );
  return { root, write };
}

test("real workspace follows the Pro product boundaries", () => {
  const violations = checkBoundaries(repoRoot);
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("synthetic workspace rejects Pro imports of Standard packages and app modules", (t) => {
  const { root, write } = fixture(t);
  write(
    "apps/pro-api/entry.ts",
    [
      'import "@flowstate/db/client";',
      'export { session } from "../standard-web/session";',
      "void import(`@flowstate/db/roles`);",
      'require("@flowstate/db/stripe");',
    ].join("\n"),
  );
  const violations = checkBoundaries(root).join("\n");
  assert.match(violations, /entry\.ts:1.*@flowstate\/db\/client/);
  assert.match(violations, /entry\.ts:2.*\.\.\/standard-web\/session/);
  assert.match(violations, /entry\.ts:3.*@flowstate\/db\/roles/);
  assert.match(violations, /entry\.ts:4.*@flowstate\/db\/stripe/);
});

test("synthetic workspace rejects Standard imports of Pro through package and path aliases", (t) => {
  const { root, write } = fixture(t);
  write("apps/standard-web/tsconfig.json", {
    compilerOptions: { paths: { "$clinical/*": ["../../packages/pro-db/*"] } },
  });
  const absoluteImport = JSON.stringify(
    path.join(root, "packages/pro-db/repository.ts").split(path.sep).join("/"),
  );
  write(
    "apps/standard-web/entry.ts",
    [
      'import type { Repository } from "@flowstate/pro-db/clinical";',
      'export * from "$clinical/repository";',
      `import ${absoluteImport};`,
    ].join("\n"),
  );
  const violations = checkBoundaries(root).join("\n");
  assert.match(violations, /entry\.ts:1.*@flowstate\/pro-db\/clinical/);
  assert.match(violations, /entry\.ts:2.*\$clinical\/repository/);
  assert.match(violations, /entry\.ts:3.*pro-db\/repository\.ts/);
});

test("synthetic Pro browser workspaces reject server packages, repositories and vendor SDKs", (t) => {
  const { root, write } = fixture(t);
  write(
    "apps/pro-provider-web/entry.ts",
    [
      'import { PrismaClient } from "@prisma/client";',
      'export * from "@flowstate/pro-api/policy";',
      'void import("../../packages/pro-db/repository");',
    ].join("\n"),
  );
  write(
    "apps/pro-patient-web/entry.cjs",
    'require("@example/kms-storage-sdk");',
  );
  write("apps/pro-patient-web/package.json", {
    name: "@flowstate/pro-patient-web",
    private: true,
    dependencies: { "@example/runtime-sdk": "1.0.0" },
  });
  const violations = checkBoundaries(root).join("\n");
  assert.match(violations, /pro-provider-web\/entry\.ts:1.*@prisma\/client/);
  assert.match(
    violations,
    /pro-provider-web\/entry\.ts:2.*@flowstate\/pro-api\/policy/,
  );
  assert.match(violations, /pro-provider-web\/entry\.ts:3.*pro-db\/repository/);
  assert.match(
    violations,
    /pro-patient-web\/entry\.cjs:1.*@example\/kms-storage-sdk/,
  );
  assert.match(
    violations,
    /pro-patient-web\/package\.json.*@example\/runtime-sdk/,
  );
});

test("synthetic workspace rejects sharing data-bearing code across product lines", (t) => {
  const { root, write } = fixture(t);
  write(
    "packages/shared/data.ts",
    "export interface SyntheticPolicy { readonly synthetic: true }",
  );
  write(
    "apps/standard-web/entry.ts",
    'export type { SyntheticPolicy } from "@flowstate/shared/data";',
  );
  write(
    "apps/pro-api/entry.ts",
    'export type { SyntheticPolicy } from "@flowstate/shared/data";',
  );
  write("apps/pro-api/package.json", {
    name: "@flowstate/pro-api",
    private: true,
    devDependencies: { "shared-alias": "workspace:@flowstate/shared@*" },
  });
  write("packages/shared/package.json", {
    name: "@flowstate/shared",
    optionalDependencies: { "pro-repository": "file:../pro-db" },
  });
  const violations = checkBoundaries(root).join("\n");
  assert.match(violations, /pro-api\/entry\.ts:1.*@flowstate\/shared\/data/);
  assert.match(
    violations,
    /pro-api\/package\.json.*shared-alias.*@flowstate\/shared/,
  );
  assert.match(
    violations,
    /shared\/package\.json.*pro-repository.*@flowstate\/pro-db/,
  );
  assert.doesNotMatch(violations, /standard-web\/entry\.ts/);
});

test("synthetic workspace permits local and Standard imports and the Pro API database edge", (t) => {
  const { root, write } = fixture(t);
  write("apps/pro-api/package.json", {
    name: "@flowstate/pro-api",
    private: true,
    dependencies: { "@flowstate/pro-db": "workspace:*" },
  });
  write("apps/pro-api/entry.ts", 'import "@flowstate/pro-db/repository";');
  write(
    "apps/standard-web/entry.ts",
    [
      'import "@flowstate/db";',
      'const sample = "import @flowstate/pro-db";',
      '// import "@flowstate/pro-db";',
    ].join("\n"),
  );
  write("apps/pro-provider-web/local.ts", "export const synthetic = true;");
  write(
    "apps/pro-provider-web/entry.ts",
    'export { synthetic } from "./local";',
  );
  write("apps/pro-provider-web/.next/output.js", 'import "@flowstate/db";');
  assert.deepEqual(checkBoundaries(root), []);
});

test("synthetic workspace requires all four named Pro manifests to be private", (t) => {
  const { root, write } = fixture(t);
  rmSync(path.join(root, "apps/pro-patient-web/package.json"));
  write("packages/pro-db/package.json", {
    name: "synthetic-replacement",
    private: true,
  });
  write("apps/pro-api/package.json", {
    name: "@flowstate/pro-api",
    private: false,
  });
  const violations = checkBoundaries(root).join("\n");
  assert.match(
    violations,
    /apps\/pro-patient-web\/package\.json.*@flowstate\/pro-patient-web/,
  );
  assert.match(
    violations,
    /packages\/pro-db\/package\.json.*@flowstate\/pro-db/,
  );
  assert.match(violations, /apps\/pro-api\/package\.json.*private/);
});

test("synthetic workspace rejects the reverse Pro database to API edge", (t) => {
  const { root, write } = fixture(t);
  write(
    "packages/pro-db/repository.ts",
    'export type Policy = import("@flowstate/pro-api/policy").Policy;',
  );
  const violations = checkBoundaries(root).join("\n");
  assert.match(violations, /pro-db\/repository\.ts:1.*across Pro workspaces/);
});

test("synthetic Pro source cannot reach unowned repository code through a path alias", (t) => {
  const { root, write } = fixture(t);
  write("apps/pro-api/tsconfig.json", {
    compilerOptions: { paths: { "$synthetic/*": ["../../synthetic/*"] } },
  });
  write("synthetic/policy.ts", "export const fixture = true;");
  write("apps/pro-api/entry.ts", 'import "$synthetic/policy";');
  const violations = checkBoundaries(root).join("\n");
  assert.match(
    violations,
    /pro-api\/entry\.ts:1.*\$synthetic\/policy.*outside of any workspace/,
  );
});
