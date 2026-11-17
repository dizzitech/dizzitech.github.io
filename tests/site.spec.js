import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { validateConfig, build } from '../scripts/build.mjs';
import { serve } from '../scripts/serve.mjs';
import config from '../site.config.mjs';
import kk from '../src/i18n/kk.js';
import ru from '../src/i18n/ru.js';

const widths = [320, 375, 390, 768, 1024, 1280, 1440, 1920];
for (const width of widths) {
  test(`responsive layout, kk + ru, ${width}px`, async ({ page }) => {
    const errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.network-stage')).toHaveClass(/ready/);
    for (const lang of ['kk', 'ru']) {
      await page.locator(`[data-language=${lang}]`).click();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1')).toBeVisible();
      const info = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bad: [...document.querySelectorAll('h1,h2,h3,.button,.service-card,.contact-details,.hero-description')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2); }).map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 70), width: el.clientWidth, scroll: el.scrollWidth })),
        tooSmall: [...document.querySelectorAll('.hero-description,.service-card p,.timeline-step p,.contact-description,.button')].filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).map(el => ({ text: el.textContent.trim().slice(0, 50), size: getComputedStyle(el).fontSize })),
        tinyCaptions: [...document.querySelectorAll('.contact-detail>p,.contact-unset,.preview-notice,.site-footer,.back-top')].filter(el => parseFloat(getComputedStyle(el).fontSize) < 13).map(el => el.className),
      }));
      expect(info.scrollWidth, JSON.stringify(info)).toBeLessThanOrEqual(width);
      expect(info.bad, JSON.stringify(info)).toEqual([]);
      expect(info.tooSmall, JSON.stringify(info)).toEqual([]);
      expect(info.tinyCaptions, JSON.stringify(info)).toEqual([]);
      const ctaPosition = await page.evaluate(() => {
        const copy = document.querySelector('.hero-copy').getBoundingClientRect();
        const cta = document.querySelector('.button-order').getBoundingClientRect();
        return { delta: Math.abs(copy.x + copy.width / 2 - cta.x - cta.width / 2), width: cta.width, height: cta.height };
      });
      expect(ctaPosition.delta).toBeLessThan(2);
      expect(ctaPosition.height).toBeGreaterThanOrEqual(58);
      await expect(page.locator('main>section')).toHaveCount(4);
      await expect(page.locator('.hero-actions .button')).toHaveText(lang === 'kk' ? kk.order : ru.order);
      await expect(page.locator('.header-actions>.button')).toBeVisible();
      for (const section of ['services', 'process', 'contacts']) {
        await page.locator(`#${section}`).scrollIntoViewIfNeeded();
        await expect(page.locator(`#${section} h2`)).toBeVisible();
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(850);
      await mkdir('reports/screenshots', { recursive: true });
      await page.screenshot({ path: `reports/screenshots/${lang}-${width}.png`, fullPage: true });
    }
    expect(errors).toEqual([]); expect(failures).toEqual([]);
  });
}

