// Verify the exact static output locally, or the published origin without changing it.
import { chromium } from 'playwright';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { serve } from './serve.mjs';
import { root } from './build.mjs';
import kk from '../src/i18n/kk.js';
import ru from '../src/i18n/ru.js';
import config from '../site.config.mjs';
import { normalizeWhatsApp } from '../src/js/contacts.js';

const remote = process.argv.includes('--url');
let server;
if (!remote) {
  server = serve({ port: 0, directory: path.join(root, 'docs') });
  await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
}
const base = remote ? process.argv[process.argv.indexOf('--url') + 1] : `http://127.0.0.1:${server.address().port}/`;
assert(base?.endsWith('/'), 'Use a full site URL with a trailing slash');
const destination = path.join(root, remote ? 'artifacts/pages-live' : 'reports/pages-local');
await mkdir(destination, { recursive: true });
const report = { origin: base, staticFiles: [], layouts: [], interactions: [], failures: [] };
const browser = await chromium.launch({ channel: 'chrome' });
const sha = data => createHash('sha256').update(data).digest('hex');
try {
  const inventory = await readdir(path.join(root, 'docs'), { recursive: true, withFileTypes: true });
  for (const entry of inventory.filter(entry => entry.isFile())) {
    const file = path.relative(path.join(root, 'docs'), path.join(entry.parentPath, entry.name)).replaceAll('\\', '/');
    if (file === '.nojekyll') continue; // Build marker, not a browser resource.
    const url = new URL(file, base);
    if (remote) url.searchParams.set('verify', String(Date.now()));
    const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, 200, file);
    const hash = sha(Buffer.from(await response.arrayBuffer()));
    assert.equal(hash, sha(await readFile(path.join(root, 'docs', file))), `Deployed bytes differ: ${file}`);
    report.staticFiles.push({ file, sha256: hash });
  }
  for (const width of [320,375,390,768,1024,1280,1440,1920]) for (const lang of ['kk','ru']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => report.failures.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.failures.push(`${response.status()} ${response.url()}`); });
    const response = await page.goto(new URL(lang === 'ru' ? 'ru/' : './', base).href);
    assert.equal(response.status(), 200);
    await page.waitForSelector('.network-stage.ready');
    await page.evaluate(() => document.fonts.ready);
    const d = lang === 'kk' ? kk : ru;
    assert.equal(await page.locator('html').getAttribute('lang'), lang);
    assert.equal(await page.title(), d.title);
    assert.equal(await page.locator('main>section').count(), 4);
    assert.equal(await page.locator('.service-art').count(), 6);
    assert.equal(await page.locator('header nav,.menu-toggle').count(), 0);
    assert.equal(await page.locator('.contact-phone').count(), [config.whatsapp, config.whatsappSecondary].filter(normalizeWhatsApp).length);
    assert.equal(await page.locator('.contact-cta, a a').count(), 0);
    if (config.email) assert.equal(await page.locator('a[href^="mailto:"]').getAttribute('href'), `mailto:${config.email}`);
    if (config.siteUrl) assert.equal(await page.locator('[data-website]').getAttribute('href'), config.siteUrl);
    for (const link of await page.locator('[data-whatsapp]').all()) {
      const key = await link.getAttribute('data-whatsapp');
      const href = new URL(await link.getAttribute('href'));
      assert.equal(href.origin, 'https://wa.me');
      assert.equal(href.pathname, `/${normalizeWhatsApp(key === 'secondary' ? config.whatsappSecondary : config.whatsapp)}`);
      assert.equal(href.searchParams.get('text'), d.whatsappMessage);
    }
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'index, follow');
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), `https://dizzitech.github.io/${lang === 'ru' ? 'ru/' : ''}`);
    const layout = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
      overflow: [...document.querySelectorAll('h1,h2,h3,.button,.service-card,.header-inner')].filter(el => { const b = el.getBoundingClientRect(); return b.left < -1 || b.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2; }).map(el => el.className),
    }));
    assert.equal(layout.scrollWidth, width); assert.deepEqual(layout.overflow, []);
    for (const id of ['services','process','contacts']) await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    if (!normalizeWhatsApp(config.whatsapp) && !normalizeWhatsApp(config.whatsappSecondary)) {
      await page.locator('.header-actions>.button').click();
      await page.locator('dialog[open]').waitFor();
      assert.equal(await page.locator('#dialog-title').innerText(), d.dialogTitle);
      await page.keyboard.press('Escape');
    }
    const opposite = lang === 'kk' ? 'ru' : 'kk';
    await page.locator(`[data-language=${opposite}]`).click();
    assert.equal(await page.locator('html').getAttribute('lang'), opposite);
    assert.equal(new URL(page.url()).pathname, opposite === 'ru' ? '/ru/' : '/');
    await page.locator(`[data-language=${lang}]`).click();
    await page.evaluate(() => scrollTo(0, 0));
    if ([390,1440].includes(width)) await page.screenshot({ path: path.join(destination, `${lang}-${width}.png`), fullPage: true });
    report.layouts.push({ lang, ...layout });
    await context.close();
  }
  for (const lang of ['kk','ru']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(new URL(lang === 'ru' ? 'ru/' : './', base).href);
    await page.waitForSelector('.network-stage.ready');
    const image = () => page.locator('canvas').evaluate(canvas => canvas.toDataURL());
    const first = await image(); await page.waitForTimeout(260); assert.notEqual(await image(), first, 'Canvas auto');
    const b = await page.locator('canvas').boundingBox();
    await page.mouse.move(b.x + b.width * .5, b.y + b.height * .5);
    await page.waitForFunction(() => document.querySelector('.custom-cursor').classList.contains('network-mode'));
    await page.mouse.down(); await page.mouse.move(b.x + b.width * .7, b.y + b.height * .65, { steps: 8 });
    assert((await page.locator('.network-stage').getAttribute('class')).includes('is-dragging'));
    await page.mouse.up();
    assert(!(await page.locator('.network-stage').getAttribute('class')).includes('is-dragging'));
    await page.locator('.motion-toggle').click(); await page.waitForTimeout(100);
    const paused = await image(); await page.waitForTimeout(260); assert.equal(await image(), paused, 'Canvas pause');
    await page.locator('.button-order').hover();
    await page.waitForFunction(() => document.querySelector('.custom-cursor').classList.contains('active'));
    await page.locator('#process').scrollIntoViewIfNeeded();
    await page.waitForSelector('.timeline.is-visible');
    await page.locator('.service-card').first().hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.service-art')).transform === 'matrix(1, 0, 0, 1, 0, -2)');
    report.interactions.push({ lang, canvasAuto: true, drag: true, pause: true, cursor: true, reveals: true, hover: true });
    await context.close();
  }
  assert.deepEqual(report.failures, []);
  report.passed = true;
  await writeFile(path.join(destination, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ origin: base, verifiedFiles: report.staticFiles.length, layouts: report.layouts.length, interactiveLanguages: report.interactions.length, passed: true }));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
