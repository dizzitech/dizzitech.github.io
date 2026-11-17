import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const icon = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

export function validateConfig(config, release = false) {
  const errors = [];
  if (config.whatsapp && !/^[1-9]\d{6,14}$/.test(config.whatsapp)) errors.push('whatsapp: use 7–15 international digits, without + or spaces.');
  if (config.phone && !/^\+?[1-9][\d ()-]{5,24}$/.test(config.phone)) errors.push('phone: enter a valid international telephone number.');
  if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) errors.push('email: enter a valid email address.');
  if (config.siteUrl) {
    try {
      const url = new URL(config.siteUrl);
      if (url.protocol !== 'https:' || url.search || url.hash || !config.siteUrl.endsWith('/')) throw Error();
      if (/example\.(com|org|net)$|localhost|127\.0\.0\.1/i.test(url.hostname)) throw Error();
    } catch { errors.push('siteUrl: use the verified HTTPS public URL with a trailing slash and no query/hash.'); }
  }
  if (release) {
    for (const key of ['whatsapp', 'phone', 'email', 'siteUrl', 'githubAccount', 'githubRepository']) if (!config[key]?.trim()) errors.push(`${key}: required for release; set a verified value in site.config.mjs.`);
    if (config.email && /@(example\.(com|org|net)|test\..+)$/i.test(config.email)) errors.push('email: example addresses cannot be published.');
    if (config.siteUrl && config.githubAccount && config.githubRepository) {
      try {
        const url = new URL(config.siteUrl);
        if (url.hostname.endsWith('.github.io')) {
          const expectedHost = `${config.githubAccount.toLowerCase()}.github.io`;
          const expectedPath = config.githubRepository.toLowerCase() === expectedHost ? '/' : `/${config.githubRepository}/`;
          if (url.hostname !== expectedHost || decodeURIComponent(url.pathname) !== expectedPath) errors.push('siteUrl does not match the configured GitHub Pages account/repository.');
        }
      } catch { /* Already reported above. */ }
    }
  }
  return errors;
}

