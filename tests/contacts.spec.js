import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { build, validateConfig } from '../scripts/build.mjs';
import { serve } from '../scripts/serve.mjs';
import { normalizeWhatsApp, whatsappUrl } from '../src/js/contacts.js';
import config from '../site.config.mjs';
import kk from '../src/i18n/kk.js';
import ru from '../src/i18n/ru.js';

const widths = [320, 375, 390, 768, 1024, 1280, 1440, 1920];
// The user's formatting examples are isolated local fixtures. No WhatsApp requests leave the browser.
const fixture = { ...config, whatsapp: '8 775 398 00 88', whatsappSecondary: '+7 (747) 283-15-45' };
let server;
test.beforeAll(async () => {
  const directory = new URL('../test-results/two-contacts/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
  await build({ config: fixture, outDir: directory });
  server = serve({ port: 4177, directory });
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('normalizes supported formats, rejects invalid values and validates both config fields', () => {
  for (const input of ['+77472831545', '77472831545', '8 747 283 15 45', '+7 (747) 283-15-45']) {
    expect(normalizeWhatsApp(input)).toBe('77472831545');
    expect(validateConfig({ ...config, whatsapp: input, whatsappSecondary: input })).toEqual([]);
    expect(new URL(whatsappUrl(input, ru.whatsappMessage)).searchParams.get('text')).toBe(ru.whatsappMessage);
  }
  for (const input of ['', ' ', null, undefined, '+0broken', '7', '7472831545', '++77472831545', '0000000', '1234567890123456']) {
    expect(normalizeWhatsApp(input)).toBe('');
    expect(whatsappUrl(input, 'message')).toBe('');
  }
  expect(normalizeWhatsApp('+1 (202) 555-0100')).toBe('12025550100');
  expect(validateConfig({ ...config, whatsappSecondary: '+0broken' })).toHaveLength(1);
});

test('two phone rows fit all eight widths in both languages, with accessible icons and no errors', async ({ page }) => {
  const failures = [];
  page.on('pageerror', e => failures.push(e.message));
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('http://127.0.0.1:4177/');
    for (const [lang, d] of Object.entries({ kk, ru })) {
      await page.locator(`[data-language=${lang}]`).click();
      await expect(page.locator('#contacts h2')).toHaveText(d.contacts);
      await expect(page.locator('#contacts h2')).toHaveCount(1);
      await expect(page.locator('.contact-phone')).toHaveCount(2);
      expect(await page.locator('.contact-details>.contact-detail').evaluateAll(elements => elements.map(el =>
        el.querySelector('[data-website]') ? 'site' : el.querySelector('[href^="mailto:"]') ? 'email' : 'phones'
      ))).toEqual(['site', 'email', 'phones']);
      await expect(page.locator('.button-whatsapp')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(page.locator('.button-whatsapp')).toHaveCSS('border-color', 'rgb(20, 125, 61)');
      await expect(page.locator('.button-whatsapp')).toHaveCSS('border-width', '1px');
      await expect(page.locator('.button-whatsapp')).toHaveCSS('color', 'rgb(20, 125, 61)');
      await expect(page.locator('.button-whatsapp svg')).toHaveCSS('color', 'rgb(20, 125, 61)');
      await expect(page.locator('.contact-phone svg')).toHaveCount(4);
      await expect(page.locator('.contact-cta, .contact-unset, .preview-notice, a a')).toHaveCount(0);
      await expect(page.locator('.contact-phone').first()).toHaveAccessibleName(/\+7 \(775\) 398-00-88.*WhatsApp/);
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        bad: [...document.querySelectorAll('.brand,.language-switch,.button-whatsapp,.contact-link')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.left < 0 || r.right > innerWidth || (!el.matches('.brand') && r.height < 44) || el.scrollWidth > el.clientWidth + 1;
        }).map(el => el.className),
      }));
      expect(layout).toEqual({ scrollWidth: width, bad: [] });
      for (const [index, digits] of ['77753980088', '77472831545'].entries()) {
        const row = page.locator('.contact-phone').nth(index);
        const url = new URL(await row.getAttribute('href'));
        expect(url.pathname).toBe(`/${digits}`);
        expect(url.searchParams.get('text')).toBe(d.whatsappMessage);
        await expect(row).toHaveCSS('color', 'rgb(255, 255, 255)');
      }
      for (const selector of ['.header-actions [data-whatsapp]', '.button-order', '.service-link']) {
        const urls = await page.locator(selector).evaluateAll(els => els.map(el => el.href));
        expect(urls.every(href => new URL(href).pathname === '/77753980088' && new URL(href).searchParams.get('text') === d.whatsappMessage)).toBe(true);
      }
      if ([320, 390, 1440].includes(width)) {
        await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
        await mkdir('reports/screenshots', { recursive: true });
        await page.screenshot({ path: `reports/screenshots/two-contacts-${lang}-${width}.png`, fullPage: true });
      }
      if ([390, 1440].includes(width)) {
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(result.violations).toEqual([]);
      }
    }
  }
  expect(failures).toEqual([]);
});

