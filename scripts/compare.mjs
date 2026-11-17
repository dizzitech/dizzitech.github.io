import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serve } from './serve.mjs';
import { root } from './build.mjs';

const destination = path.join(root, 'reports/comparison');
await mkdir(destination, { recursive: true });
const widths = [320, 375, 390, 768, 1024, 1280, 1440, 1920];
const browser = await chromium.launch({ channel: 'chrome' });
const metrics = {};
try {
  for (const [version, directory] of [['1.3', 'versions/1.3/DiziTech-1.3/dist'], ['1.4', 'dist']]) {
    const server = serve({ port: 0, directory: path.join(root, directory) });
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    metrics[version] = {};
    try {
      for (const width of widths) {
        metrics[version][width] = {};
        for (const lang of ['kk', 'ru']) {
          const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:${server.address().port}/${lang === 'ru' ? 'ru/' : ''}`);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForSelector('.network-stage.ready');
          const measurement = await page.evaluate(() => {
            const font = selector => {
              const el = document.querySelector(selector); if (!el) return null; const css = getComputedStyle(el);
              return { family: css.fontFamily, weight: css.fontWeight, size: parseFloat(css.fontSize), lineHeight: parseFloat(css.lineHeight), height: Math.round(el.getBoundingClientRect().height) };
            };
            const sections = [...document.querySelectorAll('main>section')].map(el => {
              const css = getComputedStyle(el);
              return { id: el.id || 'hero', height: Math.round(el.getBoundingClientRect().height), paddingTop: parseFloat(css.paddingTop), paddingBottom: parseFloat(css.paddingBottom) };
            });
            return { height: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth,
              fonts: Object.fromEntries(['h1','h2','.hero-description','.service-card h3','.service-card p','.principle summary','.principle>p','.timeline-step p','.pricing-content>p','.hero-actions .button','.main-nav a','.contact-unset','.preview-notice p'].map(selector => [selector, font(selector)])), sections,
              sectionPadding: sections.reduce((total, s) => total + s.paddingTop + s.paddingBottom, 0),
              palette: Object.fromEntries(['--text','--caption','--bg','--ink','--muted','--pale','--blue','--blue-dark','--navy','--on-navy','--on-navy-muted','--heading','--accent-light','--accent'].map(name => [name, getComputedStyle(document.documentElement).getPropertyValue(name).trim()])),
            };
          });
          metrics[version][width][lang] = measurement;
          if ([390, 1440].includes(width)) {
            await page.screenshot({ path: path.join(destination, `${version}-${lang}-${width}-full.png`), fullPage: true });
            await page.locator('.hero').screenshot({ path: path.join(destination, `${version}-${lang}-${width}-hero.png`) });
          }
          if ([390, 1440].includes(width)) {
            // Keep the entire services section inside the viewport for an unclipped crop.
            await page.setViewportSize({ width, height: 4000 });
            await page.evaluate(() => scrollTo(0, 0));
            await page.locator('#services').screenshot({ path: path.join(destination, `${version}-${lang}-${width}-services.png`) });
          }
          await context.close();
        }
      }
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
} finally { await browser.close(); }
await writeFile(path.join(destination, 'metrics.json'), JSON.stringify(metrics, null, 2));

const luminance = hex => {
  let value = hex.replace('#', '');
  if (value.length === 3) value = [...value].map(channel => channel + channel).join('');
  return value.match(/.{2}/g).map(channel => parseInt(channel, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
};
const palette = metrics['1.4'][1440].kk.palette;
const contrast = [['Основной текст / фон','--text','--bg'], ['Заголовки / фон','--heading','--bg'], ['Вторичный текст / фон','--muted','--bg'], ['Дополнительные подписи / фон','--caption','--bg'], ['Вторичный текст / hover','--muted','--pale'], ['Ссылки / белый','--blue','#ffffff'], ['Белый текст CTA / синий','#ffffff','--blue'], ['Подписи сети / белый','--blue-dark','#ffffff'], ['Белый текст / navy','--on-navy','--navy'], ['Почти белый текст / navy','--on-navy-muted','--navy']].map(([name, a, b]) => {
  const foreground = palette[a] || a, background = palette[b] || b;
  const l1 = luminance(foreground), l2 = luminance(background);
  return { name, foreground, background, ratio: Number(((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05)).toFixed(2)) };
});
await writeFile(path.join(destination, 'contrast.json'), JSON.stringify(contrast, null, 2));
const rows = widths.flatMap(width => ['kk', 'ru'].map(lang => {
  const before = metrics['1.3'][width][lang], after = metrics['1.4'][width][lang];
  return { width, lang, before: before.height, after: after.height, heightChange: Number(((after.height / before.height - 1) * 100).toFixed(1)), paddingChange: Number(((after.sectionPadding / before.sectionPadding - 1) * 100).toFixed(1)) };
}));
const imagePairs = [1440, 390].flatMap(width => ['kk', 'ru'].map(lang => `<section><h2>${width} px / ${lang}</h2><div class="pair">${['1.3', '1.4'].map(v => `<figure><figcaption>DiziTech ${v}</figcaption><a href="${v}-${lang}-${width}-full.png"><img src="${v}-${lang}-${width}-hero.png" alt="DiziTech ${v}, ${width} px, ${lang}"></a><a href="${v}-${lang}-${width}-full.png">Полная страница ↗</a><img src="${v}-${lang}-${width}-services.png" alt="Услуги ${v}, ${lang}"></figure>`).join('')}</div></section>`));
await writeFile(path.join(destination, 'index.html'), `<!doctype html><html lang="ru"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DiziTech 1.2 → 1.3 — сравнение</title><style>body{margin:0;background:#f7f9ff;color:#102647;font:16px/1.6 system-ui}main{max-width:1440px;margin:auto;padding:32px}h1{font-size:clamp(28px,4vw,44px)}h2{margin-top:42px}a{color:#1644b5}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:10px;text-align:left;border-bottom:1px solid #d5e0f0}.table{overflow:auto}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}figure{margin:0}figcaption{font-size:20px;font-weight:650;margin-bottom:14px}img{width:100%;border:1px solid #d5e0f0}p{max-width:850px}@media(max-width:700px){main{padding:18px}.pair{gap:12px}}</style><main><h1>DiziTech 1.2 → 1.3</h1><p>Одинаковые размеры viewport, язык и reduced motion. Нажмите на изображение, чтобы открыть полную страницу. Размеры измерены реальным Chrome; уменьшение отступов и изменение полной высоты указаны раздельно.</p><div class="table"><table><thead><tr><th>Ширина</th><th>Язык</th><th>Высота 1.2</th><th>Высота 1.3</th><th>Изменение высоты</th><th>Отступы секций</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.width}</td><td>${row.lang}</td><td>${row.before} px</td><td>${row.after} px</td><td>${row.heightChange}%</td><td>${row.paddingChange}%</td></tr>`).join('')}</tbody></table></div>${imagePairs.join('')}<h2>Контраст палитры 1.3</h2><table><tr><th>Пара</th><th>Отношение</th><th>AA обычный текст</th></tr>${contrast.map(c => `<tr><td>${c.name}</td><td>${c.ratio}:1</td><td>${c.ratio >= 4.5 ? 'Да' : 'Нет'}</td></tr>`).join('')}</table></main></html>`);
console.log(JSON.stringify({ rows, contrast }, null, 2));
