// Canvas perspective, pointer capture and frame-rate-independent inertia.
// Angles: radians. Velocities: radians per millisecond.
export function createNetwork(canvas, { reducedMotion, signal }) {
  const context = canvas.getContext('2d');
  if (!context) return { setPaused() {}, destroy() {} };
  const stage = canvas.parentElement;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const colors = getComputedStyle(document.documentElement);
  const networkFont = colors.getPropertyValue('--font').trim();
  const color = name => colors.getPropertyValue(name).trim();
  const blue = color('--blue'), deepBlue = color('--blue-dark'), ink = color('--ink'), surface = color('--surface');
  const rgb = blue.replace('#', '').match(/.{2}/g).map(value => parseInt(value, 16)).join(',');
  const words = ['Design', 'Development', 'UX/UI', 'Performance', 'Mobile', 'Security', 'SEO', 'Innovation', 'Creativity', 'Digital', 'Experience'];
  const widthCache = new Map();
  const localAbort = new AbortController(), localSignal = localAbort.signal;
  let width = 0, height = 0, mobile = false, nodes = [], edges = [];
  let yaw = .31, pitch = -.16, velocityX = 0, velocityY = 0;
  let targetX = 0, targetY = 0, offsetX = 0, offsetY = 0, pointer = null;
  let drag = null, frame = 0, lastFrame = 0, elapsed = 0;
  let visible = true, paused = false, destroyed = false;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const autoSpeed = () => mobile ? .000075 : .00015;

  function makeNodes() {
    const count = mobile ? 40 : 72;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    nodes = Array.from({ length: count }, (_, i) => {
      const y = 1 - i / (count - 1) * 2, radius = Math.sqrt(1 - y * y);
      return { x: Math.cos(goldenAngle * i) * radius, y, z: Math.sin(goldenAngle * i) * radius, label: '' };
    });
    const labels = mobile ? words.filter(word => ['Design', 'Development', 'UX/UI', 'Mobile', 'Digital', 'Creativity'].includes(word)) : words;
    labels.forEach((label, i) => { nodes[Math.floor(3 + i * (count - 6) / labels.length)].label = label; });
    edges = [];
    nodes.forEach((node, i) => {
      nodes.map((other, j) => ({ j, distance: Math.hypot(node.x - other.x, node.y - other.y, node.z - other.z) }))
        .filter(other => other.j > i && other.distance < (mobile ? .78 : .59))
        .sort((a, b) => a.distance - b.distance).slice(0, 4).forEach(other => edges.push([i, other.j]));
    });
    // Brand as a connected central hub, rather than a label pinned to an outer vertex.
    nodes.push({ x: 0, y: 0, z: 0, label: 'DiziTech', brand: true });
    for (let i = 2; i < count; i += Math.floor(count / 7)) edges.push([count, i]);
  }

  function project() {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const tilt = pitch + offsetY * .065, cosP = Math.cos(tilt), sinP = Math.sin(tilt);
    const radius = Math.min(width * .365, height * .397);
    return nodes.map(node => {
      const x = node.x * cosY - node.z * sinY, z = node.x * sinY + node.z * cosY;
      const y2 = node.y * cosP - z * sinP, z2 = node.y * sinP + z * cosP;
      const scale = 3.8 / (3.8 - z2);
      return { x: width / 2 + x * radius * scale + offsetX * 12, y: height / 2 + y2 * radius * scale + offsetY * 8, z: z2, scale, label: node.label, brand: node.brand };
    });
  }

  function draw() {
    if (!width || !height || destroyed) return;
    context.clearRect(0, 0, width, height);
    const points = project();
    const intro = reducedMotion.matches || paused ? 1 : Math.min(.35 + elapsed / 650, 1);
    const proximity = points.map(p => pointer ? Math.max(0, 1 - Math.hypot(p.x - pointer.x, p.y - pointer.y) / 95) : 0);
    const radius = Math.min(width * .365, height * .397);
    context.save(); context.translate(width / 2, height / 2); context.rotate(-.32);
    context.strokeStyle = `rgba(${rgb},.2)`; context.lineWidth = .85;
    context.beginPath(); context.ellipse(0, 0, radius * 1.23, radius * .46, 0, 0, Math.PI * 2); context.stroke();
    context.rotate(.8); context.beginPath(); context.ellipse(0, 0, radius * .53, radius * 1.17, 0, 0, Math.PI * 2); context.stroke(); context.restore();
    edges.forEach(([a, b]) => {
      const p = points[a], q = points[b], depth = (p.z + q.z + 2) / 4;
      const highlight = Math.max(proximity[a], proximity[b]);
      context.strokeStyle = `rgba(${rgb},${(.11 + depth * .28 + highlight * .3) * intro})`;
      context.lineWidth = .85 + depth * .25 + highlight * .55;
      context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke();
    });
    points.forEach((p, i) => {
      const highlight = proximity[i];
      if (highlight > .15) {
        context.fillStyle = `rgba(${rgb},${highlight * .13})`;
        context.beginPath(); context.arc(p.x, p.y, 6 + highlight * 6, 0, Math.PI * 2); context.fill();
      }
      context.fillStyle = `rgba(${rgb},${(.55 + (p.z + 1) * .2) * intro})`;
      context.beginPath(); context.arc(p.x, p.y, (p.label ? 2.8 : 1.5) * p.scale + highlight * 1.5, 0, Math.PI * 2); context.fill();
    });
    const boxes = [];
    const labels = points.filter(p => p.label).sort((a, b) => Number(Boolean(b.brand)) - Number(Boolean(a.brand)) || b.z - a.z);
    labels.forEach(p => {
      const size = p.brand ? (mobile ? 23 : 28) : Math.round((mobile ? 14 : 16) * clamp(p.scale, .94, 1.12) * 2) / 2;
      const font = `${p.brand ? 700 : 600} ${size}px ${networkFont}`;
      context.font = font;
      const key = `${font}:${p.label}`;
      if (!widthCache.has(key)) widthCache.set(key, context.measureText(p.label).width);
      const textWidth = widthCache.get(key), padding = p.brand ? 13 : 5;
      const x = clamp(p.brand ? p.x - textWidth / 2 : p.x + 9, padding + 2, width - textWidth - padding - 2);
      const y = clamp(p.brand ? p.y + size * .35 : p.y + size * .3, size + 8, height - 10);
      const box = { x: x - padding, y: y - size - (p.brand ? 7 : 3), w: textWidth + padding * 2, h: size + (p.brand ? 21 : 10) };
      if (boxes.some(b => box.x < b.x + b.w + 5 && box.x + box.w + 5 > b.x && box.y < b.y + b.h + 4 && box.y + box.h + 4 > b.y)) return;
      boxes.push(box);
      context.globalAlpha = intro; context.fillStyle = surface;
      context.beginPath(); context.roundRect(box.x, box.y, box.w, box.h, p.brand ? 8 : 3); context.fill();
      if (p.brand) { context.strokeStyle = `rgba(${rgb},.3)`; context.lineWidth = 1; context.stroke(); }
      // Dark, opaque labels retain contrast; perspective and point sizes carry depth.
      context.fillStyle = p.brand ? ink : deepBlue; context.fillText(p.label, x, y); context.globalAlpha = 1;
    });
    stage.classList.add('ready');
  }

  function resize() {
    const rect = stage.getBoundingClientRect(); width = rect.width; height = rect.height;
    mobile = width < 430;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0); makeNodes(); draw();
  }

  function tick(time) {
    frame = 0;
    if (destroyed || document.hidden || !visible || paused || reducedMotion.matches) return;
    if (!lastFrame) lastFrame = time;
    if (time - lastFrame >= 1000 / (mobile ? 24 : 40)) {
      const delta = Math.min(time - lastFrame, 64); lastFrame = time; elapsed += delta;
      if (!drag) {
        const decay = Math.exp(-delta / 480);
        yaw += autoSpeed() * delta + velocityX * 480 * (1 - decay);
        pitch = clamp(pitch + velocityY * 480 * (1 - decay), -1.05, 1.05);
        velocityX *= decay; velocityY *= decay;
      }
      const follow = 1 - Math.exp(-delta / 150);
      offsetX += (targetX - offsetX) * follow; offsetY += (targetY - offsetY) * follow; draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function finishDrag({ inertia = false, time = performance.now() } = {}) {
    if (!drag) return;
    const id = drag.id;
    if (!inertia || time - drag.time > 100) velocityX = velocityY = 0;
    drag = null; stage.classList.remove('is-dragging');
    if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
  }

  function sync() {
    cancelAnimationFrame(frame); frame = 0; lastFrame = 0;
    if (paused || reducedMotion.matches || document.hidden || !visible) {
      finishDrag(); velocityX = velocityY = 0; pointer = null; targetX = targetY = offsetX = offsetY = 0;
    }
    if (reducedMotion.matches || paused) { elapsed = 650; draw(); }
    if (!destroyed && !document.hidden && visible && !paused && !reducedMotion.matches) frame = requestAnimationFrame(tick);
  }

  function updatePointer(event) {
    const rect = stage.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    targetX = clamp((pointer.x / width - .5) * 2, -1, 1); targetY = clamp((pointer.y / height - .5) * 2, -1, 1);
  }
  stage.addEventListener('pointerdown', event => {
    if (!finePointer.matches || event.pointerType !== 'mouse' || event.button !== 0 || paused || reducedMotion.matches || drag) return;
    updatePointer(event); velocityX = velocityY = 0;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
    stage.setPointerCapture(event.pointerId); stage.classList.add('is-dragging'); event.preventDefault();
  }, { signal: localSignal });
  stage.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches || reducedMotion.matches || paused) return;
    updatePointer(event);
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y, dt = Math.max(8, event.timeStamp - drag.time);
    const sensitivity = .0042;
    yaw += dx * sensitivity;
    const nextPitch = clamp(pitch + dy * sensitivity, -1.05, 1.05);
    velocityX = clamp(velocityX * .25 + dx * sensitivity / dt * .75, -.0015, .0015);
    velocityY = clamp(velocityY * .25 + (nextPitch - pitch) / dt * .75, -.0012, .0012);
    pitch = nextPitch; drag = { id: drag.id, x: event.clientX, y: event.clientY, time: event.timeStamp };
  }, { passive: true, signal: localSignal });
  stage.addEventListener('pointerup', event => { if (event.pointerId === drag?.id) finishDrag({ inertia: true, time: event.timeStamp }); }, { signal: localSignal });
  stage.addEventListener('pointercancel', () => finishDrag(), { signal: localSignal });
  stage.addEventListener('lostpointercapture', () => finishDrag(), { signal: localSignal });
  stage.addEventListener('pointerleave', () => { if (!drag) { pointer = null; targetX = targetY = 0; } }, { signal: localSignal });
  document.addEventListener('visibilitychange', sync, { signal: localSignal });
  reducedMotion.addEventListener('change', sync, { signal: localSignal });
  finePointer.addEventListener('change', () => { if (!finePointer.matches) { finishDrag(); pointer = null; targetX = targetY = 0; } }, { signal: localSignal });
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { rootMargin: '40px' }); observer.observe(stage);
  function destroy() {
    if (destroyed) return;
    finishDrag(); destroyed = true; cancelAnimationFrame(frame); localAbort.abort(); resizeObserver.disconnect(); observer.disconnect(); stage.classList.remove('ready');
  }
  signal?.addEventListener('abort', destroy, { once: true });
  resize(); sync();
  document.fonts.ready.then(() => { if (!destroyed) { widthCache.clear(); draw(); } });
  return {
    setPaused(value) { paused = value; sync(); },
    // Read-only diagnostics, without per-frame writes into the document.
    getState() { return { yaw, pitch, velocityX, velocityY, dragging: Boolean(drag), paused, mobile, nodeCount: nodes.length, autoSpeed: autoSpeed() }; },
    destroy,
  };
}