test('phone text and WhatsApp icon clicks use the matching number; primary CTAs keep their destination', async ({ page, context }) => {
  await context.route('https://wa.me/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Local navigation check</title>' }));
  await page.goto('http://127.0.0.1:4177/ru/');
  for (const [selector, digits] of [
    ['.button-whatsapp', '77753980088'], ['.button-order', '77753980088'],
    ['.contact-phone:first-child>span:first-of-type', '77753980088'],
    ['.contact-phone:first-child .contact-whatsapp', '77753980088'],
    ['.contact-phone:last-child>span:first-of-type', '77472831545'],
    ['.contact-phone:last-child .contact-whatsapp', '77472831545'],
  ]) {
    const [popup] = await Promise.all([context.waitForEvent('page'), page.locator(selector).click()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).pathname).toBe(`/${digits}`);
    expect(new URL(popup.url()).searchParams.get('text')).toBe(ru.whatsappMessage);
    await popup.close();
  }
});

test('segmented switch moves in 200ms, supports keyboard and disables animation with reduced motion', async ({ page }) => {
  await page.goto('/');
  const segmentStyle = () => page.locator('.language-segments').evaluate(el => {
    const style = getComputedStyle(el, '::before');
    return { transform: style.transform, duration: style.transitionDuration };
  });
  expect(await segmentStyle()).toEqual({ transform: 'none', duration: '0.2s' });
  await page.locator('[data-language=ru]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-language=ru]')).toHaveAttribute('aria-current', 'true');
  await expect.poll(async () => (await segmentStyle()).transform).toBe('matrix(1, 0, 0, 1, 44, 0)');
  expect(await page.locator('[data-language=ru]').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Tab');
  await expect(page.locator('.button-whatsapp')).toBeFocused();
  expect(await page.locator('.button-whatsapp').evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.reload();
  await expect(page.locator('[data-language=ru]')).toHaveAttribute('aria-current', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await segmentStyle()).duration).toBe('0s');
  await page.locator('[data-language=kk]').click();
  expect((await segmentStyle()).transform).toBe('none');
  await page.locator('.button-whatsapp').hover();
  await expect(page.locator('.button-whatsapp')).toHaveCSS('background-color', 'rgb(240, 255, 244)');
});

test('no JavaScript retains two localized numbers and the active segment on direct routes', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 900 } });
  try {
    const page = await context.newPage();
    for (const [lang, d] of Object.entries({ kk, ru })) {
      await page.goto(`http://127.0.0.1:4177/${lang === 'ru' ? 'ru/' : ''}`);
      await expect(page.locator(`[data-language=${lang}]`)).toHaveAttribute('aria-current', 'true');
      const hrefs = await page.locator('.contact-phone').evaluateAll(els => els.map(el => el.href));
      expect(hrefs.map(h => new URL(h).pathname)).toEqual(['/77753980088', '/77472831545']);
      expect(hrefs.every(h => new URL(h).searchParams.get('text') === d.whatsappMessage)).toBe(true);
    }
  } finally { await context.close(); }
});

test('optional numbers and missing email/site produce only usable contact links', async ({ browser }) => {
  for (const [name, primary, secondary, count] of [
    ['primary-only', config.whatsapp, '', 1],
    ['secondary-only', '', fixture.whatsappSecondary, 1],
    ['empty', '', '', 0],
  ]) {
    const directory = new URL(`../test-results/${name}/`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
    await build({ config: { ...config, whatsapp: primary, whatsappSecondary: secondary, email: '', siteUrl: '' }, outDir: directory });
    const localServer = serve({ port: 0, directory });
    await new Promise(resolve => localServer.listening ? resolve() : localServer.once('listening', resolve));
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${localServer.address().port}/`);
      await expect(page.locator('.contact-phone')).toHaveCount(count);
      await expect(page.locator('a[href^="mailto:"], [data-website], a[href=""], a[href^="tel:"]')).toHaveCount(0);
      if (!primary) {
        await expect(page.locator('.button-order')).toHaveAttribute('href', '#contacts');
        if (!count) {
          await page.locator('.button-order').click();
          await expect(page.getByRole('dialog')).toBeVisible();
        } else await expect(page.locator('.button-order')).not.toHaveAttribute('data-contact-preview');
      }
      if (!count) await expect(page.locator('.preview-notice')).toBeVisible();
    } finally {
      await context.close();
      await new Promise(resolve => localServer.close(resolve));
    }
  }
});
