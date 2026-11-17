import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { serve } from './serve.mjs';
import { root } from './build.mjs';

// Render the actual Kazakh hero, keeping the social image in sync with the website.
const server = serve({ port: 0 });
await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.network-stage.ready');
  await page.addStyleTag({ content: `
    body{width:1200px;height:630px;overflow:hidden}
    .site-header{position:static;border:0}.header-inner{min-height:86px}
    .header-actions,.services,.process,.contacts,.motion-toggle,.network-bottom{display:none!important}
    .hero{padding-top:0}.hero-layout{min-height:480px}.hero-copy{padding:30px}
    .network-stage{height:390px}.network-panel{padding-block:20px}
    .hero h1{font-size:53px}
  ` });
  await mkdir(path.join(root, 'public/assets'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'public/assets/og-image.png') });
  console.log('Generated public/assets/og-image.png (1200 × 630) from the current hero');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
