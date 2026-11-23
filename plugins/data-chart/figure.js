// Data chart: label,value CSV → bar or line chart with a baseline, value labels and hover.

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function parse(csv) {
  return String(csv || '').split(/\r?\n/).map((l) => l.split(',')).filter((r) => r.length >= 2 && !isNaN(parseFloat(r[1]))).map((r) => ({ label: r[0].trim(), v: parseFloat(r[1]) }));
}

specimen.render(({ root, settings, inputs, width, height }) => {
  const rows = parse((inputs.data && inputs.data.text) || settings.csv);
  if (!rows.length) { root.innerHTML = '<p class="empty">No numeric rows. Use “label,value” per line.</p>'; return; }
  const pad = { l: 16, r: 16, t: 22, b: 26 };
  const max = Math.max(...rows.map((r) => r.v), 0) || 1;
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const bw = iw / rows.length;
  const y = (v) => pad.t + ih - (v / max) * ih;
  let s = `<line x1="${pad.l}" x2="${width - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="axis"/>`;
  if (settings.kind === 'line') {
    const pts = rows.map((r, i) => `${pad.l + bw * i + bw / 2},${y(r.v)}`).join(' ');
    s += `<polyline points="${pts}" class="line"/>`;
  }
  rows.forEach((r, i) => {
    const x = pad.l + bw * i;
    if (settings.kind === 'line') s += `<circle cx="${x + bw / 2}" cy="${y(r.v)}" r="3.5" class="mark" data-i="${i}"/>`;
    else s += `<rect x="${x + bw * 0.18}" y="${y(r.v)}" width="${bw * 0.64}" height="${pad.t + ih - y(r.v)}" class="mark${i === 0 ? ' first' : ''}" data-i="${i}"/>`;
    s += `<text x="${x + bw / 2}" y="${height - 9}" text-anchor="middle" class="lbl">${esc(r.label)}</text>`;
  });
  root.innerHTML = `<svg width="${width}" height="${height}">${s}<text class="val" x="${pad.l}" y="13"></text></svg>`;
  const val = root.querySelector('.val');
  root.querySelectorAll('.mark').forEach((m) => {
    m.onmouseenter = () => { const r = rows[m.dataset.i]; val.textContent = `${r.label}: ${r.v}${settings.unit || ''}`; };
  });
});