test('language dictionaries, routes, persistence, translated labels and metadata', async ({ page }) => {
  expect(Object.keys(kk).sort()).toEqual(Object.keys(ru).sort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kk');
  await page.locator('[data-language=ru]').click();
  await expect(page).toHaveURL(/\/ru\/$/);
  await expect(page).toHaveTitle(ru.title);
  await expect(page.locator('meta[name=description]')).toHaveAttribute('content', ru.description);
  expect(await page.evaluate(() => localStorage.getItem('dizitech-language'))).toBe('ru');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.locator('[data-language=kk]').click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  const untranslated = await page.locator('[data-i18n]').evaluateAll(elements => elements.filter(el => !el.textContent.trim()).map(el => el.dataset.i18n));
  expect(untranslated).toEqual([]);
  await expect(page.locator('.menu-toggle, #main-nav, header nav')).toHaveCount(0);
});

test('simplified mobile header: keyboard language switch and WhatsApp dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('header nav, .menu-toggle, header a[href="#services"], header a[href="#process"], header a[href="#contacts"]:not([data-contact-preview])')).toHaveCount(0);
  await page.locator('[data-language=ru]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.keyboard.press('Tab');
  const cta = page.locator('.header-actions>.button');
  await expect(cta).toBeFocused();
  await expect(cta).toHaveAccessibleName(ru.write);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(cta).toBeFocused();
});

test('unconfigured contacts: honest dialog, focus trap, Escape, no fake external links', async ({ page }) => {
  await page.goto('/ru/');
  expect(await page.locator('a[href^="https://wa.me"],a[href^="tel:"],a[href^="mailto:"]').count()).toBe(0);
  const trigger = page.locator('.hero-actions [data-contact-preview]');
  await trigger.click(); await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('#dialog-title')).toHaveText('Контакты скоро появятся');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement.closest('dialog') !== null)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click(); await page.getByRole('button', { name: ru.close, exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('network animates, reacts to pointer, pauses; cursor and reveal behaviors', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  await expect(page.locator('.network-stage')).toHaveClass(/ready/);
  const image = () => page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  const first = await image(); await page.waitForTimeout(250); expect(await image()).not.toBe(first);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .4);
  await expect(page.locator('.custom-cursor')).toHaveClass(/network-mode/);
  await page.locator('.motion-toggle').click();
  await expect(page.locator('.motion-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(100); const paused = await image();
  await page.waitForTimeout(250); expect(await image()).toBe(paused);
  await page.locator('.motion-toggle').click(); await page.waitForTimeout(250); expect(await image()).not.toBe(paused);
  await page.locator('.hero-actions .button').hover(); await expect(page.locator('.custom-cursor')).toHaveClass(/active/);
  await expect(page.locator('body')).toHaveClass(/cursor-enabled/);
  await page.locator('#process').scrollIntoViewIfNeeded(); await expect(page.locator('.timeline')).toHaveClass(/is-visible/);
  await expect(page.locator('.service-card')).toHaveCount(6);
});

test('reduced motion gives static network, visible content and standard cursor', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.locator('.network-stage')).toHaveClass(/ready/);
  const first = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(250);
  expect(await page.locator('canvas').evaluate(canvas => canvas.toDataURL())).toBe(first);
  await expect(page.locator('.motion-toggle')).not.toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/cursor-enabled/);
  await page.locator('#contacts').scrollIntoViewIfNeeded(); await expect(page.locator('#contacts h2')).toBeVisible();
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).scrollBehavior)).toBe('auto');
});

test('touch devices keep native pointer behavior and readable mobile canvas', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('body')).not.toHaveClass(/cursor-enabled/);
  await expect(page.locator('.network-stage')).toHaveClass(/ready/);
  await context.close();
});

test('no JavaScript: simplified header, languages, contact status and word fallback', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const page = await context.newPage(); await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('h1')).toContainText(kk.hero1);
  await expect(page.locator('.network-fallback')).toBeVisible();
  await expect(page.locator('#main-nav, .menu-toggle')).toHaveCount(0);
  await expect(page.locator('.header-actions>.button')).toBeVisible();
  await page.locator('[data-language=ru]').click(); await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page.locator('.hero-actions .button').click();
  await expect(page).toHaveURL(/#contacts$/);
  await expect(page.locator('.preview-notice strong')).toHaveText('Контакты скоро появятся');
  await context.close();
});

test('keyboard skip link and visible focus', async ({ page }) => {
  await page.goto('/'); await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused(); await expect(page.locator('.skip-link')).toBeVisible();
  await page.keyboard.press('Enter'); await expect(page.locator('#main')).toBeFocused();
  await page.locator('[data-language=ru]').focus();
  expect(await page.locator('[data-language=ru]').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
});

test('failed JavaScript download preserves simplified header and content', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route('**/js/app.js', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#main-nav, .menu-toggle')).toHaveCount(0);
  await expect(page.locator('.header-actions>.button')).toBeVisible();
  await expect(page.locator('.network-fallback')).toBeVisible();
  await page.locator('[data-language=ru]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('#main-nav, .menu-toggle')).toHaveCount(0);
});

test('automated accessibility: both languages, desktop + mobile and open dialog', async ({ page }) => {
  const results = [];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const lang of ['kk', 'ru']) {
      await page.goto(lang === 'ru' ? '/ru/' : '/');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      results.push({ width, lang, violations: result.violations });
      expect(result.violations, JSON.stringify(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.html) })))).toEqual([]);
    }
  }
  await page.locator('.hero-actions .button').click();
  const modal = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(modal.violations).toEqual([]);
  await mkdir('reports', { recursive: true }); await writeFile('reports/axe.json', JSON.stringify(results, null, 2));
});

