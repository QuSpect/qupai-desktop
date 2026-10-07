// QuPai for Windows, installed and used as a person would, on a GitHub windows-latest runner:
//  1. the installer (A) installs QuPai for this user, silently;
//  2. the first launch offers QuPai Cloud or this PC, and says commands aren't sandboxed;
//  3. on this PC, with a model service that is a fake on this runner (fake-model.mjs), a message
//     makes the agent run a Bash command (in Git Bash) that writes a file in the chosen folder;
//  4. the side panel opens freely and shows a web page (a <webview>);
//  5. quitting stops the Runtime;
//  6. with a newer build (B) in the update feed the copy offers Update, and clicking it installs
//     B silently and opens it.
// The installers and update-win.json are in assets/ (the workflow downloads them from a draft
// release); screenshots and logs go to smoke-out/. With only the feed's own installer (a release
// about to be published) there is nothing to update to, and step 6 is left out.
import { execFileSync, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright-core";
import { fakeModel, turnInFolder } from "./fake-model.mjs";

const out = join(process.cwd(), "smoke-out");
mkdirSync(out, { recursive: true });
const assets = join(process.cwd(), "assets");
const step = (s) => console.log(`\n== ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (why) => {
  console.error(`FAILED: ${why}`);
  process.exit(1);
};

const installers = readdirSync(assets).filter((n) => /^QuPai-.*-Setup-x64\.exe$/.test(n)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const feed = JSON.parse(readFileSync(join(assets, "update-win.json"), "utf8"));
const older = installers.find((n) => !n.includes(feed.version));
const first = older ?? installers.find((n) => n.includes(feed.version));
if (!first) fail(`assets/ has no installer: ${readdirSync(assets).join(", ")}`);

step(`install ${first} silently`);
const r = spawnSync(join(assets, first), ["/S"], { stdio: "inherit" });
if (r.status !== 0) fail(`the installer exited ${r.status}`);
const programs = join(process.env.LOCALAPPDATA, "Programs");
const dir = readdirSync(programs).map((d) => join(programs, d)).find((d) => existsSync(join(d, "QuPai.exe")));
if (!dir) fail(`no QuPai.exe under ${programs}: ${readdirSync(programs).join(", ")}`);
const exe = join(dir, "QuPai.exe");
const versionOf = () => execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Item '${exe}').VersionInfo.ProductVersion`], { encoding: "utf8" }).trim();
console.log(`installed ${exe}, version ${versionOf()}`);

const ud = mkdtempSync(join(tmpdir(), "qupai-smoke-ud-"));
const launch = () => _electron.launch({ executablePath: exe, args: [`--user-data-dir=${ud}`], timeout: 90_000 });

step("first launch: the start page");
let app = await launch();
let page = await app.firstWindow();
await page.waitForSelector(".ds-option", { timeout: 60_000 });
await page.screenshot({ path: join(out, "1-start.png") });
const start = await page.innerText("body");
console.log(start.replace(/\s+/g, " ").slice(0, 400));
if (!/Work on this PC/.test(start) || !/aren't sandboxed/.test(start)) fail("the start page should offer this PC and say commands aren't sandboxed");
const key = await app.evaluate(({ safeStorage }) => safeStorage.encryptString("sk-smoke").toString("base64"));
await app.close();

step("this PC, with a fake model service");
const { server: model, seen } = await fakeModel({ port: 9911, command: "echo hello-from-windows > out.txt && echo \"shell: $BASH_VERSION\"" });
writeFileSync(join(ud, "settings.json"), JSON.stringify({
  mode: "local", theme: "light",
  models: { preset: "custom", apiUrl: "http://127.0.0.1:9911/v1", models: ["fake-model"], clientType: "openai", key },
}));
app = await launch();
page = await app.firstWindow();
await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 90_000 });
const origin = new URL(page.url()).origin;
await page.waitForSelector(".shell-sidebar", { timeout: 60_000 });
await page.screenshot({ path: join(out, "2-local.png") });
const token = readFileSync(join(ud, "runtime", "runtime.token"), "utf8").trim();
const folder = "C:\\qupai-smoke\\lab";
mkdirSync(folder, { recursive: true });
const end = await turnInFolder(origin, token, folder);
const written = existsSync(join(folder, "out.txt")) ? readFileSync(join(folder, "out.txt"), "utf8").trim() : "(none)";
const system = JSON.stringify(seen.find((b) => b.tools)?.messages?.[0]?.content ?? "");
const toolResult = JSON.stringify(seen.find((b) => b.messages?.at(-1)?.role === "tool")?.messages?.at(-1)?.content ?? "");
console.log(`turn ${end.status}; out.txt: ${written}; tool result: ${toolResult.slice(0, 200)}`);
console.log(`system prompt (Windows part): ${system.match(/The computer runs Windows[^"]{0,300}/)?.[0] ?? "(none)"}`);
await page.reload();
await page.waitForSelector(".shell-sidebar", { timeout: 60_000 });
await page.screenshot({ path: join(out, "3-after-turn.png") });
if (end.status !== "succeeded") fail(`the turn ended ${end.status}`);
if (written !== "hello-from-windows") fail("the command did not write out.txt in the folder");
if (!/Git Bash/.test(system)) fail("the model was not told its commands run in Git Bash on Windows");

