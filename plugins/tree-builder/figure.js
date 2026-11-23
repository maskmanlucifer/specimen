// Huffman tree builder. Step k shows the forest after k merges.

function forestAfter(text, k) {
  const freq = {};
  for (const ch of text) freq[ch] = (freq[ch] || 0) + 1;
  let nodes = Object.entries(freq).map(([s, w], i) => ({ s, w, id: 'l' + i }));
  let last = null;
  for (let m = 0; m < k && nodes.length > 1; m++) {
    nodes.sort((a, b) => a.w - b.w || a.id.localeCompare(b.id));
    const [a, b] = nodes.splice(0, 2);
    last = { w: a.w + b.w, l: a, r: b, id: 'n' + m };
    nodes.push(last);
  }
  return { nodes: nodes.sort((a, b) => b.w - a.w), last, merges: Object.keys(freq).length - 1 };
}

function layout(node, depth, x0, x1, out) {
  const leaves = (n) => (n.l ? leaves(n.l) + leaves(n.r) : 1);
  const x = (x0 + x1) / 2;
  out.push({ n: node, x, depth });
  if (node.l) {
    const split = x0 + ((x1 - x0) * leaves(node.l)) / leaves(node);
    out.push(...layout(node.l, depth + 1, x0, split, []).map((p) => ({ ...p, parent: { x, depth }, bit: 0 })));
    out.push(...layout(node.r, depth + 1, split, x1, []).map((p) => ({ ...p, parent: { x, depth }, bit: 1 })));
  }
  return out;
}

function codes(node, prefix = '', out = {}) {
  if (!node.l) out[node.s] = prefix || '0';
  else { codes(node.l, prefix + '0', out); codes(node.r, prefix + '1', out); }
  return out;
}

specimen.render(({ root, settings, step, width, height }) => {
  const text = String(settings.input || 'ABRACADABRA').slice(0, 40);
  const total = forestAfter(text, Infinity).merges;
  specimen.setSteps(total + 1);
  const f = forestAfter(text, Math.min(step, total));
  const showCodes = settings.codes && f.nodes.length === 1;
  const h = showCodes ? height - 36 : height;
  const leafCount = (n) => (n.l ? leafCount(n.l) + leafCount(n.r) : 1);
  const all = f.nodes.reduce((sum, n) => sum + leafCount(n), 0);
  const depthOf = (n) => (n.l ? 1 + Math.max(depthOf(n.l), depthOf(n.r)) : 0);
  // Level height comes from the finished tree, so the last step fits; the current forest is
  // centred vertically with all leaves on one baseline.
  const finalDepth = Math.max(depthOf(forestAfter(text, Infinity).nodes[0]), 1);
  const maxDepth = Math.max(...f.nodes.map(depthOf), 0);
  const dy = Math.min(56, (h - 50) / finalDepth);
  const baseline = (h + maxDepth * dy) / 2;
  let x = 16, pts = [];
  for (const n of f.nodes) {
    const span = ((width - 32) * leafCount(n)) / all;
    pts.push(...layout(n, 0, x, x + span, []).map((p) => ({ ...p, top: baseline - depthOf(n) * dy })));
    x += span;
  }
  const yOf = (p) => p.top + p.depth * dy;
  let s = '';
  for (const p of pts) if (p.parent) {
    const py = p.top + p.parent.depth * dy;
    s += `<line x1="${p.parent.x}" y1="${py}" x2="${p.x}" y2="${yOf(p)}" class="edge"/>`;
    s += `<text x="${(p.parent.x + p.x) / 2 + (p.bit ? 6 : -10)}" y="${(py + yOf(p)) / 2}" class="bit">${p.bit}</text>`;
  }
  for (const p of pts) {
    const hot = f.last && p.n === f.last;
    const label = p.n.l ? p.n.w : `${p.n.s}·${p.n.w}`;
    s += `<g class="${hot ? 'node hot' : 'node'}"><circle cx="${p.x}" cy="${yOf(p)}" r="${p.n.l ? 13 : 15}"/><text x="${p.x}" y="${yOf(p) + 3.5}" text-anchor="middle">${label}</text></g>`;
  }
  if (showCodes) {
    const c = codes(f.nodes[0]);
    const entries = Object.entries(c).sort((a, b) => a[1].length - b[1].length);
    const col = (width - 32) / entries.length;
    entries.forEach(([sym, code], i) => (s += `<text x="${16 + i * col}" y="${height - 14}" class="code">${sym} → ${code}</text>`));
  }
  root.innerHTML = `<svg width="${width}" height="${height}">${s}</svg>`;
});
