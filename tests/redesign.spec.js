import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

test('desktop is at least 45 percent shorter than the measured 1.1 baseline', async ({ page }) => {
  const baseline = JSON.parse(await readFile(new URL('./fixtures/v1.1-heights.json', import.meta.url), 'utf8'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const lang of ['kk', 'ru']) {
      await page.goto(lang === 'ru' ? '/ru/' : '/');
      await page.evaluate(() => document.fonts.ready);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(height, `${width}px / ${lang}`).toBeLessThanOrEqual(baseline[width][lang] * .55);
      await expect(page.locator('main>section')).toHaveCount(4);
    }
  }
});

test('Kazakh, Russian and Latin glyphs actually render in the local Golos font', async ({ page, context }) => {
  await page.goto('/');
  const samples = { kk: 'ӘәҒғҚқҢңӨөҰұҮүҺһІі', ru: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' };
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const result = {};
  for (const [lang, text] of Object.entries(samples)) {
    await page.evaluate(async text => {
      document.querySelector('#glyph-probe')?.remove();
      const el = document.createElement('p'); el.id = 'glyph-probe'; el.textContent = text;
      el.style.cssText = "font-family:'Golos Text';font-size:20px;font-weight:400;position:fixed;left:0;top:150px;background:white;color:black;z-index:1000";
      document.body.append(el); await document.fonts.ready;
    }, text);
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#glyph-probe' });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(fonts.every(font => font.isCustomFont && /Golos/i.test(font.familyName)), JSON.stringify(fonts)).toBe(true);
    expect(fonts.reduce((sum, font) => sum + font.glyphCount, 0)).toBe(text.length);
    result[lang] = { text, fonts };
  }
  await page.locator('#glyph-probe').evaluate(el => el.remove());
  await mkdir('reports', { recursive: true }); await writeFile('reports/font-coverage.json', JSON.stringify(result, null, 2));
});

test('order and header keep localized labels; compact contacts replace the final CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.button-order')).toHaveText('Тапсырыс беру');
  await expect(page.locator('.header-actions>.button')).toHaveText('WhatsApp-қа жазу');
  await expect(page.locator('.contact-cta')).toHaveCount(0);
  await expect(page.locator('#contacts h2')).toHaveText('Байланыс');
  await expect(page.locator('.contact-detail')).toHaveCount(3);
  await expect(page.locator('[data-website]')).toHaveAttribute('href', 'https://dizzitech.github.io/');
  await page.locator('[data-language=ru]').click();
  await expect(page.locator('.button-order')).toHaveText('Заказать сайт');
  await expect(page.locator('.header-actions>.button')).toHaveText('Написать в WhatsApp');
  await expect(page.locator('#contacts h2')).toHaveText('Контакты');
  await expect(page.locator('#contacts')).toContainText('Адрес сайта');
});
