// Step-through animator: SVG diagrams with one state per step.
// Each preset returns { steps, draw(step) -> svg markup }.

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function grid(w, h) {
  let s = '';
  for (let x = 0; x <= w; x += 16) s += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" class="grid"/>`;
  for (let y = 0; y <= h; y += 16) s += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" class="grid"/>`;
  return s;
}

function hashMatching(w, h) {
  const clipX = [0.16, 0.24, 0.32, 0.40, 0.48].map((f) => f * w + 20);
  const songX = Array.from({ length: 9 }, (_, i) => 0.14 * w + i * (w * 0.8 / 9) + 20);
  const match = [3, 4, 5, 6, 7]; // clip i matches song slot match[i]: a constant δt, so a diagonal
  const yC = h * 0.25, yS = h * 0.72;
  return {
    steps: 6,
    draw(step) {
      let s = `<text x="10" y="${yC + 4}" class="lbl">CLIP</text><text x="10" y="${yS + 4}" class="lbl">SONG</text>`;
      for (let i = 0; i < Math.min(step, 5); i++) {
        const cur = i === step - 1;
        const x1 = clipX[i], x2 = songX[match[i]];
        s += `<path d="M${x1} ${yC + 6} C ${x1} ${(yC + yS) / 2}, ${x2} ${(yC + yS) / 2}, ${x2} ${yS - 6}" class="${cur ? 'arc hot' : 'arc'}"/>`;
        if (cur) s += `<text x="${(x1 + x2) / 2 + 8}" y="${(yC + yS) / 2}" class="note hot-t">δt = ${110 + i * 0} ms</text>`;
      }
      clipX.forEach((x, i) => (s += `<circle cx="${x}" cy="${yC}" r="5.5" class="${i === step - 1 ? 'dot hot-f' : 'dot'}"/>`));
      songX.forEach((x, i) => (s += `<circle cx="${x}" cy="${yS}" r="5.5" class="${match.indexOf(i) === step - 1 ? 'dot hot-f' : 'dot'}"/>`));
      if (step === 6) s += `<text x="${w / 2}" y="${h - 8}" text-anchor="middle" class="note">5 hits share δt → one tall spike → match</text>`;
      else if (step === 0) s += `<text x="${w / 2}" y="${h - 8}" text-anchor="middle" class="note">press ▶ to look up each clip hash</text>`;
      return s;
    },
  };
}

function lz77(text) {
  const tokens = [];
  for (let i = 0; i < text.length; ) {
    let best = { d: 0, n: 0 };
    for (let j = Math.max(0, i - 4096); j < i; j++) {
      let n = 0;
      while (i + n < text.length && text[j + n] === text[i + n]) n++;
      if (n > best.n) best = { d: i - j, n };
    }
    tokens.push({ i, ...best, next: text[i + best.n] ?? '' });
    i += best.n + 1;
  }
  return tokens;
}

function slidingWindow(w, h, text) {
  text = (text || 'ABRACADABRA').slice(0, 24);
  const tokens = lz77(text);
  const cell = Math.min(28, (w - 40) / text.length);
  const x0 = (w - cell * text.length) / 2, y0 = h * 0.3;
  return {
    steps: tokens.length + 1,
    draw(step) {
      const t = tokens[step - 1];
      const done = step === 0 ? 0 : t.i + t.n + 1;
      let s = '';
      for (let k = 0; k < text.length; k++) {
        const inMatch = t && k >= t.i && k < t.i + t.n;
        const inSrc = t && t.n && k >= t.i - t.d && k < t.i - t.d + t.n;
        const cls = inMatch ? 'cell hot-f' : inSrc ? 'cell src' : k < done ? 'cell done' : 'cell';
        s += `<rect x="${x0 + k * cell}" y="${y0}" width="${cell - 3}" height="${cell}" class="${cls}"/>`;
        s += `<text x="${x0 + k * cell + (cell - 3) / 2}" y="${y0 + cell / 2 + 4}" text-anchor="middle" class="${inMatch ? 'ch on' : 'ch'}">${esc(text[k])}</text>`;
      }
      if (t && t.n) {
        const a = x0 + (t.i - t.d) * cell + (t.n * cell) / 2, b = x0 + t.i * cell + (t.n * cell) / 2;
        s += `<path d="M${b} ${y0 + cell + 4} Q ${(a + b) / 2} ${y0 + cell + 44} ${a} ${y0 + cell + 4}" class="arc hot"/>`;
      }
      const out = tokens.slice(0, step).map((k) => `(${k.d},${k.n},${esc(k.next || '∅')})`).join(' ');
      s += `<text x="${w / 2}" y="${h - 12}" text-anchor="middle" class="note">${out || 'emit (distance, length, next char)'}</text>`;
      return s;
    },
  };
}

let current = null;

specimen.render(({ root, settings, step, width, height }) => {
  const key = settings.preset + '|' + settings.text + '|' + width + '|' + height;
  if (!current || current.key !== key) {
    const p = settings.preset === 'sliding-window' ? slidingWindow(width, height, settings.text) : hashMatching(width, height);
    current = { key, p };
    specimen.setSteps(p.steps);
  }
  root.innerHTML = `<svg xmlns="${NS}" width="${width}" height="${height}">${grid(width, height)}${current.p.draw(Math.min(step, current.p.steps - 1))}</svg>`;
});
