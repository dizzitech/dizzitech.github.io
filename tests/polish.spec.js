import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('1.4 retains 1.3 text sizes and exact page height with a simplified header', async ({ page }) => {
  const baseline = JSON.parse(await readFile(new URL('./fixtures/v1.3-layout.json', import.meta.url), 'utf8'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 375, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const lang of ['kk', 'ru']) {
      await page.goto(lang === 'ru' ? '/ru/' : '/');
      await page.evaluate(() => document.fonts.ready);
      const before = baseline[width][lang];
      const current = await page.evaluate(selectors => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
        header: ['.brand', '.language-switch', '.header-actions>.button'].map(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; }),
        fonts: Object.fromEntries(selectors.map(selector => [selector, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])),
        cards: [...document.querySelectorAll('.service-card')].map(card => {
          const [art, title, text] = ['.service-art', 'h3', 'p'].map(s => card.querySelector(s).getBoundingClientRect());
          const box = card.getBoundingClientRect();
          return { artWidth: art.width, contained: art.left >= box.left && art.right <= title.left && art.bottom <= text.top + 1 && art.top >= box.top && text.bottom <= box.bottom };
        }),
      }), ['h1','h2','.hero-description','.service-card h3','.service-card p','.timeline-step p','.hero-actions .button','.contact-unset']);
      expect(current.height, `${width}/${lang} unchanged height`).toBe(before.height);
      expect(current.width).toBe(width);
      for (const [selector, size] of Object.entries(current.fonts)) expect(size, `${width}/${lang} ${selector}`).toBe(before.fonts[selector].size);
      await expect(page.locator('header nav, .menu-toggle, header a[href="#services"], header a[href="#process"]')).toHaveCount(0);
      await expect(page.locator('.header-inner a')).toHaveCount(4);
      expect(current.header.every(b => b.x >= 0 && b.right <= width)).toBe(true);
      if (width >= 768) expect(Math.max(...current.header.map(b => b.y)) - Math.min(...current.header.map(b => b.y))).toBeLessThan(8);
      expect(current.cards.every(card => card.contained && card.artWidth >= 60), JSON.stringify(current.cards)).toBe(true);
    }
  }
});

test('explicit text palette has no page filters or text opacity, and all six SVG scenes render', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const lang of ['kk','ru']) {
    await page.goto(lang === 'ru' ? '/ru/' : '/');
    const colors = { body: 'rgb(17, 17, 17)', '#services h2': 'rgb(11, 15, 25)', '.service-card h3': 'rgb(11, 15, 25)', '.service-card p': 'rgb(36, 36, 36)', '.timeline-step p': 'rgb(36, 36, 36)', '.step-number': 'rgb(51, 51, 51)', '.network-hint': 'rgb(51, 51, 51)', '.text-accent': 'rgb(255, 255, 255)', '.hero-description': 'rgb(255, 255, 255)', '#contacts h2': 'rgb(255, 255, 255)', '.contact-unset': 'rgb(255, 255, 255)', '.header-actions>.button': 'rgb(21, 94, 239)' };
    for (const [selector, color] of Object.entries(colors)) {
      await expect(page.locator(selector).first()).toHaveCSS('color', color);
      expect(await page.locator(selector).first().evaluate(el => { while (el) { const c = getComputedStyle(el); if (c.opacity !== '1' || c.filter !== 'none' || c.backdropFilter !== 'none' || c.mixBlendMode !== 'normal') return false; el = el.parentElement; } return true; })).toBe(true);
    }
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 250, 255)');
    await expect(page.locator('.service-art')).toHaveCount(6);
    const scenes = await page.locator('.service-art').evaluateAll(arts => arts.map(art => {
      const target = document.querySelector(art.querySelector('use').getAttribute('href'));
      return { name: art.dataset.serviceVisual, parts: target?.querySelectorAll('rect,path').length || 0, box: art.getBBox().width, decorative: art.getAttribute('aria-hidden') };
    }));
    expect(new Set(scenes.map(s => s.name)).size).toBe(6);
    expect(scenes.every(s => s.parts >= 6 && s.box > 90 && s.decorative === 'true')).toBe(true);
    await page.locator('.service-card').first().hover();
    await expect(page.locator('.service-card').first()).toHaveCSS('border-color', 'rgb(21, 94, 239)');
    await page.locator('.button-order').hover();
    await expect(page.locator('.button-order')).toHaveCSS('background-color', 'rgb(16, 72, 197)');
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.service-card').first().hover();
  await expect(page.locator('.service-art').first()).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -2)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.service-art').first()).toHaveCSS('transform', 'none');
});
