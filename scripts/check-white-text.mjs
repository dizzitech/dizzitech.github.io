import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const before = process.argv.includes('--before');
const browser = await chromium.launch({ channel: 'chrome' });
const report = { states: {}, hashes: {} };
const digest = text => createHash('sha256').update(text).digest('hex');
report.css = await readFile('src/css/styles.css', 'utf8');
for (const file of ['src/template.html', 'src/js/app.js', 'src/js/network.js', 'src/js/cursor.js', 'src/i18n/kk.js', 'src/i18n/ru.js', 'site.config.mjs']) report.hashes[file] = digest(await readFile(file));
try {
  for (const width of [390, 1440]) for (const lang of ['kk', 'ru']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:4173/${lang === 'ru' ? 'ru/' : ''}`);
    await page.evaluate(() => document.fonts.ready);
    for (const selector of ['.hero-copy', '#contacts']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForFunction(selector => [...document.querySelectorAll(`${selector}, ${selector} *`)].every(el => {
        const c = getComputedStyle(el); return c.opacity === '1';
      }), selector);
    }
    const data = await page.evaluate(() => {
      const inspect = el => {
        let opacity = 1; const effects = [];
        for (let parent = el; parent; parent = parent.parentElement) {
          const c = getComputedStyle(parent); opacity *= Number(c.opacity);
          if (c.filter !== 'none' || c.backdropFilter !== 'none' || c.mixBlendMode !== 'normal') effects.push(parent.tagName);
        }
        const c = getComputedStyle(el);
        return { color: c.color, opacity, effects, font: c.font, text: el.textContent.trim() };
      };
      const textElements = new Set();
      for (const surface of document.querySelectorAll('.hero-copy, #contacts, .button-primary')) {
        const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) if (walker.currentNode.textContent.trim()) textElements.add(walker.currentNode.parentElement);
      }
      return {
        white: [...textElements].map(inspect),
        light: Object.fromEntries(['body','#services h2','.service-card h3','.service-card p','#process h2','.timeline-step p','.step-number','.network-hint','.brand','.header-actions>.button'].map(s => [s, inspect(document.querySelector(s))])),
        layout: { height: document.documentElement.scrollHeight, sections: [...document.querySelectorAll('main>section')].map(el => el.getBoundingClientRect().height) },
        pseudoText: [...document.querySelectorAll('.hero-copy *, #contacts *, .button-primary')].flatMap(el => ['::before','::after'].map(pseudo => {
          const c = getComputedStyle(el, pseudo); return { content: c.content, color: c.color, opacity: c.opacity };
        })).filter(p => !['none','normal','""'].includes(p.content)),
      };
    });
    data.buttons = [];
    for (const selector of ['.button-order','.contact-cta']) for (const state of ['hover','focus']) {
      if (state === 'hover') await page.locator(selector).hover(); else await page.locator(selector).focus();
      data.buttons.push(await page.locator(selector).evaluate((el, state) => {
        const c = getComputedStyle(el); let opacity = 1;
        for (let parent = el; parent; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
        return { state, color: c.color, background: c.backgroundColor, opacity };
      }, state));
    }
    if (!before) {
      for (const text of data.white) { assert.equal(text.color, 'rgb(255, 255, 255)', text.text); assert.equal(text.opacity, 1, text.text); assert.deepEqual(text.effects, []); }
      for (const button of data.buttons) { assert.equal(button.color, 'rgb(255, 255, 255)'); assert.equal(button.opacity, 1); }
      for (const pseudo of data.pseudoText) { assert.equal(pseudo.color, 'rgb(255, 255, 255)'); assert.equal(pseudo.opacity, '1'); }
    }
    report.states[`${width}-${lang}`] = data;
    await context.close();
  }
} finally { await browser.close(); }
if (!before) {
  const original = JSON.parse(await readFile('reports/white-text-before.json', 'utf8'));
  assert.deepEqual(report.hashes, original.hashes, 'Unrelated source file changed');
  assert.equal(report.css, original.css.replace('--on-navy-muted: #f5f5f5', '--on-navy-muted: #ffffff'), 'Unexpected stylesheet change');
  for (const [key, data] of Object.entries(report.states)) {
    assert.deepEqual(data.light, original.states[key].light, `${key}: light text changed`);
    assert.deepEqual(data.layout, original.states[key].layout, `${key}: layout changed`);
  }
  report.onlyWhiteVariableChanged = true;
}
await writeFile(`reports/white-text-${before ? 'before' : 'after'}.json`, JSON.stringify(report, null, 2));
console.log(`${before ? 'Baseline saved' : 'Verified pure white, ancestor opacity, hover/focus, unchanged light text, layout and source hashes'}: 390/1440 px, kk/ru`);
