// Ripple tank: amplitude of two coherent point sources on a dot grid.
// Stepped so the host's ▶ PLAY runs the waves (figures never auto-play).

const STEPS = 24;
specimen.render(({ root, settings, step, width, height }) => {
  specimen.setSteps(STEPS);
  const lambda = Number(settings.wavelength) || 26;
  const k = (2 * Math.PI) / lambda, phase = (step / STEPS) * 2 * Math.PI;
  const sources = [{ x: width * 0.42, y: height / 2 }, { x: width * 0.58, y: height / 2 }];
  const amp = (x, y) => sources.reduce((s, p) => s + Math.cos(k * Math.hypot(x - p.x, y - p.y) - phase), 0) / 2;
  const envelope = (x, y) => Math.abs(Math.cos((k * (Math.hypot(x - sources[0].x, y - sources[0].y) - Math.hypot(x - sources[1].x, y - sources[1].y))) / 2));
  let s = '';
  const gap = 10;
  for (let y = gap / 2; y < height; y += gap) for (let x = gap / 2; x < width; x += gap) {
    const a = amp(x, y);
    const r = Math.max(0.3, (a + 1) * 2);
    const node = settings.nodes && envelope(x, y) < 0.12;
    s += `<circle cx="${x}" cy="${y}" r="${node ? 1.6 : r.toFixed(2)}" class="${node ? 'node' : 'dot'}"/>`;
  }
  for (const p of sources) s += `<circle cx="${p.x}" cy="${p.y}" r="4" class="src"/>`;
  root.innerHTML = `<svg width="${width}" height="${height}">${s}<text x="8" y="${height - 8}" class="read">hover to read amplitude</text></svg>`;
  const read = root.querySelector('.read');
  root.firstChild.onmousemove = (e) => (read.textContent = `amplitude ${amp(e.offsetX, e.offsetY).toFixed(2)}`);
});
