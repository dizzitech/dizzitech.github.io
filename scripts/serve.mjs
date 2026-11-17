import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './build.mjs';

export function serve({ port = Number(process.env.PORT) || 4173, directory = path.join(root, 'dist') } = {}) {
  directory = path.resolve(directory);
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const target = path.resolve(directory, `.${pathname}`);
      if (target !== directory && !target.startsWith(directory + path.sep)) { response.writeHead(403); response.end(); return; }
      const info = await stat(target);
      if (info.isDirectory() && !pathname.endsWith('/')) { response.writeHead(301, { Location: `${pathname}/` }); response.end(); return; }
      const filename = info.isDirectory() ? path.join(target, 'index.html') : target;
      const buffer = await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(buffer);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      try { response.end(await readFile(path.join(directory, '404.html'))); } catch { response.end('404'); }
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}/`));
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
