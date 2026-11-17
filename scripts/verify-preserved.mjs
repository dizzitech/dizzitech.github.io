import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root } from './build.mjs';

const sha = async file => createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
const files = ['src/js/network.js', 'src/js/cursor.js', 'src/i18n/kk.js', 'src/i18n/ru.js', 'site.config.mjs', '.github/workflows/pages.yml'];
const preservation = [];
for (const file of files) {
  const before = await sha(`versions/1.3/DiziTech-1.3/${file}`), after = await sha(file);
  assert.equal(after, before, `Unexpected change: ${file}`);
  preservation.push({ file, sha256: after, identicalTo13: true });
}
const archiveSha256 = await sha('artifacts/DiziTech-1.3.zip');
assert.equal(archiveSha256, 'fa1e447cba4d7d96771b14ce8c6510052c21f2671873779ecd5ee5407c311c35');
const oldTemplate = await readFile(path.join(root, 'versions/1.3/DiziTech-1.3/src/template.html'), 'utf8');
const newTemplate = await readFile(path.join(root, 'src/template.html'), 'utf8');
for (const expression of [/<svg class="svg-definitions"[\s\S]*?<\/defs><\/svg>/, /<main id="main"[\s\S]*?<\/main>/, /<a class="brand"[\s\S]*?<\/a>/]) assert.equal(newTemplate.match(expression)?.[0], oldTemplate.match(expression)?.[0]);
const oldCss = await readFile(path.join(root, 'versions/1.3/DiziTech-1.3/src/css/styles.css'), 'utf8');
const newCss = await readFile(path.join(root, 'src/css/styles.css'), 'utf8');
const canvasColors = ['ink','blue','blue-dark','surface','blue-wash'];
for (const variable of canvasColors) {
  const expression = new RegExp(`--${variable}:\\s*([^;]+);`);
  assert.equal(newCss.match(expression)?.[1], oldCss.match(expression)?.[1], `Canvas ${variable} changed`);
}
const inventory = async (directory, prefix = '') => {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`, name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await inventory(file, `${name}/`));
    else result.push({ file: name, bytes: (await readFile(path.join(root, file))).length, sha256: await sha(file) });
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
};
const before = await inventory('dist');
const release = spawnSync(process.execPath, ['scripts/build.mjs', '--release'], { cwd: root, encoding: 'utf8' });
assert.equal(release.status, 1);
for (const key of ['whatsapp', 'phone', 'email', 'siteUrl', 'githubAccount', 'githubRepository']) assert(release.stderr.includes(`${key}: required for release`));
assert.deepEqual(await inventory('dist'), before, 'Failed release modified the preview output');
const report = { version: '1.4', baselineArchive: 'artifacts/DiziTech-1.3.zip', archiveSha256, preservation, mainMarkupUnchanged: true, svgDefinitionsUnchanged: true, logoMarkupUnchanged: true, canvasColorsUnchanged: canvasColors, releasePreflight: { exitCode: release.status, stderr: release.stderr.trim(), previewUnchanged: true }, build: { files: before.length, bytes: before.reduce((sum, f) => sum + f.bytes, 0), inventory: before } };
await writeFile(path.join(root, 'reports/preservation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ unchanged: files.length, archiveSha256, releaseBlocked: true, previewUnchanged: true, buildFiles: report.build.files, buildBytes: report.build.bytes }, null, 2));
