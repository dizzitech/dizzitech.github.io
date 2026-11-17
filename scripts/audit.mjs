import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { root } from './build.mjs';

const chrome = await chromium.launch({ channel: 'chrome', args: ['--remote-debugging-port=9222'] });
const summary = {};
try {
  await mkdir(path.join(root, 'reports'), { recursive: true });
  for (const mode of ['mobile', 'desktop']) {
    const result = await lighthouse('http://127.0.0.1:4173/', {
      port: 9222, output: ['html', 'json'], logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      ...(mode === 'desktop' ? { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1440, height: 1000, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } : {}),
    });
    if (result.lhr.runtimeError) throw Error(result.lhr.runtimeError.message);
    for (const [index, extension] of ['html', 'json'].entries()) await writeFile(path.join(root, `reports/lighthouse-${mode}.${extension}`), result.report[index]);
    summary[mode] = Object.fromEntries(Object.entries(result.lhr.categories).map(([key, category]) => [key, Math.round(category.score * 100)]));
    summary[mode].notes = Object.values(result.lhr.audits).filter(audit => audit.score !== null && audit.score < .9 && audit.scoreDisplayMode !== 'informative').map(audit => ({ id: audit.id, title: audit.title, score: audit.score }));
    console.log(mode, JSON.stringify(summary[mode]));
  }
  await writeFile(path.join(root, 'reports/lighthouse-summary.json'), JSON.stringify(summary, null, 2));
} finally { await chrome.close(); }