test('release permits missing contacts, requires hosting details and validates supplied values', async () => {
  const errors = validateConfig(config, true);
  expect(errors).toEqual([]);
  expect(validateConfig({ ...config, siteUrl: '', githubAccount: '', githubRepository: '' }, true)).toHaveLength(3);
  expect(validateConfig({ ...config, whatsapp: '+0broken' })).toHaveLength(1);
  expect(validateConfig({ ...config, email: 'broken' })).toHaveLength(1);
  expect(validateConfig({ ...config, siteUrl: 'https://example.com/' })).toHaveLength(1);
  const valid = { whatsapp: '12025550100', phone: '+12025550100', email: 'test@example.invalid', siteUrl: 'https://fixture.github.io/project/', githubAccount: 'fixture', githubRepository: 'project' };
  expect(validateConfig(valid, true)).toEqual([]);
  expect(validateConfig({ ...valid, siteUrl: 'https://fixture.github.io/wrong/' }, true).join()).toContain('does not match');
  expect(validateConfig({ ...valid, siteUrl: 'https://fixture.github.io/', githubRepository: 'fixture.github.io' }, true)).toEqual([]);
});

test('configured contact wiring and project Pages subpath, isolated local fixture only', async ({ browser }) => {
  // Reserved test-only data, never copied into the deliverable or public configuration.
  const fixture = { whatsapp: '12025550100', phone: '+1 (202) 555-0100', email: 'test@example.invalid', siteUrl: 'https://fixture.invalid/dizitech/', githubAccount: 'fixture', githubRepository: 'dizitech' };
  const dir = new URL('../test-results/subpath/dizitech/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
  await build({ config: fixture, outDir: dir, release: true });
  const server = serve({ port: 4174, directory: new URL('../test-results/subpath/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  const context = await browser.newContext();
  try {
    const page = await context.newPage(); const failures = [];
    page.on('response', r => { if (r.status() >= 400) failures.push(r.url()); });
    await page.goto('http://127.0.0.1:4174/dizitech/');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', fixture.siteUrl);
    await expect(page.locator('.network-stage')).toHaveClass(/ready/);
    await expect(page.locator('a[href^="tel:"]')).toHaveAttribute('href', 'tel:+12025550100');
    await expect(page.locator('a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:test@example.invalid');
    await expect(page.locator('[data-website]')).toHaveAttribute('href', fixture.siteUrl);
    await expect(page.locator('.contact-detail')).toHaveCount(4);
    await page.locator('a[href^="tel:"]').hover();
    await expect(page.locator('a[href^="tel:"]')).toHaveCSS('color', 'rgb(255, 255, 255)');
    const headerHref = await page.locator('.header-actions>[data-whatsapp]').getAttribute('href');
    expect(new URL(headerHref).pathname).toBe('/12025550100');
    await page.locator('[data-language=ru]').click();
    await expect(page).toHaveURL('http://127.0.0.1:4174/dizitech/ru/');
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `${fixture.siteUrl}ru/`);
    const href = await page.locator('.hero-actions [data-whatsapp]').getAttribute('href');
    expect(new URL(href).searchParams.get('text')).toBe(ru.whatsappMessage);
    expect(new URL(href).pathname).toBe('/12025550100');
    await page.reload(); await expect(page.locator('.network-stage')).toHaveClass(/ready/);
    expect(failures).toEqual([]);
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
});
