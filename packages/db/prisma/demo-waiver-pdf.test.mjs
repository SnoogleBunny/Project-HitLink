import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";

async function loadSeededDemoWaiverPdf() {
  const seedSource = await readFile(
    new URL("./seed-demo.mjs", import.meta.url),
    "utf8",
  );
  const fixtureExpression = seedSource.match(
    /const pdfBytes = (Buffer\.from\(`[^`]*`\));/,
  );

  assert.ok(
    fixtureExpression,
    "the demo waiver must remain an inline, deterministic Buffer fixture",
  );

  return runInNewContext(fixtureExpression[1], { Buffer });
}

function readClassicXref(pdfBytes) {
  const xrefOffset = pdfBytes.indexOf(Buffer.from("xref\n", "ascii"));
  assert.notEqual(xrefOffset, -1, "the PDF must contain a classic xref table");

  const lines = pdfBytes.subarray(xrefOffset).toString("latin1").split("\n");
  assert.equal(lines[0], "xref");

  const subsection = lines[1]?.match(/^(\d+) (\d+)$/);
  assert.ok(subsection, "the xref table must declare its object range");

  const firstObjectNumber = Number(subsection[1]);
  const entryCount = Number(subsection[2]);
  const entries = lines.slice(2, 2 + entryCount).map((line, index) => {
    const entry = line.match(/^(\d{10}) (\d{5}) ([fn]) ?$/);
    assert.ok(entry, `xref entry ${index} must use the classic fixed-width shape`);

    return {
      objectNumber: firstObjectNumber + index,
      offset: Number(entry[1]),
      generation: Number(entry[2]),
      status: entry[3],
    };
  });

  assert.equal(entries.length, entryCount);

  return { entryCount, entries, firstObjectNumber, xrefOffset };
}

function readIndirectObjects(pdfBytes) {
  const pdfText = pdfBytes.toString("latin1");
  const objects = new Map();

  for (const match of pdfText.matchAll(/^(\d+) (\d+) obj\n([\s\S]*?)\nendobj$/gm)) {
    objects.set(Number(match[1]), {
      body: match[3],
      generation: Number(match[2]),
      offset: match.index,
    });
  }

  return objects;
}

test("every in-use demo waiver object has its exact xref offset", async () => {
  const pdfBytes = await loadSeededDemoWaiverPdf();
  const { entries } = readClassicXref(pdfBytes);
  const objects = readIndirectObjects(pdfBytes);
  const inUseEntries = entries.filter((entry) => entry.status === "n");

  assert.deepEqual(
    inUseEntries.map((entry) => entry.objectNumber),
    [...objects.keys()],
    "the xref table must cover every indirect object exactly once",
  );

  for (const entry of inUseEntries) {
    const object = objects.get(entry.objectNumber);
    assert.ok(object);
    assert.equal(entry.generation, object.generation);
    assert.equal(
      entry.offset,
      object.offset,
      `xref offset for object ${entry.objectNumber} must point to its declaration`,
    );
  }
});

test("demo waiver startxref points to the xref table", async () => {
  const pdfBytes = await loadSeededDemoWaiverPdf();
  const pdfText = pdfBytes.toString("latin1");
  const { xrefOffset } = readClassicXref(pdfBytes);
  const startxref = pdfText.match(/startxref\n(\d+)\n%%EOF\n?$/);

  assert.ok(startxref, "the PDF must end with startxref and %%EOF");
  assert.equal(Number(startxref[1]), xrefOffset);
});

test("every demo waiver stream has its exact declared byte length", async () => {
  const pdfBytes = await loadSeededDemoWaiverPdf();
  const objects = readIndirectObjects(pdfBytes);

  for (const [objectNumber, object] of objects) {
    if (!object.body.includes("stream")) {
      continue;
    }

    const stream = object.body.match(
      /^<<([\s\S]*?)>>\nstream\n([\s\S]*?)endstream$/,
    );
    assert.ok(stream, `object ${objectNumber} must contain one bounded stream`);

    const declaredLength = stream[1].match(/\/Length\s+(\d+)\b/);
    assert.ok(
      declaredLength,
      `object ${objectNumber} stream must declare a direct byte length`,
    );
    assert.equal(
      Number(declaredLength[1]),
      Buffer.byteLength(stream[2], "latin1"),
      `object ${objectNumber} stream length must match its payload bytes`,
    );
  }
});

test("demo waiver trailer size and root match the xref and catalog", async () => {
  const pdfBytes = await loadSeededDemoWaiverPdf();
  const pdfText = pdfBytes.toString("latin1");
  const objects = readIndirectObjects(pdfBytes);
  const { entryCount, entries, firstObjectNumber } = readClassicXref(pdfBytes);
  const trailer = pdfText.match(
    /trailer\n<<([\s\S]*?)>>\nstartxref\n\d+\n%%EOF\n?$/,
  );

  assert.ok(trailer, "the PDF must contain a trailer dictionary");

  const size = trailer[1].match(/\/Size\s+(\d+)\b/);
  const root = trailer[1].match(/\/Root\s+(\d+)\s+(\d+)\s+R\b/);
  assert.ok(size, "the trailer must declare /Size");
  assert.ok(root, "the trailer must declare /Root");

  const highestObjectNumber = Math.max(...objects.keys());
  assert.equal(Number(size[1]), highestObjectNumber + 1);
  assert.equal(firstObjectNumber, 0);
  assert.equal(entryCount, Number(size[1]));

  const rootObjectNumber = Number(root[1]);
  const rootGeneration = Number(root[2]);
  const rootObject = objects.get(rootObjectNumber);
  assert.ok(rootObject, "the trailer root must reference an existing object");
  assert.equal(rootObject.generation, rootGeneration);
  assert.match(rootObject.body, /\/Type\s+\/Catalog\b/);
  assert.equal(
    entries.find((entry) => entry.objectNumber === rootObjectNumber)?.status,
    "n",
    "the trailer root must be an in-use xref entry",
  );
});

test("demo waiver content uses only declared PDF resources", async () => {
  const pdfBytes = await loadSeededDemoWaiverPdf();
  const pdfText = pdfBytes.toString("latin1");
  const objects = readIndirectObjects(pdfBytes);
  const resourceOperators = [
    { category: "Font", expression: /\/(\S+)\s+[-+]?(?:\d*\.?\d+)\s+Tf\b/g },
    { category: "XObject", expression: /\/(\S+)\s+Do\b/g },
    { category: "ExtGState", expression: /\/(\S+)\s+gs\b/g },
    { category: "ColorSpace", expression: /\/(\S+)\s+(?:CS|cs)\b/g },
    { category: "Pattern", expression: /\/(\S+)\s+(?:SCN|scn)\b/g },
    { category: "Shading", expression: /\/(\S+)\s+sh\b/g },
  ];

  for (const { category, expression } of resourceOperators) {
    const declaredNames = new Set();
    const dictionaries = new RegExp(`/${category}\\s*<<([\\s\\S]*?)>>`, "g");

    for (const dictionary of pdfText.matchAll(dictionaries)) {
      for (const resource of dictionary[1].matchAll(
        /\/(\S+)\s+\d+\s+\d+\s+R\b/g,
      )) {
        declaredNames.add(resource[1]);
      }
    }

    for (const [objectNumber, object] of objects) {
      const stream = object.body.match(/\nstream\n([\s\S]*?)\nendstream$/);
      if (!stream) {
        continue;
      }

      for (const usage of stream[1].matchAll(expression)) {
        assert.ok(
          declaredNames.has(usage[1]),
          `content stream ${objectNumber} uses undeclared /${usage[1]} ${category}`,
        );
      }
    }
  }
});
