const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const INSPECTION_DIST = path.join(
  ROOT,
  "azeri enerji dashbaord v3 - Copy",
  "power-lines-system",
  "frontend",
  "dist"
);
const INSPECTION_ROUTES = [
  "/dashboard",
  "/runs",
  "/ai-detection",
  "/thermal-images",
  "/video-upload",
  "/map",
  "/review-queue",
  "/settings",
  "/live-drone-feed",
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
};

const INSPECTION_API = process.env.INSPECTION_API || "http://127.0.0.1:8001";

function isInspectionApi(pathname) {
  return (
    pathname === "/health" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/results/") ||
    pathname.startsWith("/socket.io")
  );
}

function proxyInspection(req, res) {
  const target = new URL(req.url, INSPECTION_API);
  const headers = Object.assign({}, req.headers, { host: target.host });
  const preq = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method: req.method,
      headers: headers,
    },
    function (pres) {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    }
  );
  preq.on("error", function () {
    if (res.headersSent) return;
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Inspection service is not running." }));
  });
  req.pipe(preq);
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname || "/");

  if (isInspectionApi(pathname)) {
    proxyInspection(req, res);
    return;
  }

  if (pathname === "/favicon.ico") {
    pathname = "/assets/custom/favicon.svg";
  }


    // Redirect removed legacy pages to root
  const cleanPath = pathname.replace(/\/+$/, "");
  if (["/blogs", "/about", "/case-studies"].includes(cleanPath)) {
    res.writeHead(301, { Location: "/" });
    res.end();
    return;
  }

  // Prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(ROOT, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".html")) {
    filePath = filePath + ".html";
  } else if (!fs.existsSync(filePath) && fs.existsSync(path.join(filePath, "index.html"))) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const rel = safePath.replace(/^[/\\]+/, "");
    const fromInspection = path.resolve(INSPECTION_DIST, rel);
    const inspectionRoot = path.resolve(INSPECTION_DIST);
    const insideInspection =
      fromInspection === inspectionRoot ||
      fromInspection.startsWith(inspectionRoot + path.sep);
    if (
      insideInspection &&
      fs.existsSync(fromInspection) &&
      fs.statSync(fromInspection).isFile()
    ) {
      filePath = fromInspection;
    } else if (
      INSPECTION_ROUTES.some(function (route) {
        return cleanPath === route || cleanPath.startsWith(route + "/");
      })
    ) {
      filePath = path.join(INSPECTION_DIST, "index.html");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  // Support HTTP Range requests for smooth video playback
  const stat = fs.statSync(filePath);
  if ((ext === ".mp4" || ext === ".webm") && req.headers.range) {
    const range = req.headers.range;
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": contentType,
    });
    file.pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Asset Reliability Enterprise Platform running at http://localhost:${PORT}`);
});

