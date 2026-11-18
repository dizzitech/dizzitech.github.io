import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, build, validateConfig } from './build.mjs';
import config from '../site.config.mjs';

// The clean 1.4 commit before UI polish / Contacts 2.0.
const baselineCommit = 'a9fa80c';
const digest = value => createHash('sha256').update(value).digest('hex');
const preservation = [];
const files = ['src/js/network.js','src/js/cursor.js','src/i18n/kk.js','src/i18n/ru.js','public/assets/favicon.svg','public/assets/og-image.png'];
for (const file of files) {
  const previous = execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root });
  const current = await readFile(path.join(root, file));
  assert.equal(digest(current), digest(previous), `Unexpected presentation change: ${file}`);
  preservation.push({ file, sha256: digest(current), identicalToBaseline: true });
}
assert.deepEqual(validateConfig(config, true), []);
const beforeTemplate = execFileSync('git', ['show', `${baselineCommit}:src/template.html`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n');
const currentTemplate = (await readFile(path.join(root, 'src/template.html'), 'utf8')).replaceAll('\r\n', '\n');
const mainSections = html => html.slice(html.indexOf('    <section class="hero'), html.indexOf('    <section id="contacts"'));
assert.equal(mainSections(currentTemplate), mainSections(beforeTemplate), 'Hero, services or process markup changed');
for (const id of ['brand-mark', 'visual-landing', 'visual-business', 'visual-education', 'visual-info', 'visual-update', 'visual-support']) {
  const pattern = new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`);
  assert.equal(currentTemplate.match(pattern)?.[0], beforeTemplate.match(pattern)?.[0], `SVG changed: ${id}`);
}
const inventory = async (directory, prefix = '') => {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`, name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) result.push(...await inventory(file, `${name}/`));
    else { const bytes = await readFile(path.join(root, file)); result.push({ file: name, bytes: bytes.length, sha256: digest(bytes) }); }
  }
  return result.sort((a,b) => a.file.localeCompare(b.file));
};
const before = await inventory('docs');
await assert.rejects(() => build({ release: true, config: { ...config, siteUrl: '' }, outDir: path.join(root, 'docs') }), /siteUrl: required for release/);
assert.deepEqual(await inventory('docs'), before, 'Invalid hosting settings modified docs');
for (const item of before.filter(item => /^(css|js|i18n)\//.test(item.file))) assert.equal(item.sha256, digest(await readFile(path.join(root, 'src', item.file))));
const report = { baselineCommit, preservation, optionalContacts: true, releaseValidationPassed: true, invalidHostingCannotModifyOutput: true, build: { directory: 'docs', files: before.length, bytes: before.reduce((sum,item) => sum + item.bytes, 0), inventory: before } };
await writeFile(path.join(root, 'reports/preservation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ unchangedPresentationFiles: preservation.length, buildFiles: before.length, buildBytes: report.build.bytes, optionalContacts: true }));
