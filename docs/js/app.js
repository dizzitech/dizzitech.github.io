import kk from '../i18n/kk.js';
import ru from '../i18n/ru.js';
import config from '../site.config.js';
import { createNetwork } from './network.js';
import { createCursor } from './cursor.js';
import { whatsappUrl } from './contacts.js';

const dictionaries = { kk, ru };
const abort = new AbortController();
const { signal } = abort;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const route = new URL(document.body.dataset.assetBase, location.href);
// Freeze resource URLs before history changes language routes: relative favicons
// otherwise resolve again against /ru/ and create requests for /ru/assets/.
document.querySelectorAll('link[rel=icon]').forEach(element => { element.href = new URL(element.getAttribute('href'), location.href).href; });
document.querySelectorAll('[data-language]').forEach(link => {
  link.href = new URL(link.dataset.language === 'ru' ? 'ru/' : './', route).href;
});
const dialog = document.querySelector('#contact-dialog');
const motionToggle = document.querySelector('.motion-toggle');
let language = document.documentElement.lang;
let userPaused = false;
let revealObserver, network, destroyCursor;

function words() {
  let index = 0;
  document.querySelectorAll('h1 [data-i18n]').forEach(line => {
    const text = line.textContent;
    line.replaceChildren(...text.split(' ').flatMap((word, i) => {
      const span = document.createElement('span'); span.className = 'word'; span.textContent = word;
      span.style.setProperty('--word-index', index++);
      return i ? [document.createTextNode(' '), span] : [span];
    }));
  });
}

function updateContactLinks() {
  const d = dictionaries[language];
  document.querySelectorAll('[data-whatsapp]').forEach(link => {
    const number = link.dataset.whatsapp === 'secondary' ? config.whatsappSecondary : config.whatsapp;
    const href = whatsappUrl(number, d.whatsappMessage);
    if (href) link.href = href;
  });
}

function updateMotionButton() {
  const label = userPaused ? 'play' : 'pause';
  motionToggle.dataset.i18nAria = label;
  motionToggle.setAttribute('aria-label', dictionaries[language][label]);
  motionToggle.setAttribute('aria-pressed', String(userPaused));
  motionToggle.hidden = reducedMotion.matches;
}

function setLanguage(next, { persist = true, updateUrl = true } = {}) {
  if (!dictionaries[next]) return;
  language = next;
  const d = dictionaries[next];
  document.documentElement.lang = next;
  document.title = d.title;
  document.querySelectorAll('[data-i18n]').forEach(el => { if (d[el.dataset.i18n] !== undefined) el.textContent = d[el.dataset.i18n]; });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { if (d[el.dataset.i18nAria] !== undefined) el.setAttribute('aria-label', d[el.dataset.i18nAria]); });
  document.querySelectorAll('[data-language]').forEach(link => link.setAttribute('aria-current', String(link.dataset.language === next)));
  document.querySelector('meta[name=description]').content = d.description;
  document.querySelector('meta[property="og:title"]').content = d.title;
  document.querySelector('meta[property="og:description"]').content = d.description;
  document.querySelector('meta[property="og:locale"]').content = d.locale;
  if (updateUrl) {
    const target = new URL(next === 'ru' ? 'ru/' : './', route);
    target.hash = location.hash; target.search = location.search;
    history.replaceState({ language: next }, '', target);
  }
  const canonical = document.querySelector('link[rel=canonical]');
  if (canonical && config.siteUrl) canonical.href = new URL(next === 'ru' ? 'ru/' : './', config.siteUrl).href;
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl && config.siteUrl) ogUrl.content = new URL(next === 'ru' ? 'ru/' : './', config.siteUrl).href;
  if (persist) { try { localStorage.setItem('dizitech-language', next); } catch { /* Storage can be unavailable in private contexts. */ } }
  updateContactLinks(); updateMotionButton(); words();
}

document.querySelectorAll('[data-language]').forEach(link => link.addEventListener('click', event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); setLanguage(link.dataset.language);
}, { signal }));
// An explicitly opened /ru/ route wins over stored preference. Root first visits default to Kazakh.
try { const saved = localStorage.getItem('dizitech-language'); if (language === 'kk' && dictionaries[saved]) setLanguage(saved); } catch { /* Keep the server-rendered language. */ }
words(); updateContactLinks();

document.querySelectorAll('[data-contact-preview]').forEach(link => link.addEventListener('click', event => {
  // Without JS these are real in-page links to the honest contact status.
  event.preventDefault(); dialog.showModal();
}, { signal }));
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}, { signal });
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')];
  if (!controls.length) return;
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}, { signal });

function initReveals() {
  revealObserver?.disconnect();
  if (reducedMotion.matches || !('IntersectionObserver' in window)) {
    document.querySelectorAll('.is-observed').forEach(el => el.classList.add('is-visible')); return;
  }
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
  }), { threshold: .09, rootMargin: '0px 0px -25px 0px' });
  document.querySelectorAll('.reveal,.timeline').forEach(el => { el.classList.add('is-observed'); revealObserver.observe(el); });
}
initReveals();
reducedMotion.addEventListener('change', () => { initReveals(); updateMotionButton(); }, { signal });

const header = document.querySelector('.site-header');
let scrollFrame = 0;
function updateScroll() {
  scrollFrame = 0; header.classList.toggle('scrolled', scrollY > 12);
}
window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }, { passive: true, signal });
updateScroll();
try { network = createNetwork(document.querySelector('#word-network'), { reducedMotion, signal }); } catch (error) { console.warn('Word network unavailable:', error); }
try { destroyCursor = createCursor({ reducedMotion, signal }); } catch { document.body.classList.remove('cursor-enabled'); }
updateMotionButton();
motionToggle.addEventListener('click', () => { userPaused = !userPaused; network?.setPaused(userPaused); updateMotionButton(); }, { signal });
// Leave a bfcache page intact; discard resources only when this document is really unloaded.
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  network?.destroy(); destroyCursor?.(); revealObserver?.disconnect();
  cancelAnimationFrame(scrollFrame); abort.abort();
}, { signal });
