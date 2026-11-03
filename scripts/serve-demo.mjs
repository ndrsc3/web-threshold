// Serves the built demo in .demo/ on a free localhost port, for the browser scripts.
// localhost is a secure context in every engine, which crypto.subtle needs.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json" };

/** Exits with a hint if the demo isn't built. Returns the base URL and the server, to close. */
export async function serveDemo() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", ".demo");
  if (!existsSync(join(root, "s/site.json"))) {
    console.error("No built demo in .demo/. Run `npm run build && npm run demo:build` first.");
    process.exit(1);
  }
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { base: `http://localhost:${server.address().port}`, server };
}
