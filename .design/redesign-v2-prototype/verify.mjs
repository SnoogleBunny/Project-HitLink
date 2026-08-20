import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const WORKTREE = process.cwd();
const MAIN_REPO = "C:/Users/Jacky/Documents/Project-HitLink";
const ARTIFACT_ROOT = path.join(WORKTREE, ".design", "redesign-v2-prototype");
const ARTIFACT_ROUTE = "/index.html";
const portIndex = process.argv.indexOf("--port");
const outputIndex = process.argv.indexOf("--output");
const focusIndex = process.argv.indexOf("--focus");
const PORT = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 41791;
const outputValue = outputIndex >= 0 ? process.argv[outputIndex + 1] : "test-results/redesign-v2-prototype";
const FOCUS = focusIndex >= 0 ? process.argv[focusIndex + 1] : "";
const OUTPUT_ROOT = path.isAbsolute(outputValue) ? outputValue : path.resolve(WORKTREE, outputValue);
const SCREENSHOT_ROOT = path.join(OUTPUT_ROOT, "screenshots");

if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error(`Invalid --port value: ${PORT}`);
if (!outputValue || path.relative(WORKTREE, OUTPUT_ROOT).startsWith("..")) throw new Error(`Invalid --output value outside worktree: ${outputValue}`);
if (FOCUS && !["microrepair", "final-repair"].includes(FOCUS)) throw new Error(`Invalid --focus value: ${FOCUS}`);