export async function build({ release = false, config: providedConfig, outDir = path.join(root, 'dist') } = {}) {
  const config = providedConfig || (await import(`../site.config.mjs?updated=${Date.now()}`)).default;
  const errors = validateConfig(config, release);
  if (errors.length) throw Error(`Build blocked:\n${errors.map(error => `- ${error}`).join('\n')}`);
  const [{ default: kk }, { default: ru }] = await Promise.all([
    import(`../src/i18n/kk.js?updated=${Date.now()}`),
    import(`../src/i18n/ru.js?updated=${Date.now()}`),
  ]);
  // Validate before touching output, so a failed release never destroys the last preview.
  await mkdir(outDir, { recursive: true });
  await cp(path.join(root, 'public'), outDir, { recursive: true });
  for (const directory of ['css', 'js', 'i18n']) await cp(path.join(root, 'src', directory), path.join(outDir, directory), { recursive: true });
  const fonts = ['cyrillic-ext', 'cyrillic', 'latin'];
  const fontDir = path.join(outDir, 'assets/fonts'); await mkdir(fontDir, { recursive: true });
  for (const subset of fonts) await cp(path.join(root, `node_modules/@fontsource-variable/golos-text/files/golos-text-${subset}-wght-normal.woff2`), path.join(fontDir, `golos-text-${subset}-wght-normal.woff2`));
  await cp(path.join(root, 'node_modules/@fontsource-variable/golos-text/LICENSE'), path.join(fontDir, 'OFL.txt'));
  // Ship only public contact values to the browser.
  const publicConfig = Object.fromEntries(['whatsapp', 'phone', 'email', 'siteUrl'].map(key => [key, config[key]]));
  await writeFile(path.join(outDir, 'site.config.js'), `// Public contact configuration, generated from site.config.mjs.\nexport default ${JSON.stringify(publicConfig, null, 2)};\n`);
  const template = await readFile(path.join(root, 'src/template.html'), 'utf8');
  const hasWhatsApp = Boolean(config.whatsapp);
  const completeContacts = Boolean(config.whatsapp && config.phone && config.email && config.siteUrl);
  const publishedUrl = release && config.siteUrl;
  const dictionaries = { kk, ru };
  for (const [lang, d] of Object.entries(dictionaries)) {
    const base = lang === 'ru' ? '../' : './';
    const waUrl = hasWhatsApp ? `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(d.whatsappMessage)}` : '#contacts';
    const attrs = hasWhatsApp ? `href="${escape(waUrl)}" data-whatsapp target="_blank" rel="noopener noreferrer"` : 'href="#contacts" data-contact-preview';
    const cta = (className, textKey, id = 'i-arrow') => `<a class="${className}" ${attrs}><span data-i18n="${textKey}">${escape(d[textKey])}</span><span class="button-arrow">${icon(id)}</span></a>`;
    const label = key => `data-i18n="${key}">${escape(d[key])}`;
    const serviceCards = ['landing', 'business', 'education', 'info', 'update', 'support'].map((type, i) => `<article class="service-card reveal" style="--delay:${i % 3 * 55}ms"><svg class="service-art" viewBox="0 0 120 72" aria-hidden="true" data-service-visual="${type}"><use href="#visual-${type}"/></svg><h3 ${label(`service${i + 1}Title`)}</h3><p ${label(`service${i + 1}Text`)}</p><a class="service-link" ${attrs}><span class="sr-only"><span ${label('serviceAction')}</span>: <span ${label(`service${i + 1}Title`)}</span></span>${icon('i-arrow')}</a></article>`).join('\n');
    const steps = Array.from({ length: 4 }, (_, i) => `<li class="timeline-step" style="--step:${i}"><span class="step-number" aria-hidden="true">0${i + 1}</span><h3 ${label(`step${i + 1}Title`)}</h3><p ${label(`step${i + 1}Text`)}</p></li>`).join('\n');
    const contactDetails = [
      { name: 'WhatsApp', value: config.whatsapp, href: waUrl, attr: 'data-whatsapp target="_blank" rel="noopener noreferrer"' },
      { nameKey: 'phoneLabel', value: config.phone, href: `tel:${config.phone.replace(/[^\d+]/g, '')}` },
      { nameKey: 'emailLabel', value: config.email, href: `mailto:${config.email}` },
      { nameKey: 'websiteLabel', value: config.siteUrl ? config.siteUrl.replace(/^https:\/\//, '').replace(/\/$/, '') : '', href: config.siteUrl, attr: 'data-website' },
    ].map(contact => `<div class="contact-detail"><p${contact.nameKey ? ` ${label(contact.nameKey)}` : `>${contact.name}`}</p>${contact.value ? `<a href="${escape(contact.href)}" ${contact.attr || ''}${contact.name === 'WhatsApp' ? ` data-i18n="write"` : ''}>${escape(contact.name === 'WhatsApp' ? d.write : contact.value)}</a>` : `<span class="contact-unset" ${label('notConfigured')}</span>`}</div>`).join('\n');
    const previewNotice = completeContacts ? '' : `<p class="preview-notice"><span aria-hidden="true"></span><strong data-i18n="dialogTitle">${escape(d.dialogTitle)}</strong></p>`;
    const pageUrl = publishedUrl ? new URL(lang === 'ru' ? 'ru/' : './', config.siteUrl).href : '';
    const socialMeta = pageUrl ? `<link rel="canonical" href="${escape(pageUrl)}"><meta property="og:url" content="${escape(pageUrl)}"><meta property="og:image" content="${escape(new URL('assets/og-image.png', config.siteUrl).href)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="DiziTech — Design & Development">` : '';
    const languageLinks = publishedUrl ? ['kk', 'ru', 'x-default'].map(code => `<link rel="alternate" hreflang="${code}" href="${escape(new URL(code === 'ru' ? 'ru/' : './', config.siteUrl).href)}">`).join('') : '';
    const values = {
      ...Object.fromEntries(Object.entries(d).map(([key, value]) => [key, escape(value)])),
      base, robots: release ? 'index, follow' : 'noindex, nofollow', socialMeta, languageLinks,
      preview: String(!release), kkHref: base, ruHref: `${base}ru/`, kkCurrent: String(lang === 'kk'), ruCurrent: String(lang === 'ru'),
      headerCta: cta('button button-outline button-small', 'write', 'i-whatsapp'), heroCta: cta('button button-primary button-order', 'order'),
      contactCta: cta('button button-primary contact-cta', 'contactAction', 'i-whatsapp'),
      serviceCards, steps, contactDetails, previewNotice, year: new Date().getUTCFullYear(),
    };
    const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => { if (!(key in values)) throw Error(`Missing template key: ${key}`); return values[key]; });
    const destination = lang === 'ru' ? path.join(outDir, 'ru') : outDir;
    await mkdir(destination, { recursive: true }); await writeFile(path.join(destination, 'index.html'), html);
  }
  const sitemap = publishedUrl ? `<url><loc>${escape(config.siteUrl)}</loc><xhtml:link rel="alternate" hreflang="kk" href="${escape(config.siteUrl)}"/><xhtml:link rel="alternate" hreflang="ru" href="${escape(new URL('ru/', config.siteUrl).href)}"/></url><url><loc>${escape(new URL('ru/', config.siteUrl).href)}</loc></url>` : '';
  await writeFile(path.join(outDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${sitemap}</urlset>\n`);
  await writeFile(path.join(outDir, 'robots.txt'), publishedUrl ? `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', config.siteUrl).href}\n` : 'User-agent: *\nDisallow: /\n');
  const homePath = publishedUrl ? new URL(config.siteUrl).pathname : './';
  await writeFile(path.join(outDir, '404.html'), `<!doctype html><html lang="kk"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>404 — DiziTech</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fafbfe;color:#17243b;font:18px/1.7 system-ui}main{max-width:600px;padding:30px}a{color:#2456b9}h1{font-size:48px}p{margin-bottom:28px}</style><main><p>DiziTech / 404</p><h1>${kk.notFoundTitle}</h1><p lang="ru">${ru.notFoundTitle}</p><a href="${escape(homePath)}">${kk.backHome} / <span lang="ru">${ru.backHome}</span> ↗</a></main></html>`);
  await writeFile(path.join(outDir, '.nojekyll'), '');
  // The OG image is generated by the local screenshot utility and stored as a real asset.
  if (release) await stat(path.join(outDir, 'assets/og-image.png'));
  console.log(`${release ? 'Release' : 'Local preview'} build: ${outDir}${release ? '' : '\nNot for publication: noindex enabled; release requires verified contacts and hosting details.'}`);
  return outDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await build({ release: process.argv.includes('--release') }); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
