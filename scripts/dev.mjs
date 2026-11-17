import { watch } from 'node:fs';
import path from 'node:path';
import { build, root } from './build.mjs';
import { serve } from './serve.mjs';

await build();
const server = serve();
let timer, building = false, pending = false;
async function rebuild() {
  if (building) { pending = true; return; }
  building = true;
  try { await build(); console.log('Updated. Refresh the browser to see changes.'); } catch (error) { console.error(error.message); }
  building = false;
  if (pending) { pending = false; await rebuild(); }
}
const watchers = ['src', 'public', 'site.config.mjs'].map(entry => watch(path.join(root, entry), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); }));
process.on('SIGINT', () => { clearTimeout(timer); watchers.forEach(watcher => watcher.close()); server.close(); });
