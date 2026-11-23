// Spectrogram viewer: STFT of the linked audio card, drawn on a canvas, with peak picking.
// Without an input it shows a synthetic signal so the figure is never blank.

const RATE = 11025;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k), s = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
        const vi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}

function synthetic() {
  const n = RATE * 10, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = 0.5 * Math.sin(2 * Math.PI * (300 + 600 * Math.sin(t * 0.9)) * t) +
      0.35 * Math.sin(2 * Math.PI * (1400 + 500 * Math.cos(t * 1.3)) * t) +
      0.25 * (Math.random() - 0.5);
  }
  return out;
}

function resample(buf) {
  const src = buf.getChannelData(0), ratio = buf.sampleRate / RATE;
  const out = new Float32Array(Math.floor(src.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = src[Math.floor(i * ratio)];
  return out;
}

let cache = { key: null, spec: null };

function analyse(samples, win) {
  const hop = win / 2, cols = Math.max(1, Math.floor((samples.length - win) / hop)), bins = win / 2;
  const spec = [], hann = new Float32Array(win).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1)));
  let max = 1e-9;
  for (let c = 0; c < cols; c++) {
    const re = new Float32Array(win), im = new Float32Array(win);
    for (let i = 0; i < win; i++) re[i] = (samples[c * hop + i] || 0) * hann[i];
    fft(re, im);
    const col = new Float32Array(bins);
    for (let b = 0; b < bins; b++) { col[b] = Math.log10(1 + Math.hypot(re[b], im[b])); max = Math.max(max, col[b]); }
    spec.push(col);
  }
  for (const col of spec) for (let b = 0; b < col.length; b++) col[b] /= max;
  return { spec, cols, bins, seconds: samples.length / RATE };
}

function pickPeaks(a, perSecond) {
  const want = Math.round(perSecond * a.seconds), cand = [];
  const r = 3;
  for (let c = r; c < a.cols - r; c++) for (let b = r; b < a.bins - r; b++) {
    const v = a.spec[c][b];
    if (v < 0.35) continue;
    let isMax = true;
    for (let dc = -r; dc <= r && isMax; dc++) for (let db = -r; db <= r; db++) if ((dc || db) && a.spec[c + dc][b + db] > v) { isMax = false; break; }
    if (isMax) cand.push({ c, b, v });
  }
  return cand.sort((x, y) => y.v - x.v).slice(0, want);
}

specimen.render(async ({ root, settings, inputs, theme, width, height }) => {
  const win = Number(settings.window) || 1024;
  const input = inputs.audio;
  const key = (input && input.bytes ? input.bytes.byteLength : 'synthetic') + ':' + win;
  if (cache.key !== key) {
    let samples;
    try { const buf = await specimen.audio('audio'); samples = buf ? resample(buf) : synthetic(); }
    catch { samples = synthetic(); }
    cache = { key, spec: analyse(samples, win) };
  }
  const a = cache.spec, dpr = devicePixelRatio || 1;
  let canvas = root.querySelector('canvas');
  if (!canvas) {
    root.innerHTML = '<canvas></canvas><div class="tip" hidden></div>';
    canvas = root.querySelector('canvas');
  }
  canvas.width = width * dpr; canvas.height = height * dpr;
  canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const maxBin = Math.floor(a.bins * 0.6); // show 0–3.3 kHz, where music energy lives
  const cw = width / a.cols, bh = height / maxBin;
  const dark = theme === 'dark';
  for (let c = 0; c < a.cols; c++) for (let b = 0; b < maxBin; b++) {
    const v = Math.pow(a.spec[c][b], 1.6);
    const l = dark ? 12 + v * 80 : 98 - v * 85;
    g.fillStyle = `hsl(35 6% ${l}%)`;
    g.fillRect(c * cw, height - (b + 1) * bh, cw + 0.5, bh + 0.5);
  }
  const peaks = settings.peaks ? pickPeaks(a, Number(settings.density) || 12).filter((p) => p.b < maxBin) : [];
  const hot = getComputedStyle(document.documentElement).getPropertyValue('--hot');
  for (const p of peaks) {
    g.beginPath(); g.arc(p.c * cw + cw / 2, height - p.b * bh, 3, 0, Math.PI * 2);
    g.fillStyle = hot; g.fill();
    g.lineWidth = 1; g.strokeStyle = dark ? '#1b1916' : '#fff'; g.stroke();
  }
  const tip = root.querySelector('.tip');
  canvas.onmousemove = (e) => {
    const c = Math.floor(e.offsetX / cw), b = Math.floor((height - e.offsetY) / bh);
    if (!a.spec[c]) return;
    tip.hidden = false;
    tip.style.left = Math.min(e.offsetX + 10, width - 150) + 'px'; tip.style.top = Math.max(4, e.offsetY - 30) + 'px';
    tip.textContent = `${(c * a.seconds / a.cols).toFixed(2)} s · ${Math.round(b * RATE / 2 / a.bins)} Hz · ${Math.round(a.spec[c][b] * 100)}%`;
  };
  canvas.onmouseleave = () => (tip.hidden = true);
});
