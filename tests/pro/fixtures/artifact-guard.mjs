import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertSyntheticEnvironment, canary } from "./synthetic.mjs";

const maxBytes = 8 * 1024 * 1024;
const textExtensions =
  /\.(?:log|txt|json|jsonl|ndjson|trace|network|har|html|js|mjs|cjs|css|svg|map|csv)$/i;
const imageExtensions = /\.(?:png|jpe?g)$/i;
const decoder = new TextDecoder("utf-8", { fatal: true });

function normalized(input) {
  return input
    .replace(/\\u([0-9a-f]{4})|%([0-9a-f]{2})/gi, (_, wide, narrow) =>
      String.fromCharCode(Number.parseInt(wide ?? narrow, 16)),
    )
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const marker = normalized(canary);
const containsCanary = (text) => normalized(text).includes(marker);

function tool(command, args, input) {
  try {
    return execFileSync(command, args, {
      input,
      maxBuffer: maxBytes,
      timeout: 15_000,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
  } catch {
    throw new Error(`Artifact inspection failed using ${command}`);
  }
}

function contentHasCanary(name, contents) {
  if (textExtensions.test(name))
    return containsCanary(decoder.decode(contents));
  if (imageExtensions.test(name)) {
    return containsCanary(
      decoder.decode(tool("tesseract", ["stdin", "stdout"], contents)),
    );
  }
  throw new Error("Unsupported artifact format");
}

export function scanArtifacts(input) {
  assertSyntheticEnvironment();
  const root = path.resolve(input);
  let stats;
  try {
    stats = lstatSync(root);
  } catch {
    throw new Error("Artifact input is unavailable");
  }
  const findings = [];

  function inspect(file, label, stat) {
    if (stat.isDirectory()) {
      for (const name of readdirSync(file).sort()) {
        const child = path.join(file, name);
        inspect(child, label ? `${label}/${name}` : name, lstatSync(child));
      }
      return;
    }
    if (!stat.isFile() || stat.size > maxBytes) {
      throw new Error("Unsupported artifact input");
    }
    if (/\.zip$/i.test(label)) {
      if (containsCanary(label)) findings.push(label);
      const entries = decoder
        .decode(tool("unzip", ["-Z1", file]))
        .trimEnd()
        .split("\n");
      if (entries.length > 1_000 || new Set(entries).size !== entries.length) {
        throw new Error("Unsupported artifact archive");
      }
      for (const entry of entries) {
        if (
          !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\/?$/.test(entry) ||
          entry
            .split("/")
            .some((segment) => segment === "." || segment === "..")
        ) {
          throw new Error("Unsupported artifact archive entry");
        }
        if (entry.endsWith("/")) continue;
        if (
          containsCanary(entry) ||
          contentHasCanary(entry, tool("unzip", ["-p", file, entry]))
        ) {
          findings.push(`${label}!${entry}`);
        }
      }
    } else if (
      containsCanary(label) ||
      contentHasCanary(label, readFileSync(file))
    ) {
      findings.push(label);
    }
  }

  inspect(root, stats.isDirectory() ? "" : path.basename(root), stats);
  return findings.sort();
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    if (process.argv.length < 3)
      throw new Error("An artifact path is required");
    const findings = process.argv
      .slice(2)
      .flatMap((input) => scanArtifacts(input));
    if (findings.length) {
      console.error(
        `Synthetic canary detected in ${findings.length} artifact(s)`,
      );
      process.exitCode = 1;
    }
  } catch {
    console.error("Pro artifact scan could not verify the supplied inputs");
    process.exitCode = 2;
  }
}