const requireFromMain = createRequire(path.join(MAIN_REPO, "package.json"));
const { chromium } = requireFromMain("@playwright/test");
const MIME = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };
const surfaces = ["foundation", "dashboard", "operations", "member", "forms", "migration", "billing", "landing"];
const worlds = ["a", "b"];
const ownerRoutes = [
  { id: "dashboard", label: "Dashboard", surface: "dashboard", h1: "Today at North Harbour" },
  { id: "schedule", label: "Schedule", surface: "operations", h1: "Schedule, roster & attendance" },
  { id: "bookings", label: "Bookings", surface: "operations", h1: "Class bookings" },
  { id: "roster", label: "Roster & attendance", surface: "operations", h1: "Schedule, roster & attendance" },
  { id: "members", label: "Members", surface: "forms", h1: "Members" },
  { id: "staff-invites", label: "Staff invites", surface: "forms", h1: "Staff invites" },
  { id: "billing", label: "Billing", surface: "billing", h1: "Revenue exceptions" },
  { id: "membership-plans", label: "Membership plans", surface: "billing", h1: "Revenue exceptions" },
  { id: "access-products", label: "Access products", surface: "billing", h1: "Revenue exceptions" },
  { id: "billing-settings", label: "Billing settings", surface: "billing", h1: "Revenue exceptions" },
  { id: "programs", label: "Programs", surface: "forms", h1: "Programs" },
  { id: "rooms", label: "Rooms", surface: "forms", h1: "Rooms" },
  { id: "forms", label: "Forms", surface: "forms", h1: "Forms" },
  { id: "migration", label: "Migration", surface: "migration", h1: "Migration readiness" },
];
const viewports = [
  { label: "desktop", width: 1440, height: 1000 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile", width: 390, height: 844 },
];
const sensitivePattern = /Avery|Jordan Lee|Sam Rivera|Priya|Micah|Marcel|Hana|\$145|\$92|acct_|import_|tmpl_/i;
const loadedSelectors = ".action-queue, .today-list, .class-list, .attendance-list, .member-class-list, .form-table, .form-record-cards, .migration-timeline, .migration-results, .billing-queue, .landing-proof";
const results = [];
const screenshots = [];
const diagnostics = { console: [], pageErrors: [], requestFailures: [], externalRequests: [] };
let server;
let browser;

function record(name, pass, detail) { results.push({ name, pass: Boolean(pass), detail: String(detail) }); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function urlFor({ world = "a", surface = "foundation", state = "default", extra = "" } = {}) {
  const params = new URLSearchParams({ world, surface });
  if (state !== "default") params.set("state", state);
  if (extra) for (const [key, value] of new URLSearchParams(extra)) params.set(key, value);
  return `http://127.0.0.1:${PORT}${ARTIFACT_ROUTE}?${params}`;
}
function relativeArtifactPath(requestPath) {
  const clean = decodeURIComponent(requestPath).replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(ARTIFACT_ROOT, clean);
  const relative = path.relative(ARTIFACT_ROOT, filePath);
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : filePath;
}
async function inspectPort() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(PORT, "127.0.0.1", () => probe.close(resolve));
  });
  record("owned port preflight", true, `127.0.0.1:${PORT} was free`);
}
function startServer() {
  return new Promise((resolve, reject) => {
    server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
      const filePath = relativeArtifactPath(requestUrl.pathname);
      if (!filePath) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }
      fs.readFile(filePath, (error, data) => {
        if (error) {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }
        response.writeHead(200, { "cache-control": "no-store", "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream", "x-content-type-options": "nosniff" });
        response.end(data);
      });
    });
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
}
async function stopServer() { if (server) await new Promise((resolve) => server.close(resolve)); }
async function makeContext(viewport, options = {}) {
  const context = await browser.newContext({ viewport, javaScriptEnabled: options.javaScriptEnabled ?? true, reducedMotion: options.reducedMotion ?? "no-preference", colorScheme: "light" });
  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (!["127.0.0.1", "localhost"].includes(requestUrl.hostname)) {
      diagnostics.externalRequests.push(route.request().url());
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  return context;
}
function attachDiagnostics(page, scope) {
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) diagnostics.console.push({ scope, type: message.type(), text: message.text() }); });
  page.on("pageerror", (error) => diagnostics.pageErrors.push({ scope, text: error.message }));
  page.on("requestfailed", (request) => diagnostics.requestFailures.push({ scope, url: request.url(), error: request.failure()?.errorText ?? "unknown" }));
}
async function capture(page, filename, metadata) {
  const outputPath = path.join(SCREENSHOT_ROOT, filename);
  await page.screenshot({ path: outputPath, fullPage: true, animations: "disabled" });
  const bytes = fs.readFileSync(outputPath);
  screenshots.push({ path: path.relative(WORKTREE, outputPath).replaceAll("\\", "/"), filename, sha256: sha256(bytes), bytes: bytes.length, dimensions: pngDimensions(bytes), ...metadata });
}
async function widths(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const overflow = [...document.querySelectorAll("body *")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, className: String(element.className).slice(0, 100), left: Math.round(rect.left), right: Math.round(rect.right), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    }).filter((item) => item.right > root.clientWidth + 1 || item.left < -1).slice(0, 12);
    return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, overflow };
  });
}
async function assertBasePage(page, expected) {
  const response = await page.goto(urlFor(expected), { waitUntil: "networkidle" });
  record(`${expected.world}/${expected.surface} HTTP 200`, response?.status() === 200, `status=${response?.status()}`);
  record(`${expected.world}/${expected.surface} title`, (await page.title()).includes("Flowstate Redesign V2"), await page.title());
  const h1Count = await page.locator("main#prototype-main h1").count();
  record(`${expected.world}/${expected.surface} exactly one H1`, h1Count === 1, `h1Count=${h1Count}`);
  const attrs = await page.locator("body").evaluate((body) => ({ world: body.dataset.world, surface: body.dataset.surface }));
  record(`${expected.world}/${expected.surface} world and surface`, attrs.world === expected.world && attrs.surface === expected.surface, JSON.stringify(attrs));
  const pageWidths = await widths(page);
  record(`${expected.world}/${expected.surface} no horizontal overflow`, pageWidths.scrollWidth <= pageWidths.clientWidth + 1, JSON.stringify(pageWidths));
  const disclosure = await page.locator(".truth-banner").innerText();
  record(`${expected.world}/${expected.surface} prototype boundary`, /Design prototype/i.test(disclosure) && /no backend/i.test(disclosure) && /live provider/i.test(disclosure), disclosure.slice(0, 180));
  const ownerRail = page.locator(".owner-rail");
  if (await ownerRail.count()) {
    const currentCount = await ownerRail.locator('[aria-current="page"]').count();
    record(`${expected.world}/${expected.surface} exactly one current nav`, currentCount === 1, `current=${currentCount}`);
  }
  const disabledAudit = await page.locator("button:disabled:visible").evaluateAll((buttons) => buttons.map((button) => {
    const ids = (button.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    return { name: button.getAttribute("aria-label") || button.textContent?.trim(), ids, valid: ids.length > 0 && ids.every((id) => document.getElementById(id)?.getClientRects().length) };
  }));
  record(`${expected.world}/${expected.surface} disabled controls have visible reasons`, disabledAudit.every((item) => item.valid), JSON.stringify(disabledAudit.filter((item) => !item.valid)));
}

function verifyStaticFiles() {
  const html = fs.readFileSync(path.join(ARTIFACT_ROOT, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(ARTIFACT_ROOT, "app.js"), "utf8");
  const css = fs.readFileSync(path.join(ARTIFACT_ROOT, "styles.css"), "utf8");
  const source = `${html}\n${appSource}`;
  const schemes = [...source.matchAll(/(?:href|src)\s*=\s*["']([^"']+)/gi)].map((match) => match[1]).filter((value) => /^(?:https?:|mailto:|tel:|ftp:|data:|javascript:)/i.test(value));
  record("static files reject every unapproved external scheme", schemes.length === 0, JSON.stringify(schemes));
  record("artifact server root is scoped", ARTIFACT_ROOT.endsWith(path.join(".design", "redesign-v2-prototype")), ARTIFACT_ROOT);
  record("output root is explicit and configurable", outputIndex >= 0 || outputValue === "test-results/redesign-v2-prototype", OUTPUT_ROOT);
  record("fourteen unique owner route ids", (appSource.match(/\{ id: "[^"]+", label:/g) ?? []).length === 14, String((appSource.match(/\{ id: "[^"]+", label:/g) ?? []).length));
  const unavailableCopy = "This action is not available yet. Flowstate must finish reviewing it with the gym owner before it can be used.";
  const migrationSafeguardHeading = "<h2>For future imports</h2>";
  const migrationSafeguardCopy = "This fictional completed snapshot contains no unrecognized statuses. For future imports, Flowstate must stop and request review whenever it encounters a status it does not recognize.";
  record("internal copy removed", !/authoritative response|committed projection|Domain unavailable|This actor|Provider outage|Confirmation boundary|Customer\/member|Flowstate Backend|Not part of this completed fixture|fail-closed handling of unknown statuses remains a production prerequisite/.test(source) && source.split(unavailableCopy).length - 1 === 2 && source.split(migrationSafeguardHeading).length - 1 === 2 && source.split(migrationSafeguardCopy).length - 1 === 2, "exact owner-facing copy appears twice per shared A/B or state rendering source");
  record("all eight skeleton signatures defined", surfaces.every((surface) => css.includes(`.skeleton-${surface}`)), surfaces.filter((surface) => !css.includes(`.skeleton-${surface}`)).join(", "));
  record("no Bklit Motion or dependency install", !/bklit|motion\/react|npm install|pnpm add/i.test(source + css), "dependency scan");
  record("readiness and form state contracts present", /MigrationStage/.test(appSource) && /Owner-review tuple/.test(appSource) && /Operational-readiness tuple/.test(appSource) && /MISSING/.test(appSource) && /PENDING/.test(appSource) && /SIGNED/.test(appSource) && /SUPERSEDED/.test(appSource) && /OPEN/.test(appSource) && /COMPLETED/.test(appSource) && /EXPIRED/.test(appSource) && /CANCELLED/.test(appSource), "contract scan");
}

async function captureMatrix() {
  for (const viewport of viewports) {
    const context = await makeContext({ width: viewport.width, height: viewport.height });
    const page = await context.newPage();
    attachDiagnostics(page, `matrix-${viewport.label}`);
    for (const world of worlds) for (const surface of surfaces) {
      await assertBasePage(page, { world, surface });
      await capture(page, `${world}-${surface}-${viewport.width}x${viewport.height}.png`, { world, surface, state: "default", viewport });
    }
    await context.close();
  }
}

async function verifyLoading() {
  const signatures = new Set();
  const context = await makeContext({ width: 1440, height: 1000 }, { reducedMotion: "reduce" });
  const page = await context.newPage();
  attachDiagnostics(page, "loading");
  for (const world of worlds) for (const surface of surfaces) {
    await page.goto(urlFor({ world, surface, state: "loading" }), { waitUntil: "networkidle" });
    const region = page.locator(`[data-skeleton="${surface}"]`);
    const audit = await region.evaluate((node) => ({
      busy: node.getAttribute("aria-busy"),
      signature: `${node.dataset.skeleton}:${node.querySelectorAll(".bone").length}`,
      bonesHidden: node.querySelector(".surface-skeleton")?.getAttribute("aria-hidden"),
      animations: [...node.querySelectorAll(".bone")].map((bone) => getComputedStyle(bone).animationName),
      buttons: node.querySelectorAll("button, a[href], input, select").length,
    }));
    signatures.add(audit.signature);
    const visibleText = await page.locator("#prototype-main").innerText();
    const loadedCount = await page.locator(loadedSelectors).count();
    const statuses = await page.locator('[role="status"]:visible').count();
    const forbiddenLoadedHeaderTruth = /\b(?:READY|COMPLETE)\b/.test(visibleText) || /Stripe setup missing|Stripe status unavailable|\d+\s+(?:items|records|results)|Reset class states/i.test(visibleText);
    const affectedHeaderControls = await page.locator(".surface-title button:visible, .surface-title a[href]:visible").count();
    const order = await page.evaluate(() => {
      const h1 = document.querySelector("#prototype-main h1");
      const h2 = document.querySelector("#state-lens-title");
      return Boolean(h1 && h2 && (h1.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    record(`${world}/${surface} loading region contract`, audit.busy === "true" && audit.bonesHidden === "true" && audit.buttons === 0 && audit.animations.every((name) => name === "none"), JSON.stringify(audit));
    record(`${world}/${surface} visible page loading privacy`, !sensitivePattern.test(visibleText) && loadedCount === 0, JSON.stringify({ sensitive: sensitivePattern.test(visibleText), loadedCount }));
    record(`${world}/${surface} loading suppresses loaded header truth and affected actions`, !forbiddenLoadedHeaderTruth && affectedHeaderControls === 0, JSON.stringify({ forbiddenLoadedHeaderTruth, affectedHeaderControls }));
    record(`${world}/${surface} one polite visible loading status`, statuses === 1, `visible statuses=${statuses}`);
    record(`${world}/${surface} H1 precedes state H2`, order, `order=${order}`);
    await capture(page, `loading-${world}-${surface}-1440x1000.png`, { world, surface, state: "loading", viewport: { label: "desktop", width: 1440, height: 1000 } });
  }
  record("surface-specific loading signatures", signatures.size === surfaces.length, JSON.stringify([...signatures]));
  await context.close();
}

async function verifyReadinessAndStates(page) {
  await page.goto(urlFor({ world: "a", surface: "dashboard" }), { waitUntil: "networkidle" });
  const dashboardText = await visiblePrimaryText(page, ".readiness-tuple");
  const dashboardTechnical = await page.locator(".readiness-tuple details").textContent();
  record("dashboard readiness coherence uses plain primary copy and collapsed raw reference", /Gym status:\s*Ready for daily operations/i.test(dashboardText) && /Migration\s*Complete/i.test(dashboardText) && /Owner review\s*Recorded/i.test(dashboardText) && /Flowstate readiness review\s*Recorded/i.test(dashboardText) && !/Workspace|MigrationStage|tuple|derived|persisted|audit/i.test(dashboardText) && /Workspace ACTIVE/.test(dashboardTechnical) && /MigrationStage COMPLETE/.test(dashboardTechnical), dashboardText.slice(0, 700));
  await page.goto(urlFor({ world: "a", surface: "migration" }), { waitUntil: "networkidle" });
  const migrationText = await visiblePrimaryText(page);
  const migrationTechnical = await page.locator(".migration-technical").textContent();
  record("migration default matches dashboard readiness in plain English", /Gym status:\s*Ready for daily operations/i.test(migrationText) && /Migration:\s*Complete/i.test(migrationText) && /Owner review:\s*Recorded/i.test(migrationText) && /Flowstate readiness review:\s*Recorded/i.test(migrationText) && !/Workspace|MigrationStage|tuple|derived|persisted|audit|nonconcurrent/i.test(migrationText) && /MigrationStage COMPLETE/.test(migrationTechnical), migrationText.slice(0, 750));
  record("completed migration future-import safeguard is visibly nonblocking", /Future import safeguard/i.test(migrationText) && /For future imports/.test(migrationText) && /This fictional completed snapshot contains no unrecognized statuses\. For future imports, Flowstate must stop and request review whenever it encounters a status it does not recognize\./.test(migrationText) && !/completed fixture|fail-closed|production prerequisite|BLOCKING BACKEND REPAIR|unresolved blocking backend repair/i.test(migrationText), "owner-facing nonblocking safeguard shown");
  await page.goto(urlFor({ world: "b", surface: "migration", state: "confirmation" }), { waitUntil: "networkidle" });
  const confirmationText = await visiblePrimaryText(page);
  const confirmationTechnical = await page.locator(".prelaunch-scenario details").textContent();
  record("migration confirmation is separate blocked pre-launch scenario", /Pre-launch setup · daily operations blocked/i.test(confirmationText) && /Migration scheduled for launch/i.test(confirmationText) && /Owner review not recorded/i.test(confirmationText) && !/Workspace|MigrationStage|tuple|derived|persisted|audit|nonconcurrent/i.test(confirmationText) && /GO_LIVE_SCHEDULED/.test(confirmationTechnical) && /nonconcurrent/.test(confirmationTechnical), confirmationText.slice(0, 900));
  await capture(page, "special-migration-confirmation.png", { world: "b", surface: "migration", state: "confirmation", viewport: { label: "desktop", width: 1440, height: 1000 } });
  for (const state of ["empty", "working", "success", "unavailable", "stale", "permission", "planned", "readonly", "waiting"]) {
    await page.goto(urlFor({ world: "a", surface: "dashboard", state }), { waitUntil: "networkidle" });
    const defaultRegions = await page.locator(".dashboard-grid, .readiness-tuple").count();
    record(`dashboard ${state} replaces loaded region`, defaultRegions === 0, `loaded regions=${defaultRegions}`);
  }
  await page.goto(urlFor({ world: "a", surface: "billing", state: "provider-missing" }), { waitUntil: "networkidle" });
  record("provider setup missing distinct", await page.getByRole("heading", { name: "Stripe setup missing" }).count() > 0 && await page.getByText(/owner completes setup next/i).count() > 0, "setup state");
  await page.goto(urlFor({ world: "a", surface: "billing", state: "outage" }), { waitUntil: "networkidle" });
  const outageText = await page.locator("#prototype-main").innerText();
  record("Stripe status unavailable does not claim outage", /Stripe status unavailable/i.test(outageText) && !/provider outage/i.test(outageText), outageText.slice(0, 400));
}

async function verifyFormsLegacy(page) {
  await page.goto(urlFor({ world: "a", surface: "forms" }), { waitUntil: "networkidle" });
  const formsText = await page.locator("#prototype-main").innerText();
  record("form states distinguish version compliance and request", ["FormVersion", "PENDING", "SIGNED", "SUPERSEDED", "OPEN", "COMPLETED", "EXPIRED", "CANCELLED", "MISSING"].every((term) => formsText.includes(term)), formsText.slice(0, 1000));
  const libraryWidth = await page.locator(".form-library").evaluate((node) => {
    const parentStyle = getComputedStyle(node.parentElement);
    const available = node.parentElement.getBoundingClientRect().width - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
    return { width: node.getBoundingClientRect().width, available };
  });
  record("form library spans desktop width", libraryWidth.width >= libraryWidth.available - 2, JSON.stringify(libraryWidth));
  await page.locator("#new-form-action").click();
  const reviewText = await page.locator(".form-version-review").innerText();
  record("new form version pre-action review", /Affected member count/i.test(reviewText) && /v2 → v3/.test(reviewText) && /Re-sign requirement/i.test(reviewText) && /Obsolete OPEN links/i.test(reviewText) && /Old signed history/i.test(reviewText) && /No email is sent/i.test(reviewText) && /Prototype-only/i.test(reviewText), reviewText);
  await page.keyboard.press("Escape");
  record("form review Escape returns actual opener", (await page.evaluate(() => document.activeElement?.id)) === "new-form-action", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)));
  await page.locator("#new-form-action").click();
  await page.locator('[data-action="form-version-confirm"]').click();
  record("new form version local resettable result", await page.getByText(/Nothing was saved; no email was sent/i).count() > 0 && await page.locator('[data-action="form-version-reset"]').count() === 1, "local result");
  await page.locator('[data-action="form-version-reset"]').click();
  await page.locator('[data-prototype-form] button[type="submit"]').click();
  record("form validation summary receives focus", (await page.evaluate(() => document.activeElement?.id)) === "form-errors", await page.evaluate(() => document.activeElement?.id));
  record("form validation associates invalid fields", await page.locator('#room-name[aria-invalid="true"]').count() === 1 && await page.locator('#room-capacity[aria-invalid="true"]').count() === 1, "both invalid");
  await page.locator('[data-action="form-reset"]').click();
  record("form reset clears aria-invalid", await page.locator('[data-prototype-form] [aria-invalid="true"]').count() === 0, `invalid=${await page.locator('[data-prototype-form] [aria-invalid="true"]').count()}`);
  await page.fill("#room-name", "Auxiliary mat");
  await page.fill("#room-capacity", "16");
  await page.locator('[data-prototype-form] button[type="submit"]').click();
  record("form success clears aria-invalid", await page.locator('[data-prototype-form] [aria-invalid="true"]').count() === 0 && await page.getByText(/Nothing was saved/i).count() > 0, "valid local result");
  await capture(page, "special-form-success.png", { world: "a", surface: "forms", state: "success", viewport: { label: "desktop", width: 1440, height: 1000 } });

  const mobileContext = await makeContext({ width: 390, height: 844 });
  const mobile = await mobileContext.newPage();
  attachDiagnostics(mobile, "forms-mobile");
  await mobile.goto(urlFor({ world: "b", surface: "forms" }), { waitUntil: "networkidle" });
  const tableVisible = await mobile.locator(".form-table").isVisible();
  const cards = await mobile.locator(".form-record-cards article:visible").count();
  const cardsText = await mobile.locator(".form-record-cards").innerText();
  const mobileWidths = await widths(mobile);
  record("mobile forms use cards with all fields and no horizontal form table", !tableVisible && cards === 3 && /Current/i.test(cardsText) && /Assigned/i.test(cardsText) && /Evidence/i.test(cardsText) && mobileWidths.scrollWidth <= mobileWidths.clientWidth + 1, JSON.stringify({ tableVisible, cards, mobileWidths }));
  await capture(mobile, "special-forms-mobile-cards-390x844.png", { world: "b", surface: "forms", state: "default", viewport: { label: "mobile", width: 390, height: 844 } });
  await mobileContext.close();
}

async function verifyForms(page) {
  await page.goto(urlFor({ world: "a", surface: "forms", extra: "route=forms" }), { waitUntil: "networkidle" });
  const formsPrimary = await visiblePrimaryText(page, ".forms-surface");
  const formRows = await page.locator(".form-table [data-form-record]").evaluateAll((rows) => rows.map((row) => ({ version: row.dataset.currentVersion, compliance: row.dataset.compliance, request: row.dataset.requestStatus })));
  const technical = await page.locator(".form-library details").textContent();
  record("forms primary cards are plain English with semantic dimensions", /Version 3 · current/.test(formsPrimary) && /Signed · 18 current signatures/.test(formsPrimary) && /Signature needed · Sam Rivera’s signing request is open/.test(formsPrimary) && /New signing request needed · previous links expired or were cancelled/.test(formsPrimary) && !/FormVersion|SignatureRequest|\b(?:SIGNED|PENDING|MISSING|SUPERSEDED|OPEN|COMPLETED|EXPIRED|CANCELLED)\b/.test(formsPrimary) && formRows.length === 3 && formRows.every((row) => row.version && row.compliance && row.request) && /FormVersion/.test(technical) && /SignatureRequest/.test(technical), JSON.stringify({ formRows, formsPrimary: formsPrimary.slice(0, 900) }));
  record("default Forms route excludes Rooms and Programs tasks", !/Add a room|Gym setup/.test(formsPrimary) && await page.locator('[data-prototype-form], .settings-list').count() === 0, formsPrimary.slice(0, 600));
  await capture(page, "special-forms-route-1440x1000.png", { world: "a", surface: "forms", route: "forms", state: "default", viewport: { label: "desktop", width: 1440, height: 1000 } });

  await page.locator("#new-form-action").click();
  const reviewPrimary = await visiblePrimaryText(page, ".form-version-review");
  record("new version review states exact no-request postcondition", /Version 2 → Version 3/.test(reviewPrimary) && /Prior signatures become previous-version evidence/i.test(reviewPrimary) && /requirements remain superseded or missing/i.test(reviewPrimary) && /3 open links are cancelled/i.test(reviewPrimary) && /None are created/i.test(reviewPrimary) && /No email is sent/i.test(reviewPrimary) && !/\b(?:OPEN|PENDING|SUPERSEDED|MISSING)\b/.test(reviewPrimary), reviewPrimary);
  await page.keyboard.press("Escape");
  record("form review Escape returns actual opener", (await page.evaluate(() => document.activeElement?.id)) === "new-form-action", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)));
  await page.locator("#new-form-action").click();
  await page.locator('[data-action="form-version-confirm"]').click();
  const result = await page.locator(".form-version-result").evaluate((node) => ({ version: node.dataset.currentVersion, cancelled: node.dataset.cancelledOpenRequests, created: node.dataset.currentRequestsCreated, outcomes: node.dataset.complianceOutcomes, text: node.innerText }));
  record("new version result preserves implemented semantics", result.version === "3" && result.cancelled === "3" && result.created === "0" && result.outcomes === "SUPERSEDED MISSING" && /No current signing requests were created/i.test(result.text) && /Prior signatures become previous-version evidence/i.test(result.text) && /no email was sent/i.test(result.text), JSON.stringify(result));

  await page.goto(urlFor({ world: "a", surface: "forms", extra: "route=rooms" }), { waitUntil: "networkidle" });
  record("Rooms route contains only Add a room task", await page.getByRole("heading", { name: "Add a room" }).count() === 1 && await page.locator(".form-library, .settings-list").count() === 0, "rooms task isolated");
  await page.locator('[data-prototype-form] button[type="submit"]').click();
  const validationAudit = await page.locator("#form-errors").evaluate((summary) => ({ active: document.activeElement === summary, outlineWidth: getComputedStyle(summary).outlineWidth, outlineStyle: getComputedStyle(summary).outlineStyle, links: [...summary.querySelectorAll("a")].map((link) => link.getAttribute("href")) }));
  record("room validation focuses linked summary with visible ring", validationAudit.active && parseFloat(validationAudit.outlineWidth) >= 3 && validationAudit.outlineStyle !== "none" && validationAudit.links.includes("#room-name") && validationAudit.links.includes("#room-capacity") && await page.locator('#room-name[aria-invalid="true"][aria-describedby*="room-name-error"]').count() === 1 && await page.locator('#room-capacity[aria-invalid="true"][aria-describedby*="room-capacity-error"]').count() === 1, JSON.stringify(validationAudit));
  await capture(page, "special-room-validation-1440x1000.png", { world: "a", surface: "forms", route: "rooms", state: "validation", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.locator('[data-action="form-reset"]').click();
  record("room form reset clears aria-invalid", await page.locator('[data-prototype-form] [aria-invalid="true"]').count() === 0, "validation reset");
  await page.fill("#room-name", "Auxiliary mat");
  await page.fill("#room-capacity", "16");
  await page.locator('[data-prototype-form] button[type="submit"]').click();
  record("room form success clears aria-invalid", await page.locator('[data-prototype-form] [aria-invalid="true"]').count() === 0 && await page.getByText(/Nothing was saved/i).count() > 0, "valid local result");
  await capture(page, "special-form-success.png", { world: "a", surface: "forms", route: "rooms", state: "success", viewport: { label: "desktop", width: 1440, height: 1000 } });

  await page.goto(urlFor({ world: "a", surface: "forms", extra: "route=programs" }), { waitUntil: "networkidle" });
  record("Programs route contains only Gym setup task", await page.getByRole("heading", { name: "Gym setup" }).count() === 1 && await page.locator(".form-library, .prototype-form").count() === 0, "programs task isolated");
  await capture(page, "special-programs-route-1440x1000.png", { world: "a", surface: "forms", route: "programs", state: "default", viewport: { label: "desktop", width: 1440, height: 1000 } });

  const mobileContext = await makeContext({ width: 390, height: 844 });
  const mobile = await mobileContext.newPage();
  attachDiagnostics(mobile, "forms-routes-mobile");
  await mobile.goto(urlFor({ world: "b", surface: "forms", extra: "route=forms" }), { waitUntil: "networkidle" });
  const tableVisible = await mobile.locator(".form-table").isVisible();
  const cards = await mobile.locator(".form-record-cards article:visible").count();
  const mobileFormsText = await visiblePrimaryText(mobile, ".forms-surface");
  const mobileWidths = await widths(mobile);
  const mobileFormsHeight = await mobile.evaluate(() => document.documentElement.scrollHeight);
  record("mobile Forms is card-based isolated and materially compact", !tableVisible && cards === 3 && !/Add a room|Gym setup/.test(mobileFormsText) && mobileWidths.scrollWidth <= mobileWidths.clientWidth + 1 && mobileFormsHeight < 3200, JSON.stringify({ tableVisible, cards, mobileWidths, mobileFormsHeight }));
  await capture(mobile, "special-forms-mobile-cards-390x844.png", { world: "b", surface: "forms", route: "forms", state: "default", viewport: { label: "mobile", width: 390, height: 844 } });
  await mobile.goto(urlFor({ world: "b", surface: "forms", extra: "route=rooms" }), { waitUntil: "networkidle" });
  await mobile.locator('[data-prototype-form] button[type="submit"]').click();
  const mobileValidation = await mobile.locator("#form-errors").evaluate((summary) => ({ active: document.activeElement === summary, outlineWidth: getComputedStyle(summary).outlineWidth, links: [...summary.querySelectorAll("a")].map((link) => link.getAttribute("href")) }));
  record("mobile Rooms validation focuses linked summary with visible ring", mobileValidation.active && parseFloat(mobileValidation.outlineWidth) >= 3 && mobileValidation.links.length === 2 && await mobile.locator('[aria-invalid="true"]').count() === 2, JSON.stringify(mobileValidation));
  await capture(mobile, "special-room-validation-390x844.png", { world: "b", surface: "forms", route: "rooms", state: "validation", viewport: { label: "mobile", width: 390, height: 844 } });
  await mobile.goto(urlFor({ world: "b", surface: "forms", extra: "route=programs" }), { waitUntil: "networkidle" });
  await capture(mobile, "special-programs-route-390x844.png", { world: "b", surface: "forms", route: "programs", state: "default", viewport: { label: "mobile", width: 390, height: 844 } });
  await mobileContext.close();
}

async function verifyFiltersContextAndFocus(page) {
  await page.goto(urlFor({ world: "a", surface: "operations" }), { waitUntil: "networkidle" });
  await page.locator('[data-action="program-filter"]').selectOption("Conditioning");
  record("actual filter behavior program", await page.locator(".class-list li").count() === 3 && new URL(page.url()).searchParams.get("program") === "Conditioning" && await page.getByText("Today Fundamentals", { exact: true }).count() === 0, `rows=${await page.locator(".class-list li").count()}; url=${page.url()}`);
  await page.locator('[data-action="date-filter"]').fill("2026-08-21");
  await page.locator('[data-action="date-filter"]').dispatchEvent("change");
  record("actual filter behavior date", await page.locator(".class-list li").count() === 1 && /Friday, August 21/.test(await page.locator("#schedule-heading").innerText()), `rows=${await page.locator(".class-list li").count()}`);
  await page.locator('[data-action="program-filter"]').selectOption("Muay Thai");
  record("actual filter behavior zero", await page.locator(".class-list li").count() === 0 && await page.getByText("No classes match", { exact: true }).count() === 1, "coherent zero");
  await page.locator('[data-action="clear-filters"]').click();
  record("Clear resets filters", await page.locator('[data-action="date-filter"]').inputValue() === "2026-08-20" && await page.locator('[data-action="program-filter"]').inputValue() === "All programs", "defaults restored");

  for (const route of ownerRoutes) {
    await page.goto(urlFor({ world: "a", surface: route.surface, extra: `route=${route.id}` }), { waitUntil: "networkidle" });
    const routeAudit = {
      route: await page.locator("body").getAttribute("data-route"),
      role: await page.locator("body").getAttribute("data-role"),
      ownerShell: await page.locator(".owner-shell").count(),
      memberShell: await page.locator(".member-header").count(),
      h1: await page.locator("#context-heading").innerText(),
      current: await page.locator('.owner-rail [aria-current="page"]').allTextContents(),
    };
    record(`owner route ${route.id} keeps route shell H1 and current destination`, routeAudit.route === route.id && routeAudit.role === "owner" && routeAudit.ownerShell === 1 && routeAudit.memberShell === 0 && routeAudit.h1.trim() === route.h1 && routeAudit.current.length === 1 && routeAudit.current[0].trim() === route.label, JSON.stringify(routeAudit));
    if (route.id === "bookings") await capture(page, "special-owner-bookings-1440x1000.png", { world: "a", surface: "member", route: "bookings", role: "owner", state: "default", viewport: { label: "desktop", width: 1440, height: 1000 } });
  }
  await page.goto(urlFor({ world: "a", surface: "member", extra: "role=member" }), { waitUntil: "networkidle" });
  record("member schedule uses member shell separately", await page.locator(".member-header").count() === 1 && await page.locator(".owner-shell, .coach-shell").count() === 0 && await page.locator("body").getAttribute("data-role") === "member" && await page.locator('.member-header [aria-current="page"]').innerText() === "Schedule", "member shell");
  await page.goto(urlFor({ world: "a", surface: "operations", extra: "role=coach" }), { waitUntil: "networkidle" });
  record("coach Today uses coach shell separately", await page.locator(".coach-shell").count() === 1 && await page.locator(".owner-shell, .member-header").count() === 0 && await page.locator("body").getAttribute("data-role") === "coach" && await page.locator('.coach-header [aria-current="page"]').innerText() === "Today", "coach shell");

  await page.goto(urlFor({ world: "a", surface: "dashboard" }), { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Open Today Fundamentals roster for Aug 20/ }).click();
  const rosterUrl = new URL(page.url());
  record("dashboard Open roster preserves exact URL context", rosterUrl.searchParams.get("route") === "roster" && rosterUrl.searchParams.get("view") === "roster" && rosterUrl.searchParams.get("class") === "fundamentals" && rosterUrl.searchParams.get("date") === "2026-08-20", rosterUrl.search);
  record("roster transition focuses named heading", (await page.evaluate(() => document.activeElement?.id)) === "roster-heading" && /Today Fundamentals/.test(await page.locator("#roster-heading").innerText()), await page.evaluate(() => document.activeElement?.id));
  await page.locator('[data-action="history-back"]').click();
  await page.waitForFunction(() => document.body.dataset.surface === "dashboard");
  record("history restores context and focus", (await page.evaluate(() => document.activeElement?.id)) === "context-heading" && /Today at North Harbour/.test(await page.locator("#context-heading").innerText()), await page.evaluate(() => document.activeElement?.id));

  await page.getByRole("link", { name: /Review Sam Rivera current guardian requirement/ }).click();
  record("Review forms retains named requirement", /member=sam-rivera/.test(page.url()) && /form=guardian-waiver/.test(page.url()) && await page.getByText(/Sam Rivera · Guardian waiver Version 2/).count() === 1, page.url());
  await page.goto(urlFor({ world: "a", surface: "dashboard" }), { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Review Avery Hernandez-Lawson billing/ }).click();
  record("billing recovery retains named Member context", /member=avery-hernandez-lawson/.test(page.url()) && await page.getByText(/Named Member billing context/i).count() === 1, page.url());

  await page.goto(urlFor({ world: "a", surface: "dashboard" }), { waitUntil: "networkidle" });
  await page.locator('[data-action="coach-today"]').click();
  record("coach Today shell has owner routes absent", await page.locator(".coach-shell").count() === 1 && await page.locator(".owner-rail").count() === 0 && await page.locator('.coach-header [aria-current="page"]').count() === 1, "coach shell");

  await page.goto(urlFor({ world: "a", surface: "operations" }), { waitUntil: "networkidle" });
  const rosterNames = await page.locator('[data-action="open-roster"]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  record("repeated Open roster controls have contextual accessible names", rosterNames.length > 1 && rosterNames.every(Boolean) && new Set(rosterNames).size === rosterNames.length, JSON.stringify(rosterNames));
  const exactOrigin = page.locator('#roster-origin-fundamentals');
  await exactOrigin.click();
  await page.goBack({ waitUntil: "networkidle" });
  const exactOriginAudit = { active: await page.evaluate(() => document.activeElement?.id), date: new URL(page.url()).searchParams.get("date"), program: new URL(page.url()).searchParams.get("program"), view: new URL(page.url()).searchParams.get("view") };
  record("Schedule browser Back restores exact originating class action and context", exactOriginAudit.active === "roster-origin-fundamentals" && exactOriginAudit.date === "2026-08-20" && exactOriginAudit.program === null && exactOriginAudit.view === null, JSON.stringify(exactOriginAudit));
  await capture(page, "special-back-origin-focus-1440x1000.png", { world: "a", surface: "operations", route: "schedule", state: "default", focus: "roster-origin-fundamentals", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.goto(urlFor({ world: "a", surface: "billing" }), { waitUntil: "networkidle" });
  const retryNames = await page.locator('button[aria-label^="Retry"]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  record("repeated Retry payment controls have contextual accessible names", retryNames.length === 2 && new Set(retryNames).size === 2, JSON.stringify(retryNames));
}

async function verifyMemberAndAttendanceLegacy(page) {
  await page.goto(urlFor({ world: "a", surface: "member" }), { waitUntil: "networkidle" });
  const memberText = await page.locator("#prototype-main").innerText();
  record("punch access consequence is exact", /booking consumes one punch/i.test(memberText) && /balance changes from 5 to 4/i.test(memberText) && /Timely cancel refunds it to 5/i.test(memberText) && /late cancel retains/i.test(memberText), memberText.slice(0, 1000));
  await page.locator('[data-action="member-payment"][data-key="open-mat"]').click();
  const pendingText = await page.locator('[data-member-class="open-mat"]').innerText();
  record("payment pending seat hold truth", /Seat temporarily held until Aug 20, 8:25 PM PDT/i.test(pendingText) && /provider completion is unknown/i.test(pendingText) && /not BOOKED/i.test(pendingText), pendingText);
  await page.goto(urlFor({ world: "a", surface: "operations", extra: "view=roster&class=fundamentals&route=roster" }), { waitUntil: "networkidle" });
  const rosterText = await page.locator("#prototype-main").innerText();
  record("attendance B6 atomic contract visible", /atomic AttendanceRecord \+ booking projection write/i.test(rosterText) && /stale-conflict rejection/i.test(rosterText), "B6 note");
  record("waitlist B3 access consequence visible", /monthly membership access/i.test(rosterText) && /consumes no punch/i.test(rosterText) && /Production B3 assigned-coach recheck/i.test(rosterText), "B3 note");
  await page.locator('[data-action="waitlist-promote"]').click();
  record("waitlist promotion receipt", await page.getByText(/Local promotion receipt/i).count() === 1 && await page.getByText(/nothing saved/i).count() > 0, "receipt shown");
  await page.locator('[data-action="attendance"][data-member="jordan"][data-value="PRESENT"]').click();
  await page.waitForFunction(() => document.querySelector("#live-announcer")?.textContent?.includes("Jordan Okafor"));
  const announcement = await page.locator("#live-announcer").innerText();
  record("attendance announcement uses full Member name not raw id", /Jordan Okafor/.test(announcement) && !/for jordan\./i.test(announcement), announcement);
  record("attendance rerender restores changed row focus", (await page.evaluate(() => document.activeElement?.getAttribute("data-attendance-row"))) === "jordan", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 140)));
}

async function verifyMemberAndAttendance(page) {
  await page.goto(urlFor({ world: "a", surface: "member", extra: "role=member" }), { waitUntil: "networkidle" });
  const initialPunch = await page.locator('[data-member-class="open-mat"]').innerText();
  record("punch starts with five remaining", /Punch card · 5 remaining/i.test(initialPunch) && await page.locator('[data-action="member-punch"]').count() === 1, initialPunch);
  await page.locator('[data-action="member-punch"][data-key="open-mat"]').click();
  const booked = await page.locator('[data-member-class="open-mat"]').innerText();
  record("punch booking becomes Booked with balance four and no provider state", /Booked/i.test(booked) && /Booking type · Punch card/i.test(booked) && /Balance · 4/i.test(booked) && /No payment or provider state exists/i.test(booked) && await page.locator('[data-member-class="open-mat"] [data-booking-type="PUNCH_CARD"][data-booking-status="BOOKED"]').count() === 1 && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "member-punch-timely", booked);
  await capture(page, "special-punch-booked-1440x1000.png", { world: "a", surface: "member", role: "member", state: "punch-booked", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.locator('[data-action="member-punch-timely"]').click();
  const timely = await page.locator('[data-member-class="open-mat"]').innerText();
  record("timely punch cancel returns availability and balance five", /Available/i.test(timely) && /Timely cancel/i.test(timely) && /Balance · 5/i.test(timely) && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "member-action-reset", timely);
  await capture(page, "special-punch-timely-cancel-1440x1000.png", { world: "a", surface: "member", role: "member", state: "punch-timely", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.locator('[data-action="member-action-reset"][data-key="open-mat"]').click();
  record("punch reset restores five", /Punch card · 5 remaining/i.test(await page.locator('[data-member-class="open-mat"]').innerText()), "balance five restored");
  await page.locator('[data-action="member-punch"][data-key="open-mat"]').click();
  await page.locator('[data-action="member-punch-late"]').click();
  const late = await page.locator('[data-member-class="open-mat"]').innerText();
  record("late punch cancel stays cancelled with balance four", /Cancelled/i.test(late) && /Late cancel/i.test(late) && /Balance · 4/i.test(late) && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "member-action-reset", late);
  await capture(page, "special-punch-late-cancel-1440x1000.png", { world: "a", surface: "member", role: "member", state: "punch-late", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.locator('[data-action="member-action-reset"][data-key="open-mat"]').click();

  await page.locator('[data-action="member-drop-in"][data-key="drop-in"]').click();
  const dropIn = await page.locator('[data-member-class="drop-in"]').innerText();
  record("priced drop-in enters separate pending payment hold", /Payment pending/i.test(dropIn) && /Booking type · Drop-in/i.test(dropIn) && /Seat temporarily held until Aug 20, 5:25 PM PDT/i.test(dropIn) && /Provider completion is unknown/i.test(dropIn) && /not Booked/i.test(dropIn) && await page.locator('[data-member-class="drop-in"] [data-booking-type="DROP_IN"][data-booking-status="PENDING_PAYMENT"]').count() === 1 && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "member-drop-in-expire", dropIn);
  await capture(page, "special-drop-in-payment-pending-1440x1000.png", { world: "a", surface: "member", role: "member", state: "dropin-pending", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.locator('[data-action="member-action-reset"][data-key="drop-in"]').click();
  record("drop-in Cancel hold clears local hold with focus return", await page.locator('[data-action="member-drop-in"][data-key="drop-in"]').count() === 1 && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "member-drop-in", "cancelled local hold");
  await page.locator('[data-action="member-drop-in"][data-key="drop-in"]').click();
  await page.locator('[data-action="member-drop-in-expire"]').click();
  record("drop-in expiry clears hold and returns availability", /Seat available/i.test(await page.locator('[data-member-class="drop-in"]').innerText()) && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "member-action-reset", "hold expired");
  await page.locator('[data-action="member-action-reset"][data-key="drop-in"]').click();
  record("drop-in cancel or reset clears local hold", await page.locator('[data-action="member-drop-in"][data-key="drop-in"]').count() === 1, "drop-in initial action restored");

  await page.goto(urlFor({ world: "a", surface: "operations", extra: "view=roster&class=fundamentals&route=roster" }), { waitUntil: "networkidle" });
  const rosterPrimary = await visiblePrimaryText(page, ".operations-surface");
  const rosterTechnical = await page.locator(".roster-warning details, .waitlist-disclosure > details").allTextContents();
  record("attendance save protection is plain English with raw B6 collapsed", /Each attendance change must be saved once and rejected if the record changed/i.test(rosterPrimary) && !/Production B6|atomic AttendanceRecord/i.test(rosterPrimary) && rosterTechnical.some((text) => /Production B6/.test(text) && /atomic AttendanceRecord/.test(text)), JSON.stringify(rosterTechnical));
  record("waitlist assignment check is plain English with raw B3 collapsed", /Before promotion, Flowstate must confirm the coach is still assigned/i.test(rosterPrimary) && !/Production B3|\bBOOKED\b/.test(rosterPrimary) && rosterTechnical.some((text) => /Production B3/.test(text) && /BOOKED/.test(text)), JSON.stringify(rosterTechnical));
  await page.locator('[data-action="waitlist-promote"]').click();
  record("waitlist promotion receipt is repeatable plain English", await page.getByText(/one confirmed booking/i).count() === 1 && await page.getByText(/nothing saved/i).count() > 0 && await page.locator('[data-action="waitlist-promote"]').isEnabled(), "receipt shown");
  await page.locator('[data-action="attendance"][data-member="jordan"][data-value="PRESENT"]').click();
  await page.waitForFunction(() => document.querySelector("#live-announcer")?.textContent?.includes("Jordan Okafor"));
  const announcement = await page.locator("#live-announcer").innerText();
  record("attendance announcement uses full Member name not raw id", /Jordan Okafor/.test(announcement) && !/for jordan\./i.test(announcement), announcement);
  record("attendance rerender restores changed row focus", (await page.evaluate(() => document.activeElement?.getAttribute("data-attendance-row"))) === "jordan", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 140)));
}

function parseCssColor(value) {
  const input = String(value).trim().toLowerCase();
  const srgb = input.match(/^color\(srgb\s+([^/)]+)(?:\s*\/\s*[^)]+)?\)$/);
  if (srgb) {
    const channels = srgb[1].trim().split(/\s+/).map((channel) => channel.endsWith("%") ? Number.parseFloat(channel) * 2.55 : Number.parseFloat(channel) * 255);
    if (channels.length === 3 && channels.every(Number.isFinite)) return channels;
  }
  const rgb = input.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const channels = rgb[1].split(/[\s,\/]+/).filter(Boolean).slice(0, 3).map((channel) => channel.endsWith("%") ? Number.parseFloat(channel) * 2.55 : Number.parseFloat(channel));
    if (channels.length === 3 && channels.every(Number.isFinite)) return channels;
  }
  const hex = input.match(/^#([\da-f]{6})$/i);
  if (hex) return [0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16));
  throw new Error(`Unsupported rendered CSS color: ${value}`);
}
function luminance(rgb) {
  const values = rgb.map((value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}
function contrast(foreground, background) {
  const a = luminance(parseCssColor(foreground));
  const b = luminance(parseCssColor(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function verifyMicrorepair(page) {
  const mobileContext = await makeContext({ width: 390, height: 844 });
  const mobile = await mobileContext.newPage();
  attachDiagnostics(mobile, "microrepair-member-mobile");
  await mobile.goto(urlFor({ world: "b", surface: "member" }), { waitUntil: "networkidle" });
  const memberCanvas = await mobile.evaluate(() => {
    const selectors = {
      heading: "#context-heading",
      subtitle: ".member-surface > .surface-title > div > p:last-child",
      filterLabel: ".member-page .filter-bar label",
      dayHeading: "#member-date",
      resultCopy: ".member-page > section .section-heading > p",
    };
    const background = getComputedStyle(document.body).backgroundColor;
    return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const node = document.querySelector(selector);
      return [name, { selector, color: node ? getComputedStyle(node).color : "missing", background }];
    }));
  });
  const canvasRatios = Object.fromEntries(Object.entries(memberCanvas).map(([name, colors]) => [name, colors.color === "missing" ? 0 : contrast(colors.color, colors.background)]));
  record("Training Signal member direct canvas copy contrast at 390px is at least 4.5", Object.values(canvasRatios).every((ratio) => ratio >= 4.5), JSON.stringify({ colors: memberCanvas, ratios: canvasRatios }));

  const classCard = await mobile.locator(".member-class").first().evaluate((card) => {
    const background = getComputedStyle(card).backgroundColor;
    return ["time", ".member-class-info strong", ".member-class-info p"].map((selector) => {
      const node = selector === "time" ? card.querySelector("time") : card.querySelector(selector);
      return { selector, color: getComputedStyle(node).color, background };
    });
  });
  const classCardRatios = classCard.map((colors) => ({ ...colors, ratio: contrast(colors.color, colors.background), foregroundLuminance: luminance(parseCssColor(colors.color)), backgroundLuminance: luminance(parseCssColor(colors.background)) }));
  record("Training Signal member class cards preserve dark text on light surfaces", classCardRatios.every((item) => item.ratio >= 4.5 && item.foregroundLuminance < item.backgroundLuminance), JSON.stringify(classCardRatios));
  await mobileContext.close();

  await page.goto(urlFor({ world: "a", surface: "operations", state: "permission" }), { waitUntil: "networkidle" });
  const permissionText = await page.locator("#prototype-main").innerText();
  const permissionAudit = {
    coachShell: await page.locator(".coach-shell").count(),
    coachIdentity: await page.locator(".coach-header").count() === 1 && await page.getByText("Coach", { exact: true }).count() === 1,
    ownerRail: await page.locator(".owner-rail").count(),
    ownerWorkspaceHeader: await page.locator(".workspace-header").count(),
    ownerBadge: await page.locator(".status-stamp").filter({ hasText: /^Owner$/ }).count(),
    currentDestinations: await page.locator('#prototype-main [aria-current="page"]').allTextContents(),
    links: await page.locator("#prototype-main a[href]").allTextContents(),
    safeTodayActions: await page.locator('[data-action="coach-today"]').allTextContents(),
    restrictedRegions: await page.locator(".schedule-board, .roster-view, .class-list, .attendance-list, .member-class-list, .billing-queue").count(),
    restrictedFactsVisible: sensitivePattern.test(permissionText) || /Today Fundamentals|\$\d/.test(permissionText),
  };
  record("permission state uses one coach-safe Today shell with owner and restricted details absent", permissionAudit.coachShell === 1 && permissionAudit.coachIdentity && permissionAudit.ownerRail === 0 && permissionAudit.ownerWorkspaceHeader === 0 && permissionAudit.ownerBadge === 0 && permissionAudit.currentDestinations.length === 1 && permissionAudit.currentDestinations[0].trim() === "Today" && permissionAudit.links.length === 1 && permissionAudit.links[0].trim() === "Today" && permissionAudit.safeTodayActions.length === 1 && /Coach Today/.test(permissionAudit.safeTodayActions[0]) && permissionAudit.restrictedRegions === 0 && !permissionAudit.restrictedFactsVisible, JSON.stringify(permissionAudit));
}

async function visiblePrimaryText(page, selector = "#prototype-main") {
  return page.locator(selector).evaluate((node) => {
    const copy = node.cloneNode(true);
    copy.querySelectorAll("details:not([open]) > :not(summary)").forEach((child) => child.remove());
    return copy.innerText;
  });
}

async function verifyPolishInlineResultContrast(page) {
  const parserProbe = parseCssColor("color(srgb 1 0.5 0)");
  record("polish rendered-color parser supports color(srgb …)", parserProbe[0] === 255 && parserProbe[1] === 127.5 && parserProbe[2] === 0, JSON.stringify(parserProbe));
  const scenarios = [
    { area: "owner rail", surface: "dashboard", action: '.owner-rail [data-action="prototype-message"]' },
    { area: "main light content", surface: "dashboard", state: "confirmation", action: '.confirmation-panel [data-action="prototype-message"]' },
    { area: "member", surface: "member", extra: "role=member", action: '.member-header details [data-action="prototype-message"]', prepare: async () => page.locator(".member-header details").evaluate((node) => { node.open = true; }) },
    { area: "migration", surface: "migration", action: '[data-action="local-email-explainer"]' },
    { area: "landing hero", surface: "landing", action: '[data-action="local-email-explainer"]' },
  ];
  for (const world of worlds) for (const scenario of scenarios) {
    await page.goto(urlFor({ world, surface: scenario.surface, state: scenario.state, extra: scenario.extra }), { waitUntil: "networkidle" });
    if (scenario.prepare) await scenario.prepare();
    await page.locator(scenario.action).click();
    const colors = await page.locator(".inline-result:visible").last().evaluate((node) => ({ foreground: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
    const ratio = contrast(colors.foreground, colors.background);
    record(`polish ${world}/${scenario.area} inline result contrast is at least 4.5`, ratio >= 4.5, JSON.stringify({ ...colors, ratio }));
    if (world === "a" && scenario.area === "owner rail") await capture(page, "special-inline-result-owner-generic-1440x1000.png", { world, surface: scenario.surface, state: "local-result", viewport: { label: "desktop", width: 1440, height: 1000 } });
    if (world === "b" && scenario.area === "landing hero") await capture(page, "special-inline-result-landing-email-1440x1000.png", { world, surface: scenario.surface, state: "local-result", viewport: { label: "desktop", width: 1440, height: 1000 } });
  }
}

async function verifyPolishReturnedFocus() {
  for (const viewport of [{ label: "desktop", width: 1440, height: 1000 }, { label: "mobile", width: 390, height: 844 }]) {
    const context = await makeContext({ width: viewport.width, height: viewport.height }, { reducedMotion: "reduce" });
    const page = await context.newPage();
    attachDiagnostics(page, `polish-returned-focus-${viewport.label}`);
    await page.goto(urlFor({ world: "a", surface: "operations" }), { waitUntil: "networkidle" });
    await page.locator("#roster-origin-fundamentals").click();
    await page.goBack({ waitUntil: "networkidle" });
    const audit = await page.locator("#roster-origin-fundamentals").evaluate((node) => {
      const style = getComputedStyle(node);
      const returnedFocusRule = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).find((rule) => rule.selectorText === "[data-returned-focus]");
      return { active: document.activeElement === node, returnedFocus: node.hasAttribute("data-returned-focus"), matches: node.matches("[data-returned-focus]"), focusToken: style.getPropertyValue("--gallery-focus"), outlineColor: style.outlineColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset, returnedFocusRule: returnedFocusRule?.cssText || "missing" };
    });
    record(`polish Browser Back returned focus is visibly marked at ${viewport.width}px`, audit.active && audit.returnedFocus && audit.outlineStyle !== "none" && parseFloat(audit.outlineWidth) >= 3 && parseFloat(audit.outlineOffset) >= 3, JSON.stringify(audit));
    await capture(page, `special-returned-focus-${viewport.width}x${viewport.height}.png`, { world: "a", surface: "operations", route: "schedule", state: "returned-focus", viewport });
    await context.close();
  }
}

async function verifyFinalRepair(page) {
  await page.goto(urlFor({ world: "a", surface: "dashboard", state: "loading" }), { waitUntil: "networkidle" });
  const loadingText = await visiblePrimaryText(page);
  const loadingControlsOutsideRegion = await page.locator("#prototype-main button, #prototype-main a[href]").evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length && !node.closest(".loading-region, .owner-rail")).map((node) => node.textContent?.trim()));
  record("final repair 1 loading replaces dynamic header truth and affected actions", !/READY|COMPLETE|Stripe setup missing|Stripe status unavailable|\d+\s+(?:items|records|results)|Reset class states/i.test(loadingText) && loadingControlsOutsideRegion.length === 0, JSON.stringify({ loadingText: loadingText.slice(0, 500), loadingControlsOutsideRegion }));

  await page.goto(urlFor({ world: "a", surface: "forms", extra: "route=forms" }), { waitUntil: "networkidle" });
  const formPrimary = await visiblePrimaryText(page, ".forms-surface");
  const dimensions = await page.locator("[data-form-record]").evaluateAll((rows) => rows.map((row) => ({ version: row.dataset.currentVersion, compliance: row.dataset.compliance, request: row.dataset.requestStatus })));
  await page.locator("#new-form-action").click();
  await page.locator('[data-action="form-version-confirm"]').click();
  const postVersion = await page.locator(".form-version-result").evaluate((node) => ({ text: node.innerText, version: node.dataset.currentVersion, cancelled: node.dataset.cancelledOpenRequests, created: node.dataset.currentRequestsCreated, outcomes: node.dataset.complianceOutcomes }));
  record("final repair 2 forms use plain English and preserve three semantic dimensions", /Version 3 · current/.test(formPrimary) && /Signed · 18 current signatures/.test(formPrimary) && /Signature needed · Sam Rivera’s signing request is open/.test(formPrimary) && /New signing request needed · previous links expired or were cancelled/.test(formPrimary) && !/FormVersion|SignatureRequest|\b(?:SIGNED|PENDING|MISSING|SUPERSEDED|OPEN|COMPLETED|EXPIRED|CANCELLED)\b/.test(formPrimary) && dimensions.length === 6 && dimensions.every((row) => row.version && row.compliance && row.request) && postVersion.version === "3" && postVersion.cancelled === "3" && postVersion.created === "0" && postVersion.outcomes === "SUPERSEDED MISSING" && /prior signatures become previous-version evidence/i.test(postVersion.text) && /no current signing requests were created/i.test(postVersion.text), JSON.stringify({ formPrimary: formPrimary.slice(0, 900), dimensions, postVersion }));

  await page.goto(urlFor({ world: "a", surface: "member", extra: "role=member" }), { waitUntil: "networkidle" });
  const punchAction = page.locator('[data-action="member-punch"][data-key="open-mat"]');
  if (await punchAction.count()) await punchAction.click();
  const punchBooked = await page.locator('[data-member-class="open-mat"]').innerText();
  const dropInButtonCount = await page.locator('[data-action="member-drop-in"]').count();
  record("final repair 3 punch and drop-in use separate coherent state machines", /Booked/i.test(punchBooked) && /Booking type\s*·?\s*Punch card/i.test(punchBooked) && /Balance\s*·?\s*4/i.test(punchBooked) && /No payment or provider state exists/i.test(punchBooked) && await page.locator('[data-action="member-punch-timely"]').count() === 1 && await page.locator('[data-action="member-punch-late"]').count() === 1 && dropInButtonCount === 1, JSON.stringify({ punchBooked, dropInButtonCount }));

  await page.goto(urlFor({ world: "a", surface: "operations", extra: "route=bookings" }), { waitUntil: "networkidle" });
  const bookingRoute = { ownerShell: await page.locator(".owner-shell").count(), memberShell: await page.locator(".member-header").count(), operationsSurface: await page.locator(".operations-surface").count(), h1: await page.locator("#context-heading").innerText(), h2: await page.locator("#owner-bookings-heading").innerText(), current: await page.locator('.owner-rail [aria-current="page"]').allTextContents(), role: await page.locator("body").getAttribute("data-role"), gallerySurface: await page.locator("#surface-select").inputValue() };
  record("final repair 4 owner Bookings keeps owner role route current destination and an appropriate gallery surface", bookingRoute.ownerShell === 1 && bookingRoute.memberShell === 0 && bookingRoute.operationsSurface === 1 && /Class bookings/i.test(bookingRoute.h1) && /Class booking records/i.test(bookingRoute.h2) && bookingRoute.current.length === 1 && bookingRoute.current[0].trim() === "Bookings" && bookingRoute.role === "owner" && bookingRoute.gallerySurface === "operations", JSON.stringify(bookingRoute));

  await page.goto(urlFor({ world: "a", surface: "operations" }), { waitUntil: "networkidle" });
  const origin = page.locator('[data-action="open-roster"][data-class="fundamentals"]');
  const originId = await origin.getAttribute("id");
  await origin.click();
  await page.goBack({ waitUntil: "networkidle" });
  const restoredFocus = await page.evaluate(() => document.activeElement?.id);
  record("final repair 5 browser Back restores the exact Schedule class action", Boolean(originId) && restoredFocus === originId && new URL(page.url()).searchParams.get("view") === null, JSON.stringify({ originId, restoredFocus, url: page.url() }));

  await page.goto(urlFor({ world: "a", surface: "dashboard" }), { waitUntil: "networkidle" });
  const ownerLogout = page.locator('.owner-rail [data-action="prototype-message"]');
  await ownerLogout.click();
  const ownerReset = page.locator('.owner-rail [data-action="local-action-reset"]');
  const resetVisible = await ownerReset.isVisible().catch(() => false);
  if (resetVisible) await ownerReset.click();
  record("final repair 6 generic simulated action has visible reset and exact focus return", resetVisible && await ownerLogout.isEnabled() && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "prototype-message", JSON.stringify({ resetVisible, enabled: await ownerLogout.isEnabled().catch(() => false) }));

  await page.goto(urlFor({ world: "a", surface: "forms", extra: "route=forms" }), { waitUntil: "networkidle" });
  const defaultFormsText = await visiblePrimaryText(page, ".forms-surface");
  await page.goto(urlFor({ world: "a", surface: "forms", extra: "route=rooms" }), { waitUntil: "networkidle" });
  const roomsText = await visiblePrimaryText(page, ".forms-surface");
  await page.goto(urlFor({ world: "a", surface: "forms", extra: "route=programs" }), { waitUntil: "networkidle" });
  const programsText = await visiblePrimaryText(page, ".forms-surface");
  record("final repair 7 Forms Rooms and Programs are separate route tasks", !/Add a room|Gym setup/.test(defaultFormsText) && /Add a room/.test(roomsText) && !/Form library|Gym setup/.test(roomsText) && /Gym setup/.test(programsText) && !/Form library|Add a room/.test(programsText), JSON.stringify({ defaultFormsText: defaultFormsText.slice(0, 500), roomsText: roomsText.slice(0, 350), programsText: programsText.slice(0, 350) }));

  await page.goto(urlFor({ world: "a", surface: "migration" }), { waitUntil: "networkidle" });
  const migrationPrimary = await visiblePrimaryText(page, ".migration-surface");
  await page.goto(urlFor({ world: "a", surface: "operations", extra: "view=roster&class=fundamentals&route=roster" }), { waitUntil: "networkidle" });
  const operationsPrimary = await visiblePrimaryText(page, ".operations-surface");
  await page.goto(urlFor({ world: "a", surface: "billing", extra: "route=billing&member=avery-hernandez-lawson" }), { waitUntil: "networkidle" });
  const billingPrimary = await visiblePrimaryText(page, ".billing-surface");
  record("final repair 8 primary copy is plain English and named context is canonical", /Gym status:\s*Ready for daily operations/i.test(migrationPrimary) && /Migration:\s*Complete/i.test(migrationPrimary) && /Owner review:\s*Recorded/i.test(migrationPrimary) && /Flowstate readiness review:\s*Recorded/i.test(migrationPrimary) && !/Workspace|MigrationStage|tuple|derived|persisted|audit|nonconcurrent/i.test(migrationPrimary) && /Each attendance change must be saved once and rejected if the record changed/i.test(operationsPrimary) && /Before promotion, Flowstate must confirm the coach is still assigned/i.test(operationsPrimary) && !/Production B[36]|atomic AttendanceRecord|\bBOOKED\b/.test(operationsPrimary) && /Avery Hernandez-Lawson/.test(billingPrimary) && !/avery hernandez lawson/i.test(billingPrimary), JSON.stringify({ migrationPrimary: migrationPrimary.slice(0, 800), operationsPrimary: operationsPrimary.slice(0, 900), billingPrimary: billingPrimary.slice(0, 400) }));

  await page.goto(urlFor({ world: "a", surface: "dashboard" }), { waitUntil: "networkidle" });
  const dashboardPrimary = await visiblePrimaryText(page, ".dashboard-surface");
  record("polish dashboard replaces raw status and derivation copy", /Signature needed/.test(dashboardPrimary) && /Attendance recorded/.test(dashboardPrimary) && !/Compliance · PENDING|Attendance recorded \(derived\)/.test(dashboardPrimary), dashboardPrimary.slice(0, 900));
  const readinessGrid = await page.locator(".readiness-tuple dl").evaluate((node) => ({ facts: node.children.length, columns: getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length }));
  await page.goto(urlFor({ world: "a", surface: "migration" }), { waitUntil: "networkidle" });
  const completedMigrationPrimary = await visiblePrimaryText(page, ".migration-surface");
  const migrationGrid = await page.locator(".migration-readiness dl").evaluate((node) => ({ facts: node.children.length, columns: getComputedStyle(node).gridTemplateColumns.split(/\s+/).filter(Boolean).length }));
  const migrationResultGrid = await page.locator(".migration-results dl").evaluate((node) => ({ facts: node.children.length, gridWidth: node.getBoundingClientRect().width, lastFactWidth: node.lastElementChild.getBoundingClientRect().width }));
  record("polish completed migration presents a nonblocking future import safeguard", /Future import safeguard/.test(completedMigrationPrimary) && /For future imports/.test(completedMigrationPrimary) && /This fictional completed snapshot contains no unrecognized statuses\. For future imports, Flowstate must stop and request review whenever it encounters a status it does not recognize\./.test(completedMigrationPrimary) && !/completed fixture|fail-closed|production prerequisite|BLOCKING BACKEND REPAIR|unresolved blocking backend repair/i.test(completedMigrationPrimary), completedMigrationPrimary.slice(0, 1200));
  record("polish four-fact readiness grids have no filler column", readinessGrid.facts === 4 && readinessGrid.columns === 4 && migrationGrid.facts === 4 && migrationGrid.columns === 4, JSON.stringify({ readinessGrid, migrationGrid }));
  record("polish migration result facts leave no gray filler cell", migrationResultGrid.facts === 3 && migrationResultGrid.lastFactWidth >= migrationResultGrid.gridWidth - 2, JSON.stringify(migrationResultGrid));
  await page.goto(urlFor({ world: "a", surface: "dashboard", state: "unavailable" }), { waitUntil: "networkidle" });
  const unavailablePrimary = await visiblePrimaryText(page, ".dashboard-surface");
  const unavailableTechnical = await page.locator(".unavailable-replacement details").textContent().catch(() => "");
  const unavailableCopyCount = unavailablePrimary.split("This action is not available yet. Flowstate must finish reviewing it with the gym owner before it can be used.").length - 1;
  record("polish unavailable primary copy is plain and raw contract terms are collapsed", unavailableCopyCount === 2 && !/Flowstate Backend|production contract/i.test(unavailablePrimary) && /production contract/i.test(unavailableTechnical), JSON.stringify({ unavailableCopyCount, unavailablePrimary, unavailableTechnical }));
  await capture(page, "special-unavailable-owner-copy-1440x1000.png", { world: "a", surface: "dashboard", state: "unavailable", viewport: { label: "desktop", width: 1440, height: 1000 } });

  await verifyPolishInlineResultContrast(page);
  await verifyPolishReturnedFocus();

  const verifierSource = fs.readFileSync(path.join(ARTIFACT_ROOT, "verify.mjs"), "utf8");
  const rollbackSource = verifierSource.match(/^\s+const rollbackInstruction = "([^"]+)";$/m)?.[1] || "";
  record("final repair 9 generated rollback evidence is state-neutral and truthful", /Remove the six prototype files in \.design\/redesign-v2-prototype\/ and the ignored evidence under the selected output root/.test(rollbackSource) && /no schema, data, or provider rollback/i.test(rollbackSource) && !/five unstaged text-file repairs|staged old candidate|read-only asset remain untouched/.test(rollbackSource), rollbackSource);
}

async function verifyContrastAndMenus(page) {
  await page.goto(urlFor({ world: "b", surface: "migration" }), { waitUntil: "networkidle" });
  const colors = await page.locator(".migration-technical summary").evaluate((node) => ({ color: getComputedStyle(node).color, background: getComputedStyle(node.closest("details")).backgroundColor, decoration: getComputedStyle(node).textDecorationLine }));
  const ratio = contrast(colors.color, colors.background);
  record("Training Signal migration disclosure contrast ratio at least 4.5", ratio >= 4.5 && colors.decoration.includes("underline"), JSON.stringify({ ...colors, ratio }));

  const tabletContext = await makeContext({ width: 768, height: 1024 });
  const tablet = await tabletContext.newPage();
  attachDiagnostics(tablet, "menu-tablet");
  await tablet.goto(urlFor({ world: "a", surface: "dashboard" }), { waitUntil: "networkidle" });
  await tablet.locator('.shell-menu[data-action="menu-open"]').click();
  record("menu opens with close focus", (await tablet.evaluate(() => document.activeElement?.getAttribute("data-action"))) === "menu-close", await tablet.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
  await tablet.keyboard.press("Escape");
  record("menu Escape returns actual opener", (await tablet.evaluate(() => document.activeElement?.classList.contains("shell-menu"))) === true, await tablet.evaluate(() => document.activeElement?.outerHTML.slice(0, 140)));
  await capture(tablet, "special-tablet-dashboard-768x1024.png", { world: "a", surface: "dashboard", state: "default", viewport: { label: "tablet", width: 768, height: 1024 } });
  await tabletContext.close();
}

async function verifyGenericActionRecovery(page) {
  const scenarios = [
    { name: "owner dashboard", url: urlFor({ world: "a", surface: "dashboard" }) },
    { name: "generic confirmation", url: urlFor({ world: "a", surface: "dashboard", state: "confirmation" }) },
    { name: "member logout", url: urlFor({ world: "a", surface: "member", extra: "role=member" }), openMemberMore: true },
    { name: "migration explainer", url: urlFor({ world: "a", surface: "migration" }) },
    { name: "landing explainer", url: urlFor({ world: "a", surface: "landing" }) },
  ];
  let inventoried = 0;
  let captured = false;
  for (const scenario of scenarios) {
    await page.goto(scenario.url, { waitUntil: "networkidle" });
    if (scenario.openMemberMore) await page.locator(".member-header details").evaluate((details) => { details.open = true; });
    const buttons = page.locator('[data-action="prototype-message"]:visible, [data-action="local-email-explainer"]:visible');
    const count = await buttons.count();
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      const actionName = (await button.innerText()).trim();
      const action = await button.getAttribute("data-action");
      await button.click();
      const key = await button.getAttribute("data-local-action-trigger");
      const result = page.locator(`[data-local-action-result="${key}"]`);
      const reset = result.locator('[data-action="local-action-reset"]');
      const resetVisible = await reset.isVisible();
      record(`${scenario.name} generic action ${actionName} exposes adjacent reset`, Boolean(key) && resetVisible && !(await button.isEnabled()) && await result.getByRole("status").count() === 1, JSON.stringify({ key, resetVisible }));
      if (!captured) {
        await capture(page, "special-generic-action-reset-1440x1000.png", { world: "a", surface: scenario.name, state: "local-result", viewport: { label: "desktop", width: 1440, height: 1000 } });
        captured = true;
      }
      await reset.click();
      record(`${scenario.name} generic action ${actionName} resets and returns focus`, await button.isEnabled() && (await page.evaluate(() => document.activeElement?.getAttribute("data-action"))) === action && await page.locator(`[data-local-action-result="${key}"]`).count() === 0, `focus=${await page.evaluate(() => document.activeElement?.textContent?.trim())}`);
      inventoried += 1;
    }
  }
  record("generic simulated action inventory covers owner member confirmation migration and landing", inventoried >= 6, `inventoried=${inventoried}`);
}

async function verifyLandingAndNarrow(page) {
  await page.goto(urlFor({ world: "b", surface: "landing" }), { waitUntil: "networkidle" });
  await page.locator('[data-action="local-email-explainer"]').click();
  record("local email explainer opens no external app", await page.getByText(/opened no external app and sent nothing/i).count() === 1, "local explanation");
  await page.locator('[data-landing-form] button[type="submit"]').click();
  record("landing validation focus", (await page.evaluate(() => document.activeElement?.id)) === "landing-errors", await page.evaluate(() => document.activeElement?.id));
  await page.fill("#interest-name", "Jordan Lee");
  await page.fill("#interest-email", "jordan@northharbour.example");
  await page.locator('[data-landing-form] button[type="submit"]').click();
  record("landing success clears aria-invalid", await page.locator('[data-landing-form] [aria-invalid="true"]').count() === 0 && await page.getByText(/Nothing was stored or sent/i).count() > 0, "local result");

  const narrowContext = await makeContext({ width: 320, height: 700 });
  const narrow = await narrowContext.newPage();
  attachDiagnostics(narrow, "narrow");
  for (const world of worlds) for (const surface of surfaces) {
    await narrow.goto(urlFor({ world, surface, state: surface === "foundation" || surface === "billing" ? "long" : "default" }), { waitUntil: "networkidle" });
    const narrowWidths = await widths(narrow);
    record(`${world}/${surface} 320px no overflow`, narrowWidths.scrollWidth <= narrowWidths.clientWidth + 1, JSON.stringify(narrowWidths));
  }
  await narrow.goto(urlFor({ world: "a", surface: "billing", state: "long" }), { waitUntil: "networkidle" });
  record("long technical values stay collapsed", !(await narrow.locator(".provider-banner details").getAttribute("open")) && await narrow.getByText("Technical reference", { exact: true }).count() > 0, "collapsed technical reference");
  await capture(narrow, "special-long-content-320x700.png", { world: "a", surface: "billing", state: "long", viewport: { label: "narrow", width: 320, height: 700 } });
  await narrowContext.close();
}

async function verifyNoJavaScript() {
  const context = await makeContext({ width: 390, height: 844 }, { javaScriptEnabled: false });
  const page = await context.newPage();
  attachDiagnostics(page, "no-js");
  const response = await page.goto(urlFor(), { waitUntil: "networkidle" });
  const text = await page.locator("noscript").innerText();
  const pageWidths = await widths(page);
  record("no-JS static comprehension", response?.status() === 200 && await page.locator("noscript h1").count() === 1 && /Field Ledger/.test(text) && /Training Signal/.test(text) && /no backend or live provider/i.test(text), text.slice(0, 220));
  record("no-JS no overflow", pageWidths.scrollWidth <= pageWidths.clientWidth + 1, JSON.stringify(pageWidths));
  await context.close();
}

async function verifyInteractionsAndSpecials() {
  const context = await makeContext({ width: 1440, height: 1000 });
  const page = await context.newPage();
  attachDiagnostics(page, "interactions");
  await verifyReadinessAndStates(page);
  await verifyForms(page);
  await verifyFiltersContextAndFocus(page);
  await verifyMemberAndAttendance(page);
  await verifyContrastAndMenus(page);
  await verifyGenericActionRecovery(page);
  await verifyLandingAndNarrow(page);
  await verifyFinalRepair(page);
  await page.goto(urlFor({ world: "b", surface: "operations", state: "stale" }), { waitUntil: "networkidle" });
  await capture(page, "special-stale-current-information.png", { world: "b", surface: "operations", state: "stale", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.goto(urlFor({ world: "a", surface: "billing", state: "provider-missing" }), { waitUntil: "networkidle" });
  await capture(page, "special-provider-setup-missing.png", { world: "a", surface: "billing", state: "provider-missing", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await page.goto(urlFor({ world: "a", surface: "operations", state: "permission" }), { waitUntil: "networkidle" });
  await capture(page, "special-permission-safe-recovery.png", { world: "a", surface: "operations", state: "permission", viewport: { label: "desktop", width: 1440, height: 1000 } });
  await context.close();
}

function writeOutputs(error) {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const rollbackInstruction = "Remove the six prototype files in .design/redesign-v2-prototype/ and the ignored evidence under the selected output root. No schema, data, or provider rollback is required.";
  record("generated report uses state-neutral rollback instructions", /six prototype files/.test(rollbackInstruction) && /ignored evidence/.test(rollbackInstruction) && /No schema, data, or provider rollback/.test(rollbackInstruction) && !/unstaged|staged old candidate|read-only asset/.test(rollbackInstruction), rollbackInstruction);
  const failed = results.filter((item) => !item.pass);
  const manifest = {
    verdict: error || failed.length ? "BLOCKED" : "FINAL REPAIR READY",
    artifact: ".design/redesign-v2-prototype/index.html",
    serverRoot: path.relative(WORKTREE, ARTIFACT_ROOT).replaceAll("\\", "/"),
    servedUrl: `http://127.0.0.1:${PORT}${ARTIFACT_ROUTE}`,
    outputRoot: path.relative(WORKTREE, OUTPUT_ROOT).replaceAll("\\", "/"),
    worlds: { a: "Field Ledger — recommended compact base", b: "Training Signal — contrast world" },
    surfaces,
    viewports,
    tests: { total: results.length, passed: results.filter((item) => item.pass).length, failed: failed.length, results },
    diagnostics,
    screenshots,
    knownPrototypeLimits: [
      "Static fictional one-location content; no production usability or customer approval is claimed.",
      "All mutations stay in browser memory; no backend, durable storage, email, Stripe, migration, waitlist, booking, attendance, or form write exists.",
      "CSS-only skeletons demonstrate target geometry. No Bklit, Motion, Boneyard, package, or dependency was installed or executed.",
      "The artifact cannot certify server authorization, transactions, concurrency, provider idempotency, migration integrity, email delivery, or durable storage.",
      "Production work remains governed by specialist review and CEO gates.",
    ],
    rollback: rollbackInstruction,
    error: error ? String(error.stack ?? error) : null,
  };
  fs.writeFileSync(path.join(OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const report = `# Flowstate Redesign V2 prototype repair verification\n\n**Verdict: ${manifest.verdict}**\n\n## Outcome\n\n${manifest.verdict === "FINAL REPAIR READY" ? `The repaired local A/B artifact passed ${manifest.tests.passed}/${manifest.tests.total} scripted checks with ${screenshots.length} deterministic screenshots and no browser or network diagnostics.` : `Verification remains blocked: ${failed.length} assertion(s) failed${error ? `; runtime error: ${String(error.message ?? error)}` : ""}.`}\n\n## Evidence\n\n- Artifact server root: \`${manifest.serverRoot}\`\n- Output root: \`${manifest.outputRoot}\`\n- Screenshots: ${screenshots.length}\n- Console warnings/errors: ${diagnostics.console.length}\n- Page errors: ${diagnostics.pageErrors.length}\n- Failed requests: ${diagnostics.requestFailures.length}\n- External requests: ${diagnostics.externalRequests.length}\n\n## Checks\n\n${results.map((item) => `- ${item.pass ? "PASS" : "FAIL"} — ${item.name}: ${item.detail}`).join("\n")}\n\n## Screenshot manifest\n\n${screenshots.map((item) => `- \`${item.path}\` — ${item.dimensions?.width ?? "?"}×${item.dimensions?.height ?? "?"} px — sha256 \`${item.sha256}\``).join("\n")}\n\n## Residual prototype limits\n\n${manifest.knownPrototypeLimits.map((item) => `- ${item}`).join("\n")}\n\n## Rollback\n\n${manifest.rollback}\n`;
  fs.writeFileSync(path.join(OUTPUT_ROOT, "report.md"), report);
  return manifest;
}

async function main() {
  let error;
  try {
    fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
    fs.mkdirSync(SCREENSHOT_ROOT, { recursive: true });
    verifyStaticFiles();
    await inspectPort();
    await startServer();
    record("owned static server started", true, `root=${ARTIFACT_ROOT}; port=${PORT}`);
    browser = await chromium.launch({ headless: true });
    if (FOCUS === "microrepair") {
      await verifyMicrorepair(await browser.newPage());
    } else if (FOCUS === "final-repair") {
      await verifyFinalRepair(await browser.newPage());
    } else {
      await captureMatrix();
      await verifyLoading();
      await verifyInteractionsAndSpecials();
      await verifyMicrorepair(await browser.newPage());
      await verifyNoJavaScript();
    }
  } catch (caught) {
    error = caught;
  } finally {
    if (browser) await browser.close();
    await stopServer();
    record("owned server stopped", true, `127.0.0.1:${PORT} closed`);
    record("no console warnings or errors", diagnostics.console.length === 0, JSON.stringify(diagnostics.console));
    record("no page errors", diagnostics.pageErrors.length === 0, JSON.stringify(diagnostics.pageErrors));
    record("no failed requests", diagnostics.requestFailures.length === 0, JSON.stringify(diagnostics.requestFailures));
    record("zero external hosts", diagnostics.externalRequests.length === 0, JSON.stringify(diagnostics.externalRequests));
  }
  const manifest = writeOutputs(error);
  if (error) throw error;
  if (manifest.tests.failed) throw new Error(`${manifest.tests.failed} verifier assertions failed; see ${path.join(OUTPUT_ROOT, "report.md")}`);
  console.log(`FINAL REPAIR READY — ${manifest.tests.passed}/${manifest.tests.total} checks passed; ${screenshots.length} screenshots captured; owned server stopped.`);
  console.log(path.join(OUTPUT_ROOT, "report.md"));
}

await main();
