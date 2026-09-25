import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(process.env.SITE_DIR || "."),
  port = Number(process.env.PORT || 4173);
const prefix = "/BridgeDealAnalyzerWeb";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".pbn": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
};
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (path === prefix) {
      res.writeHead(302, { Location: prefix + "/" });
      res.end();
      return;
    }
    if (path.startsWith(prefix + "/")) path = path.slice(prefix.length);
    if (path.split("/").some((p) => p.startsWith(".") || p === "node_modules"))
      throw new Error("Private directory");
    const file = resolve(
      root,
      "." + path,
      path.endsWith("/") ? "index.html" : "",
    );
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
      throw new Error("Not found");
    const data = await readFile(file);
    // Intentionally no COOP/COEP: this reproduces ordinary GitHub Pages hosting.
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Bridge Study: http://127.0.0.1:${port}${prefix}/`),
);
