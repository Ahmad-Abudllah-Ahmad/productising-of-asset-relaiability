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
  "vercel.json"
]);

function copyDir(src, out, isRoot) {
  fs.mkdirSync(out, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === ".DS_Store" || name.endsWith(".log")) continue;
    if (isRoot && rootSkip.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(out, name);
    const stat = fs.statSync(from);
    if (stat.isDirectory()) copyDir(from, to, false);
    else if (stat.isFile()) fs.copyFileSync(from, to);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
copyDir(root, dest, true);

const required = [
  "index.html",
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
