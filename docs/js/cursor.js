export function createCursor({ reducedMotion, signal }) {
  const cursor = document.querySelector('.custom-cursor');
  const suitable = matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0, enabled = false, seen = false;
  let x = -100, y = -100, trailX = -100, trailY = -100;
  let arrow = null;
  function stop() { cancelAnimationFrame(frame); frame = 0; cursor.style.opacity = '0'; }
  function animate() {
    trailX += (x - trailX) * .38; trailY += (y - trailY) * .38;
    cursor.style.transform = `translate3d(${trailX}px,${trailY}px,0) translate(-50%,-50%)`;
    if (Math.abs(x - trailX) + Math.abs(y - trailY) > .1 && enabled && !document.hidden) frame = requestAnimationFrame(animate);
    else frame = 0;
  }
  function resetArrow() { if (arrow) arrow.style.transform = ''; arrow = null; }
  function sync() {
    enabled = suitable.matches && !reducedMotion.matches;
    document.body.classList.toggle('cursor-enabled', enabled);
    if (!enabled || document.hidden) { stop(); resetArrow(); seen = false; }
  }
  document.addEventListener('pointermove', event => {
    if (!enabled || event.pointerType === 'touch') return;
    x = event.clientX; y = event.clientY;
    if (!seen) { trailX = x; trailY = y; seen = true; }
    cursor.style.opacity = '1';
    const element = event.target instanceof Element ? event.target : null;
    const interactive = element?.closest('a,button,summary');
    const isText = element?.closest('input,textarea,[contenteditable=true]');
    cursor.classList.toggle('active', Boolean(interactive));
    cursor.classList.toggle('network-mode', Boolean(element?.closest('.network-stage')));
    cursor.classList.toggle('drag-mode', Boolean(element?.closest('.network-stage.is-dragging')));
    cursor.classList.toggle('card-mode', Boolean(element?.closest('.service-card')));
    cursor.classList.toggle('text-mode', Boolean(isText));
    cursor.classList.toggle('dark-mode', Boolean(element?.closest('.hero-copy,.contacts')));
    const nextArrow = interactive?.querySelector('.button-arrow');
    if (nextArrow !== arrow) resetArrow();
    if (nextArrow) {
      arrow = nextArrow;
      const rect = interactive.getBoundingClientRect();
      arrow.style.transform = `translate(${(x - rect.left - rect.width / 2) * .07}px,${(y - rect.top - rect.height / 2) * .08}px)`;
    }
    if (!frame) frame = requestAnimationFrame(animate);
  }, { passive: true, signal });
  document.documentElement.addEventListener('pointerleave', () => { stop(); resetArrow(); seen = false; }, { signal });
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => cursor.classList.remove('drag-mode'), { signal });
  document.addEventListener('keydown', event => { if (event.key === 'Tab') { stop(); resetArrow(); } }, { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  suitable.addEventListener('change', sync, { signal });
  reducedMotion.addEventListener('change', sync, { signal });
  sync();
  return () => { stop(); resetArrow(); document.body.classList.remove('cursor-enabled'); };
}
