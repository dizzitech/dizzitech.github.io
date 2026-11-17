import { test, expect } from '@playwright/test';

async function harness(page, { reducedMotion = 'no-preference' } = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.route('**/__network-test__/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><meta charset="UTF-8"><link rel="stylesheet" href="/css/styles.css"><style>.network-stage{width:600px;height:480px;margin:40px}</style><div class="network-stage"><canvas></canvas></div><script type="module">import {createNetwork} from '/js/network.js';window.controllerAbort=new AbortController();window.controller=createNetwork(document.querySelector('canvas'),{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)'),signal:controllerAbort.signal});</script></html>` }));
  await page.goto('/__network-test__/');
  await expect(page.locator('.network-stage')).toHaveClass(/ready/);
  await page.evaluate(() => document.fonts.ready);
}
const state = page => page.evaluate(() => window.controller.getState());

test('automatic rotation is noticeable and bounded', async ({ page }) => {
  await harness(page);
  const before = await state(page); await page.waitForTimeout(1000); const after = await state(page);
  const radians = after.yaw - before.yaw;
  expect(radians).toBeGreaterThan(.10); expect(radians).toBeLessThan(.21);
});

test('drag has no initial jump, follows both axes, flings, and decays to automatic rotation', async ({ page }) => {
  await harness(page);
  await page.mouse.move(290, 230); const initial = await state(page);
  await page.mouse.down(); const pressed = await state(page);
  expect(pressed.dragging).toBe(true);
  expect(Math.abs(pressed.yaw - initial.yaw)).toBeLessThan(.015);
  expect(pressed.pitch).toBe(initial.pitch);
  await page.mouse.move(390, 275, { steps: 10 }); const dragged = await state(page);
  expect(dragged.yaw - pressed.yaw).toBeGreaterThan(.35);
  expect(dragged.pitch - pressed.pitch).toBeGreaterThan(.15);
  await page.mouse.up(); const released = await state(page);
  expect(released.dragging).toBe(false); expect(released.velocityX).toBeGreaterThan(.0002);
  expect(released.velocityX).toBeLessThanOrEqual(.0015);
  await page.waitForTimeout(320); const flung = await state(page);
  expect(flung.yaw - released.yaw).toBeGreaterThan(.10);
  expect(flung.velocityX).toBeLessThan(released.velocityX);
  await page.waitForTimeout(2100); const settled = await state(page);
  expect(Math.abs(settled.velocityX)).toBeLessThan(.000025);
  await page.waitForTimeout(500); const automatic = await state(page);
  expect(automatic.yaw - settled.yaw).toBeGreaterThan(.05);
  expect(automatic.yaw - settled.yaw).toBeLessThan(.11);
});

test('capture works outside canvas; reverse drag and cancellation never leave a stuck state', async ({ page }) => {
  await harness(page);
  await page.mouse.move(500, 260); await page.mouse.down(); const before = await state(page);
  await page.mouse.move(10, 280, { steps: 12 });
  expect((await state(page)).yaw).toBeLessThan(before.yaw - 1);
  await page.mouse.up(); await expect(page.locator('.network-stage')).not.toHaveClass(/is-dragging/);
  await page.mouse.move(290, 230); await page.mouse.down(); await page.mouse.move(360, 230, { steps: 4 });
  await page.locator('.network-stage').dispatchEvent('pointercancel', { pointerType: 'mouse' });
  const cancelled = await state(page);
  expect(cancelled.dragging).toBe(false); expect(cancelled.velocityX).toBe(0);
  await page.mouse.up();
  await page.mouse.down(); expect((await state(page)).dragging).toBe(true); await page.mouse.up();
});

test('reduced motion stops a drag and inertia; pause also gives an unchanged canvas', async ({ page }) => {
  await harness(page);
  await page.mouse.move(250, 230); await page.mouse.down(); await page.mouse.move(360, 230, { steps: 5 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.network-stage')).not.toHaveClass(/is-dragging/);
  const before = await state(page);
  await page.mouse.move(440, 270); await page.mouse.up(); await page.waitForTimeout(250);
  const after = await state(page);
  expect(after.yaw).toBe(before.yaw); expect(after.pitch).toBe(before.pitch); expect(after.velocityX).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => controller.setPaused(true));
  const image = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.mouse.move(250, 230); await page.mouse.down(); await page.mouse.move(440, 270); await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await page.locator('canvas').evaluate(canvas => canvas.toDataURL())).toBe(image);
});

test('signal abort releases capture and removes interaction handlers', async ({ page }) => {
  await harness(page);
  await page.mouse.move(300, 230); await page.mouse.down(); await page.mouse.move(370, 250);
  await page.evaluate(() => controllerAbort.abort());
  const stopped = await state(page);
  await expect(page.locator('.network-stage')).not.toHaveClass(/is-dragging/);
  await page.mouse.up(); await page.mouse.move(300, 230); await page.mouse.down(); await page.mouse.move(400, 250); await page.mouse.up();
  await page.waitForTimeout(150); expect((await state(page)).yaw).toBe(stopped.yaw);
});

test('actual hero drag responds and releases its custom cursor outside the network', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  const canvas = page.locator('#word-network'), stage = page.locator('.network-stage');
  await expect(stage).toHaveClass(/ready/);
  const rect = await stage.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down(); await expect(stage).toHaveClass(/is-dragging/);
  const before = await canvas.evaluate(el => el.toDataURL());
  await page.mouse.move(rect.x + rect.width / 2 + 90, rect.y + rect.height / 2 + 40, { steps: 10 });
  await expect(page.locator('.custom-cursor')).toHaveClass(/drag-mode/);
  expect(await canvas.evaluate(el => el.toDataURL())).not.toBe(before);
  await page.mouse.move(rect.x - 40, rect.y + 80, { steps: 5 }); await page.mouse.up();
  await expect(stage).not.toHaveClass(/is-dragging/);
  await expect(page.locator('.custom-cursor')).not.toHaveClass(/drag-mode/);
  await page.mouse.wheel(0, 300); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
});

test('vertical touch gesture starting on the network scrolls the page', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage(); await page.goto('http://127.0.0.1:4173/');
    await expect(page.locator('.network-stage')).toHaveClass(/ready/);
    const rect = await page.locator('.network-stage').boundingBox();
    const x = rect.x + rect.width / 2, y = Math.min(rect.y + 100, 760);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 25 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    await expect(page.locator('.network-stage')).not.toHaveClass(/is-dragging/);
    await expect(page.locator('body')).not.toHaveClass(/cursor-enabled/);
  } finally { await context.close(); }
});
