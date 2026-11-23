// Function plot. The expression runs inside the sandbox, so evaluating user text is safe here.

function compile(expr) {
  const names = Object.getOwnPropertyNames(Math).join(',');
  // eslint-disable-next-line no-new-func
  return new Function('x', 'a', `const {${names}} = Math; return (${expr});`);
}

specimen.render(({ root, settings, width, height }) => {
  let f;
  try { f = compile(settings.expr || 'x'); } catch (e) { root.innerHTML = `<p class="err">${e.message}</p>`; return; }
  const [x0, x1] = String(settings.domain || '0,1').split(',').map(Number);
  const a = Number(settings.a);
  const pad = 24, n = 240, pts = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = f(x, a);
    if (Number.isFinite(y)) pts.push([x, y]);
  }
  if (!pts.length) { root.innerHTML = '<p class="err">No finite values in this range.</p>'; return; }
  let ymin = Math.min(...pts.map((p) => p[1])), ymax = Math.max(...pts.map((p) => p[1]));
  if (ymin === ymax) { ymin -= 1; ymax += 1; }
  const sx = (x) => pad + ((x - x0) / (x1 - x0)) * (width - 2 * pad);
  const sy = (y) => height - pad - ((y - ymin) / (ymax - ymin)) * (height - 2 * pad);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join('');
  const zeroY = ymin < 0 && ymax > 0 ? sy(0) : height - pad;
  root.innerHTML = `<svg width="${width}" height="${height}">
    <line x1="${pad}" x2="${width - pad}" y1="${zeroY}" y2="${zeroY}" class="axis"/>
    <line x1="${pad}" x2="${pad}" y1="${pad}" y2="${height - pad}" class="axis"/>
    <text x="${pad}" y="${height - 6}" class="tick">${x0}</text><text x="${width - pad}" y="${height - 6}" text-anchor="end" class="tick">${x1}</text>
    <text x="${pad + 4}" y="${pad - 6}" class="tick">${+ymax.toFixed(3)}</text>
    <path d="${path}" class="curve"/><circle r="4" class="probe" visibility="hidden"/><text class="read" x="${width - pad}" y="${pad - 6}" text-anchor="end"></text></svg>`;
  const svg = root.firstElementChild, probe = svg.querySelector('.probe'), read = svg.querySelector('.read');
  svg.onmousemove = (e) => {
    const x = x0 + ((e.offsetX - pad) / (width - 2 * pad)) * (x1 - x0), y = f(x, a);
    if (!Number.isFinite(y) || x < x0 || x > x1) return;
    probe.setAttribute('cx', sx(x)); probe.setAttribute('cy', sy(y)); probe.setAttribute('visibility', 'visible');
    read.textContent = `x ${x.toFixed(2)} · y ${y.toFixed(3)}`;
  };
});
