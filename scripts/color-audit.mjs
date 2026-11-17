import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serve } from './serve.mjs';
import { root } from './build.mjs';

const selectors = ['body', '.brand', '.main-nav a', '.language-switch a', 'h1', '.text-accent', '.hero-description', '.hero-actions .button', '.network-caption', '.network-caption>span', '.network-stage', '.network-hint', '#services h2', '.service-card', '.service-card h3', '.service-card p', '.service-art', '.service-icon', '#process h2', '.step-number', '.timeline-step h3', '.timeline-step p', '#contacts', '#contacts h2', '.contact-description', '.contact-detail>p', '.contact-unset', '.preview-notice', '.site-footer', 'dialog', '.dialog-content h2'];
selectors.push('.service-art use', '.art-accent', '.art-fill', '.art-accent-fill', '.art-rule');
const properties = ['color', 'background-color', 'background-image', 'opacity', 'filter', 'backdrop-filter', 'mix-blend-mode', 'fill', 'stroke', 'border-color', 'font-size'];
const report = {};
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [version, directory] of [['1.3', 'versions/1.3/DiziTech-1.3/dist'], ['1.4', 'dist']]) {
    const server = serve({ port: 0, directory: path.join(root, directory) });
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    report[version] = { states: {} };
    try {
      const css = await readFile(path.join(root, directory, 'css/styles.css'), 'utf8');
      report[version].source = {
        variables: [...css.matchAll(/(--[\w-]+)\s*:\s*([^;\n}]+)/g)].map(m => ({ name: m[1], value: m[2].trim() })),
        hex: [...new Set(css.match(/#[\da-f]{3,8}\b/gi))],
        rgba: [...new Set(css.match(/rgba?\([^)]+\)/g))],
        gradients: [...new Set(css.match(/(?:radial|linear|conic)-gradient\([^;]+/g))],
        effects: css.split('\n').filter(line => /(?:opacity|filter|mix-blend-mode|:hover)/.test(line)),
      };
      for (const width of [390, 1440]) for (const lang of ['kk', 'ru']) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/${lang === 'ru' ? 'ru/' : ''}`);
        await page.evaluate(() => document.fonts.ready);
        const sample = () => page.evaluate(({ selectors, properties }) => {
          const style = el => Object.fromEntries(properties.map(name => [name, getComputedStyle(el).getPropertyValue(name)]));
          return {
            elements: Object.fromEntries(selectors.map(selector => {
              const el = document.querySelector(selector);
              if (!el) return [selector, null];
              const ancestry = []; let node = el;
              while (node) { const c = getComputedStyle(node); ancestry.push({ tag: node.tagName, class: node.className?.baseVal ?? node.className, opacity: c.opacity, filter: c.filter, backdropFilter: c.backdropFilter, mixBlendMode: c.mixBlendMode }); node = node.parentElement; }
              return [selector, { ...style(el), ancestry }];
            })),
            nonDefaultFilters: [...document.querySelectorAll('body *')].filter(el => {
              const c = getComputedStyle(el); return c.filter !== 'none' || c.backdropFilter !== 'none' || c.mixBlendMode !== 'normal';
            }).map(el => ({ tag: el.tagName, class: el.className?.baseVal ?? el.className, ...style(el) })),
          };
        }, { selectors, properties });
        const data = { normal: await sample() };
        await page.locator('.service-card').first().hover();
        data.cardHover = await page.locator('.service-card').first().evaluate(el => { const c = getComputedStyle(el); return { color: c.color, background: c.backgroundColor, border: c.borderColor, shadow: c.boxShadow }; });
        await page.locator('.button-order').hover();
        data.buttonHover = await page.locator('.button-order').evaluate(el => { const c = getComputedStyle(el); return { color: c.color, background: c.backgroundColor }; });
        await page.locator('.button-order').click();
        data.dialog = await sample();
        report[version].states[`${width}-${lang}`] = data;
        await context.close();
      }
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
} finally { await browser.close(); }
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/color-audit.json'), JSON.stringify(report, null, 2));
console.log('Saved computed styles, ancestor effects, SVG colors, gradients and hover states: reports/color-audit.json');
