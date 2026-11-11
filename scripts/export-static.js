const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "public");
const rootSkip = new Set([
  "public",
  "node_modules",
  ".git",
  ".vercel",
  "scripts",
  "server.js",
  "server.py",
  "package.json",
  "package-lock.json",
  "README.md",
  ".gitignore",
  "firebase-debug.log",
  "vercel.json",
  "azeri enerji dashbaord v3 - Copy"
]);
const skipDirs = new Set(["node_modules", "venv", ".git", "__pycache__", "models", ".vercel"]);

function skipFile(name) {
  return (
    name === ".DS_Store" ||
    name.endsWith(".log") ||
    name === ".env" ||
    name.startsWith(".env.") ||
    name.endsWith(".pt") ||
    name.endsWith(".pth")
  );
}

function copyDir(src, out, isRoot) {
  fs.mkdirSync(out, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skipFile(name)) continue;
    if (isRoot && rootSkip.has(name)) continue;
    if (!isRoot && skipDirs.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(out, name);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) copyDir(from, to, false);
    else if (stat.isFile()) fs.copyFileSync(from, to);
  }
}

function copyInspection(dist, out) {
  if (!fs.existsSync(dist)) {
    console.error("Missing inspection dashboard build: " + dist);
    process.exit(1);
  }
  function walk(src, rel) {
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      const next = rel ? path.posix.join(rel, name) : name;
      const stat = fs.statSync(from);
      if (stat.isDirectory()) walk(from, next);
      else if (stat.isFile()) {
        const target = rel === "" && name === "index.html" ? "inspection.html" : next;
        const destFile = path.join(out, target);
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.copyFileSync(from, destFile);
      }
    }
  }
  walk(dist, "");
}

fs.rmSync(dest, { recursive: true, force: true });
copyDir(root, dest, true);
copyInspection(
  path.join(root, "azeri enerji dashbaord v3 - Copy", "power-lines-system", "frontend", "dist"),
  dest
);
for (const route of [
  "dashboard",
  "runs",
  "ai-detection",
  "thermal-images",
  "video-upload",
  "map",
  "review-queue",
  "settings",
  "live-drone-feed",
  "register",
  "pending",
  "join",
  "forgot-password",
  "reset-password",
  "team",
  "defect-analysis",
  "asset-health",
  "components",
  "volt",
  "nova",
  "admin"
]) {
  const folder = path.join(dest, route);
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(path.join(dest, "inspection.html"), path.join(folder, "index.html"));
}

// Module 02 entry: the inspection app opened on its own landing page (see assets/custom/ai-inspection-entry.js)
fs.mkdirSync(path.join(dest, "ai-inspection"), { recursive: true });
fs.writeFileSync(
  path.join(dest, "ai-inspection", "index.html"),
  fs.readFileSync(path.join(dest, "inspection.html"), "utf8").replace("<head>", '<head><script src="/assets/custom/ai-inspection-entry.js"></script>')
);

const leaked = [];
function findLeaks(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === ".env" || name.startsWith(".env.") || name.endsWith(".pt")) leaked.push(full);
    if (fs.statSync(full).isDirectory()) findLeaks(full);
  }
}
findLeaks(dest);
if (leaked.length) {
  console.error("Refusing to publish secrets or model weights:");
  leaked.forEach(function (file) { console.error(file); });
  process.exit(1);
}

const inspectionHtml = fs.readFileSync(path.join(dest, "inspection.html"), "utf8");
if (!inspectionHtml.includes('id="root"') || !inspectionHtml.includes("/assets/index-")) {
  console.error("Inspection dashboard shell was not exported.");
  process.exit(1);
}

const required = [
  "index.html",
  "inspection.html",
  "login/index.html",
  "reliability/index.html",
  "assets/custom/nexus-apps.js",
  "assets/custom/nexus-hero-film.mp4",
  "assets/custom/spark-theme-layout.css"
];

for (const file of required) {
  if (!fs.existsSync(path.join(dest, file))) {
    console.error("Missing from static export: " + file);
    process.exit(1);
  }
}

console.log("Static site exported to public/");
