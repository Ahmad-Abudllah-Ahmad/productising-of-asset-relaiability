import http.server
import socketserver
import os
import urllib.parse

PORT = int(os.environ.get("PORT", 3000))
ROOT = os.path.dirname(os.path.abspath(__file__))

class FEDSHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".js": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        qs = urllib.parse.parse_qs(parsed.query)
        clean_path = urllib.parse.unquote(parsed.path)

        if clean_path.rstrip("/") == "/blogs" and "aa11f1de_page" in qs:
            p = int(qs["aa11f1de_page"][0])
            if p > 1:
                clean_path = f"/blogs/page-{p}.html"
        elif clean_path.rstrip("/") == "/case-studies" and "1c4b158d_page" in qs:
            p = int(qs["1c4b158d_page"][0])
            if p > 1:
                clean_path = f"/case-studies/page-{p}.html"

        full = os.path.normpath(os.path.join(ROOT, clean_path.lstrip("/")))
        if os.path.isdir(full):
            return os.path.join(full, "index.html")
        if not os.path.exists(full) and os.path.exists(full + ".html"):
            return full + ".html"
        return full

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), FEDSHandler) as httpd:
        print(f"FEDS Group server running at http://localhost:{PORT}")
        httpd.serve_forever()