step("the side panel: a New tab, then a web page");
const toggle = page.locator('.topbar button[aria-label="Show the preview pane"]');
if (await toggle.count()) {
  await toggle.click();
  await page.waitForSelector('[data-testid="preview-launcher"]', { timeout: 15_000 });
  await page.fill(".newtab .web-address", "example.com");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-testid="preview-web"] webview', { timeout: 15_000 });
  let label = "";
  for (let i = 0; i < 40 && !/Example Domain/.test(label); i++) {
    await sleep(500);
    label = await page.locator(".preview-pane [role='tab'][aria-selected='true']").innerText().catch(() => "");
  }
  await page.screenshot({ path: join(out, "3b-web-tab.png") });
  console.log(`web tab: ${label}`);
  if (!/Example Domain/.test(label)) fail("the side panel's web page did not load");
} else {
  console.log("(this build has no free side panel)");
}

step("quitting stops the Runtime");
await app.close();
let stopped = false;
for (let i = 0; i < 40 && !stopped; i++) {
  try {
    await fetch(`${origin}/health`);
    await sleep(250);
  } catch {
    stopped = true;
  }
}
if (!stopped) fail("the Runtime still answers after QuPai quit");
console.log("the Runtime stopped");
model.close();
if (!older) {
  console.log(`\nALL PASSED (installed in ${dir}; no older build to update from)`);
  process.exit(0);
}

step(`update to ${feed.version} (${feed.build})`);
const feedServer = createServer((req, res) => {
  const file = join(assets, decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1)));
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-length": statSync(file).size });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => feedServer.listen(8765, "127.0.0.1", resolve));
await fakeModel({ port: 9911, command: "true" });
app = await launch();
page = await app.firstWindow();
await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 90_000 });
await page.waitForSelector(".shell-update", { timeout: 180_000 });
await page.screenshot({ path: join(out, "4-update-ready.png") });
const before = versionOf();
await page.click(".shell-update").catch(() => {});
await app.close().catch(() => {}); // it quits on its own to update
let after = before;
for (let i = 0; i < 90 && !after.startsWith(feed.version); i++) {
  await sleep(2000);
  after = versionOf();
}
const running = execFileSync("tasklist", ["/FI", "IMAGENAME eq QuPai.exe"], { encoding: "utf8" });
console.log(`version ${before} → ${after}; running after the update: ${/QuPai\.exe/i.test(running)}`);
spawnSync("taskkill", ["/IM", "QuPai.exe", "/T", "/F"], { stdio: "ignore" });
feedServer.close();
if (!after.startsWith(feed.version)) fail(`QuPai did not update to ${feed.version}`);
console.log("\nALL PASSED");
process.exit(0);
