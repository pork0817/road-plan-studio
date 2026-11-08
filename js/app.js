// Road Plan Studio — editor
(function () {
  const G = window.G, R = window.Render;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#canvas'), ctx = canvas.getContext('2d'), stage = $('#stage');

  const S = {
    country: 'TW', img: null, imgSrc: null, w: 2400, h: 1600, ppm: 0,
    els: [], sel: null, hover: null,
    tool: 'select', item: null, params: null,
    view: { x: 40, y: 40, s: 0.5 },
    draft: null, mouseS: { x: 0, y: 0 }, mouseW: { x: 0, y: 0 }, snap: null,
    imgOpacity: 1, roadOpacity: 1, clip: true, magnet: true, align: null,
    hist: [], fut: [], cur: '[]', drag: null, space: false, measure: null,
  };
  const P = () => window.RoadPresets[S.country];
  const ppm = () => S.ppm || 8;
  let uid = 1;
  const newId = () => 'e' + Date.now().toString(36) + (uid++);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let needs = true;
  const redraw = () => { needs = true; };

  // ---------------- coordinates ----------------
  const toWorld = (sx, sy) => ({ x: (sx - S.view.x) / S.view.s, y: (sy - S.view.y) / S.view.s });
  const toScreen = (p) => ({ x: p.x * S.view.s + S.view.x, y: p.y * S.view.s + S.view.y });

  function fitView() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    const s = Math.min(W / S.w, H / S.h) * 0.95;
    S.view = { s, x: (W - S.w * s) / 2, y: (H - S.h * s) / 2 };
    redraw();
  }

  // ---------------- history ----------------
  const snapshot = () => JSON.stringify({ els: S.els, ppm: S.ppm });
  function commit() {
    syncAll();
    const now = snapshot();
    if (now !== S.cur) { S.hist.push(S.cur); if (S.hist.length > 300) S.hist.shift(); S.cur = now; S.fut = []; autosave(); }
    renderProps(); redraw();
  }
  function restore(snap) {
    const o = JSON.parse(snap); S.els = o.els || []; S.ppm = o.ppm || 0; S.cur = snap;
    if (!S.els.find((e) => e.id === S.sel)) S.sel = null;
    renderProps(); redraw(); autosave();
  }
  const undo = () => { if (S.hist.length) { S.fut.push(S.cur); restore(S.hist.pop()); } };
  const redo = () => { if (S.fut.length) { S.hist.push(S.cur); restore(S.fut.pop()); } };

  let saveTimer = null;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const data = { v: 1, country: S.country, ppm: S.ppm, els: S.els, imgSrc: S.imgSrc };
      try { localStorage.setItem('roadplan:auto', JSON.stringify(data)); }
      catch (e) { try { data.imgSrc = null; localStorage.setItem('roadplan:auto', JSON.stringify(data)); } catch (e2) { /* storage unavailable */ } }
    }, 400);
  }

  // ---------------- lanes / auto-alignment ----------------
  function laneAt(p, excludeId) {
    let best = null;
    const maxD = 40 * ppm();
    for (const el of S.els) {
      if (el.id === excludeId) continue;
      const isLane = el.type === 'section' || (el.type === 'line' && !(P().lineStyles[el.style] || {}).curb);
      if (!isLane) continue;
      const pts = R.basePts(el, ppm());
      if (pts.length < 2) continue;
      const r = G.nearestOnPolyline(p, pts);
      if (!r || r.d > maxD || (best && r.d >= best.d)) continue;
      // Beyond the end of a lane (e.g. across an intersection) doesn't count — only alongside it.
      const pastStart = r.i === 0 && r.t <= 0, pastEnd = r.i === pts.length - 2 && r.t >= 1;
      if ((pastStart || pastEnd) && G.dot(G.sub(p, r.proj), r.tangent) * (pastStart ? -1 : 1) > 3 * ppm()) continue;
      let t = r.tangent;
      if (el.type === 'section' && el.lanesB > 0 && G.dot(G.sub(p, r.proj), G.rightN(t)) < 0) t = G.mul(t, -1);
      best = { d: r.d, t };
    }
    return best;
  }

  function alignTwo(el, square) {
    const ln = laneAt(G.mid(el.a, el.b), el.id);
    const u = G.norm(G.sub(el.b, el.a));
    if (!ln) { if (el.dir == null) el.dir = G.angle(G.leftN(u)); return false; }
    const t = ln.t, n = G.rightN(t);
    const cosA = Math.abs(G.dot(u, n));
    if (square || cosA > Math.cos((12 * Math.PI) / 180)) {
      const L = G.dot(G.sub(el.b, el.a), n);
      el.b = G.add(el.a, G.mul(n, L));
    }
    el.dir = G.angle(t);
    return true;
  }
  function alignPoint(el) {
    const c = el.p || G.centroid(el.pts);
    const ln = laneAt(c, el.id);
    if (ln) el.dir = G.angle(ln.t);
    return !!ln;
  }

  // ---------------- elements ----------------
  function buildElement(item, geom) {
    const el = Object.assign({ id: newId() }, clone(S.params || item.defaults), geom);
    if (el.type === 'crosswalk' || el.type === 'stopline' || el.type === 'scooterbox' || el.type === 'yield') { el.dir = null; alignTwo(el, false); }
    if (el.type === 'yield') el.lanes = Math.max(1, Math.round(G.dist(el.a, el.b) / ppm() / 3.25));
    if (el.type === 'arrow' || el.type === 'text' || el.type === 'symbol' || el.type === 'chevron' || el.type === 'yellowbox') alignPoint(el);
    return el;
  }
  const findEl = (id) => S.els.find((e) => e.id === id);

  function hitRank(el) {
    return { junction: 0.5, roundabout: 0.6, yield: 3.6, sidewalk: 5, arrow: 4, text: 4, stopline: 4, crosswalk: 3.5, scooterbox: 3.4, line: 3, chevron: 2.5, yellowbox: 2.5, surface: 2, section: 1, road: 0 }[el.type] || 0;
  }
  function hitTest(w) {
    const tol = 6 / S.view.s;
    const order = S.els.map((e, i) => [e, i]).sort((a, b) => hitRank(b[0]) - hitRank(a[0]) || b[1] - a[1]);
    for (const [el] of order) {
      const sh = R.shape(el, ppm(), P());
      if (!sh) continue;
      if (sh.poly && sh.poly.length >= 3 && G.pointInPoly(w, sh.poly)) return el;
      if (sh.line && sh.line.length >= 2) { const r = G.nearestOnPolyline(w, sh.line); if (r && r.d <= sh.w / 2 + tol) return el; }
    }
    return null;
  }

  function handlesOf(el) {
    if (!el) return [];
    if (el.pts) {
      // vertices, plus a "+" handle in the middle of every segment: drag it to add a point there
      const hs = el.pts.map((p, i) => ({ key: 'pts', i, p }));
      const open = ['line', 'section'].includes(el.type);
      const n = el.pts.length, segs = open ? n - 1 : n;
      for (let i = 0; i < segs; i++) {
        const mid = el.smooth && open && n > 2 ? catmullMid(el.pts, i) : G.mid(el.pts[i], el.pts[(i + 1) % n]);
        hs.push({ key: 'ins', i, p: mid });
      }
      return hs;
    }
    if (el.type === 'roundabout') return [{ key: 'p', p: el.p }, { key: 'rad', p: { x: el.p.x + el.R * ppm(), y: el.p.y } }];
    if (el.a) {
      const m = G.mid(el.a, el.b), t = G.fromAngle(el.dir || 0);
      const ext = (el.type === 'crosswalk' ? el.width / 2 : el.type === 'scooterbox' ? el.depth : el.type === 'yield' ? 0 : el.width / 2) + 1.5;
      return [{ key: 'a', p: el.a }, { key: 'b', p: el.b }, { key: 'rot2', p: G.add(m, G.mul(t, ext * ppm())) }];
    }
    if (el.p) {
      const len = (el.type === 'arrow' ? el.length : el.type === 'symbol' ? R.iconSize(el)[1] : R.textLength(el)) * ppm();
      return [{ key: 'p', p: el.p }, { key: 'rot', p: G.add(el.p, G.mul(G.fromAngle(el.dir), len / 2 + 1.2 * ppm())) }];
    }
    return [];
  }
  function catmullMid(pts, i) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)], t = 0.5;
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }
  function hitHandle(sx, sy) {
    const el = findEl(S.sel);
    for (const h of handlesOf(el)) { const s = toScreen(h.p); if (Math.hypot(s.x - sx, s.y - sy) < 8) return h; }
    return null;
  }

  function moveEl(el, orig, d) {
    if (orig.pts) el.pts = orig.pts.map((p) => G.add(p, d));
    if (orig.a) { el.a = G.add(orig.a, d); el.b = G.add(orig.b, d); }
    if (orig.p) el.p = G.add(orig.p, d);
  }

  // ---------------- snapping ----------------
  // Angle magnet: snap an angle to horizontal/vertical, or parallel/perpendicular to the nearest lane, when close.
  const MAG_TOL = 3 * Math.PI / 180;
  function magnetAngle(a, near, excludeId) {
    S.magHit = null;
    if (!S.magnet) return a;
    const cands = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((v) => ({ v, why: v % Math.PI ? '垂直 vertical' : '水平 horizontal' }));
    const ln = near && laneAt(near, excludeId);
    if (ln) { const la = G.angle(ln.t); for (let k = 0; k < 4; k++) cands.push({ v: la + k * Math.PI / 2, why: k % 2 ? '垂直車道 ⊥ lane' : '平行車道 ∥ lane' }); }
    let best = null, bd = MAG_TOL;
    for (const c of cands) { const d = Math.abs(Math.atan2(Math.sin(a - c.v), Math.cos(a - c.v))); if (d < bd) { bd = d; best = c; } }
    if (!best) return a;
    S.magHit = best.why;
    return best.v;
  }
  function snapW(w, prev, ev, excludeId) {
    S.snap = null; S.magHit = null;
    if (ev && ev.altKey) return w;
    if (prev && ev && ev.shiftKey) {
      const d = G.sub(w, prev), a = Math.round(G.angle(d) / (Math.PI / 12)) * (Math.PI / 12), l = G.len(d);
      return G.add(prev, G.mul(G.fromAngle(a), l));
    }
    if (!S.magnet) return w;
    const tol = 9 / S.view.s;
    let best = null, bd = tol;
    for (const el of S.els) {
      if (el.id === excludeId) continue;
      const cand = el.pts || (el.a ? [el.a, el.b] : []);
      for (const p of cand) { const d = G.dist(p, w); if (d < bd) { bd = d; best = p; } }
    }
    if (S.draft && S.draft.pts && S.draft.pts.length > 2) { const p0 = S.draft.pts[0]; if (G.dist(p0, w) < bd) best = p0; }
    if (best) { S.snap = best; return G.copy(best); }
    if (prev && G.dist(w, prev) > 4 / S.view.s) {
      const d = G.sub(w, prev), a0 = G.angle(d), a = magnetAngle(a0, prev, excludeId);
      if (a !== a0) return G.add(prev, G.mul(G.fromAngle(a), G.len(d)));
    }
    return w;
  }

  // ---------------- tools ----------------
  const BASIC = [
    { id: 'select', label: '選取', en: 'Select / edit (V)', glyph: '⬉' },
    { id: 'pan', label: '平移', en: 'Pan (H / Space)', glyph: '✋' },
    { id: 'calibrate', label: '校正比例尺', en: 'Calibrate scale', glyph: '📏' },
    { id: 'measure', label: '量測', en: 'Measure (M)', glyph: '↔' },
  ];
  function findItem(id) { for (const g of P().library) for (const it of g.items) if (it.id === id) return it; return null; }

  function setTool(id) {
    S.draft = null; S.measure = null;
    const item = findItem(id);
    if (item) { S.tool = 'item'; S.item = item; S.params = clone(item.defaults); S.sel = null; }
    else { S.tool = id; S.item = null; S.params = null; }
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    stage.style.cursor = S.tool === 'pan' ? 'grab' : S.tool === 'select' ? 'default' : 'crosshair';
    renderProps(); updateHint(); redraw();
  }

  function updateHint() {
    let h = '';
    if (S.align && !S.align.tgtId) h = '📐 點選要對齊的目標物件 (停止線、行人穿越道、車道、箭頭…)，<kbd>Esc</kbd> 取消';
    else if (S.align) h = '📐 已對齊 — 可在右側調整間距 / 端點，按「完成」結束';
    else if (S.tool === 'select') h = '點選物件編輯，拖曳控制點修改；拖曳邊上的 ⊕ 新增節點，Alt+點節點刪除。<kbd>Del</kbd> 刪除 <kbd>⌘D</kbd> 複製 <kbd>[ ]</kbd> 旋轉';
    else if (S.tool === 'pan') h = '拖曳平移；⌘/Ctrl+滾輪或觸控板捏合縮放';
    else if (S.tool === 'calibrate') h = '在圖上點兩點 (例如 Google 地圖比例尺兩端)，再輸入實際距離 (公尺)';
    else if (S.tool === 'measure') h = '點兩點量測距離';
    else if (S.item) {
      const m = S.item.mode;
      if (m === 'poly') h = '逐點點擊描繪範圍，<kbd>Enter</kbd>/雙擊/點回起點 完成，<kbd>⌫</kbd> 退一點，<kbd>Esc</kbd> 取消，<kbd>Shift</kbd> 鎖角度，<kbd>Alt</kbd> 不吸附';
      if (m === 'polyline') h = '沿道路中心 (或標線位置) 逐點點擊，<kbd>Enter</kbd>/雙擊 完成。畫線方向的右側=順向車道';
      if (m === 'two') h = '從道路一側點到另一側 — 會自動對齊最近車道方向 (與車流同向)';
      if (m === 'roundabout') h = '點圓環中心 — 已畫好的路段若接到圓環，會自動產生入口讓路線與行人穿越道';
      if (m === 'junction') h = '點兩條路段 (路段中心線) 的交會處 — 自動產生路口範圍、行人穿越道與停止線';
      if (m === 'point') h = '點擊放置 — 自動對齊最近車道的行車方向；<kbd>[ ]</kbd> 旋轉，<kbd>F</kbd> 反轉';
    }
    $('#stHint').innerHTML = h;
  }

  function finishDraft() {
    const d = S.draft;
    if (!d || !d.pts) return;
    const pts = d.pts.filter((p, i) => i === 0 || G.dist(p, d.pts[i - 1]) > 0.5);
    const min = S.item.mode === 'poly' ? 3 : 2;
    if (pts.length >= min) {
      const el = buildElement(S.item, { pts });
      S.els.push(el); S.sel = el.id;
    }
    S.draft = null;
    commit();
  }

  function draftPreview() {
    if (S.tool !== 'item' || !S.item) return null;
    const m = S.item.mode, w = S.mouseW;
    try {
      if ((m === 'poly' || m === 'polyline') && S.draft && S.draft.pts.length) {
        const pts = S.draft.pts.concat([w]);
        if (pts.length < 2) return null;
        return Object.assign({ id: '_preview' }, clone(S.params), { pts });
      }
      if (m === 'two' && S.draft && S.draft.a && G.dist(S.draft.a, w) > 1) {
        const el = Object.assign({ id: '_preview' }, clone(S.params), { a: S.draft.a, b: G.copy(w), dir: null });
        alignTwo(el, false); return el;
      }
      if (m === 'roundabout' && !S.drag) {
        return { id: '_preview', type: 'roundabout', p: G.copy(w), R: S.params.R, lanes: S.params.turbo ? 2 : S.params.lanes, laneWidth: S.params.laneWidth, apron: S.params.turbo ? 0 : S.params.apron, island: S.params.island, turbo: !!S.params.turbo, divider: S.params.divider, turboAxis: 0, turboTaper: 20, legs: [] };
      }
      if (m === 'point' && !S.drag) {
        const el = Object.assign({ id: '_preview' }, clone(S.params), { p: G.copy(w) });
        alignPoint(el); return el;
      }
    } catch (e) { return null; }
    return null;
  }

  // ---------------- rendering ----------------
  function render() {
    const dpr = window.devicePixelRatio || 1;
    const W = stage.clientWidth, H = stage.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#111316'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(S.view.x, S.view.y); ctx.scale(S.view.s, S.view.s);
    R.drawScene(ctx, {
      img: S.img, w: S.w, h: S.h, imgOpacity: S.imgOpacity, roadOpacity: S.roadOpacity, clip: S.clip,
      els: S.els, ppm: ppm(), P: P(), preview: draftPreview(), background: S.img ? null : '#4a4d51',
    });
    ctx.restore();
    drawOverlay(W, H);
  }

  function strokeShape(sh, color, width, keepDash) {
    ctx.strokeStyle = color; ctx.lineWidth = width; if (!keepDash) ctx.setLineDash([]);
    if (sh.poly && sh.poly.length >= 2) { R.path(ctx, sh.poly.map(toScreen), true); ctx.stroke(); }
    else if (sh.line && sh.line.length >= 2) { R.path(ctx, sh.line.map(toScreen)); ctx.stroke(); }
  }

  function drawOverlay(W, H) {
    const tl = toScreen({ x: 0, y: 0 }), br = toScreen({ x: S.w, y: S.h });
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1; ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

    if (S.hover && S.hover !== S.sel && S.tool === 'select') {
      const el = findEl(S.hover); const sh = el && R.shape(el, ppm(), P());
      if (sh) strokeShape(sh, '#3fb6ff88', 1.5);
    }
    for (const j of S.els) if (j.type === 'junction' && j.pts.length > 2) {
      ctx.setLineDash([6, 5]); strokeShape({ poly: j.pts }, '#c58cff99', 1.2, true); ctx.setLineDash([]);
    }
    const sel = findEl(S.sel);
    if (sel) {
      const sh = R.shape(sel, ppm(), P());
      if (sh) strokeShape(sh, '#3fb6ff', 1.5);
      if (sel.type === 'section' || sel.type === 'line') { ctx.setLineDash([4, 4]); strokeShape({ line: sel.pts }, '#ffffffaa', 1, true); ctx.setLineDash([]); }
      for (const h of handlesOf(sel)) {
        const s = toScreen(h.p);
        const isRot = h.key === 'rot' || h.key === 'rot2' || h.key === 'rad';
        if (h.key === 'ins') {
          ctx.fillStyle = '#1e6fa8cc'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(s.x, s.y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(s.x - 3, s.y); ctx.lineTo(s.x + 3, s.y); ctx.moveTo(s.x, s.y - 3); ctx.lineTo(s.x, s.y + 3); ctx.stroke();
          continue;
        }
        ctx.fillStyle = isRot ? '#f0b429' : '#fff'; ctx.strokeStyle = '#1e6fa8'; ctx.lineWidth = 2;
        ctx.beginPath();
        if (isRot) ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); else ctx.rect(s.x - 4.5, s.y - 4.5, 9, 9);
        ctx.fill(); ctx.stroke();
      }
    }
    // draft polyline guide
    if (S.draft && S.draft.pts) {
      const pts = S.draft.pts.concat([S.mouseW]).map(toScreen);
      ctx.strokeStyle = '#3fb6ff'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
      R.path(ctx, pts, S.item.mode === 'poly'); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      S.draft.pts.forEach((p) => { const s = toScreen(p); ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
    }
    if (S.draft && S.draft.a) {
      const a = toScreen(S.draft.a), b = toScreen(S.mouseW);
      ctx.strokeStyle = '#3fb6ff'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }
    // measure / calibrate
    const m = S.measure;
    if (m && m.a) {
      const a = toScreen(m.a), bW = m.b || S.mouseW, b = toScreen(bW);
      ctx.strokeStyle = S.tool === 'calibrate' ? '#f0b429' : '#4cc38a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      [a, b].forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.stroke(); });
      const dpx = G.dist(m.a, bW);
      const label = S.tool === 'calibrate' ? dpx.toFixed(0) + ' px' : (dpx / ppm()).toFixed(2) + ' m' + (S.ppm ? '' : ' (未校正)');
      pill(label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 14);
    }
    if (S.align) {
      const tg = findEl(S.align.tgtId);
      if (tg) { const sh = R.shape(tg, ppm(), P()); if (sh) strokeShape(sh, '#f0b429', 2); }
      else if (S.hover && S.hover !== S.align.srcId) { const hv = findEl(S.hover); const sh = hv && R.shape(hv, ppm(), P()); if (sh) strokeShape(sh, '#f0b429aa', 2); }
    }
    if (S.magHit && (S.drag || S.draft)) pill('🧲 ' + S.magHit, S.mouseS.x + 60, S.mouseS.y - 18);
    if (S.snap) { const s = toScreen(S.snap); ctx.strokeStyle = '#f0b429'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.stroke(); }
    drawScaleBar(H);
  }

  function pill(text, x, y) {
    ctx.font = '12px -apple-system, sans-serif';
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = '#000000cc'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }

  function drawScaleBar(H) {
    const pxPerM = ppm() * S.view.s;
    const nice = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    let m = nice[0];
    for (const n of nice) { if (n * pxPerM <= 160) m = n; }
    const L = m * pxPerM, x = 16, y = H - 22;
    ctx.fillStyle = '#000000aa'; ctx.beginPath(); ctx.roundRect(x - 8, y - 22, L + 70, 34, 6); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + L, y); ctx.lineTo(x + L, y - 5); ctx.stroke();
    ctx.fillStyle = S.ppm ? '#fff' : '#f0b429'; ctx.font = '12px -apple-system, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(m + ' m' + (S.ppm ? '' : '  未校正 not calibrated'), x, y - 9);
  }

  // ---------------- mouse ----------------
  function evPos(e) { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  stage.addEventListener('mousedown', (e) => {
    stage.focus();
    const s = evPos(e), w = toWorld(s.x, s.y);
    if (e.button === 1 || S.space || S.tool === 'pan') { S.drag = { kind: 'pan', s0: s, v0: { ...S.view } }; stage.style.cursor = 'grabbing'; e.preventDefault(); return; }
    if (e.button === 2) return;

    if (S.tool === 'select' && S.align && !S.align.tgtId) {
      pickAlignTarget(hitTest(w)); return;
    }
    if (S.tool === 'select') {
      const h = hitHandle(s.x, s.y);
      const sel = findEl(S.sel);
      if (h && e.altKey && h.key === 'pts') {
        const min = ['line', 'section'].includes(sel.type) ? 2 : 3;
        if (sel.pts.length > min) { sel.pts.splice(h.i, 1); commit(); }
        return;
      }
      if (h && h.key === 'ins') {
        // insert a new point on that segment and start dragging it
        sel.pts.splice(h.i + 1, 0, G.copy(h.p));
        S.drag = { kind: 'handle', h: { key: 'pts', i: h.i + 1, p: sel.pts[h.i + 1] }, orig: clone(sel), moved: true };
        redraw(); return;
      }
      if (h) { S.drag = { kind: 'handle', h, orig: clone(sel), moved: false }; return; }
      const el = hitTest(w);
      if (el) { if (S.align && el.id !== S.align.srcId) endAlign(false); S.sel = el.id; S.drag = { kind: 'move', w0: w, orig: clone(el), moved: false }; renderProps(); redraw(); return; }
      if (S.align) endAlign(false);
      S.sel = null; renderProps();
      S.drag = { kind: 'pan', s0: s, v0: { ...S.view } };
      redraw(); return;
    }
    if (S.tool === 'calibrate' || S.tool === 'measure') {
      const p = snapW(w, S.measure && S.measure.a, e);
      if (!S.measure || S.measure.b) S.measure = { a: p };
      else {
        S.measure.b = p;
        if (S.tool === 'calibrate') {
          const dpx = G.dist(S.measure.a, S.measure.b);
          setTimeout(() => {
            const v = prompt('這段距離實際是幾公尺？ Real-world length of this line (metres):', S.ppm ? (dpx / S.ppm).toFixed(2) : '20');
            const m = parseFloat(v);
            if (m > 0 && dpx > 2) { S.ppm = dpx / m; commit(); setTool('select'); }
            S.measure = null; redraw();
          }, 10);
        }
      }
      redraw(); return;
    }
    if (S.tool === 'item') {
      const m = S.item.mode;
      if (m === 'poly' || m === 'polyline') {
        if (!S.draft) S.draft = { pts: [] };
        const prev = S.draft.pts[S.draft.pts.length - 1];
        const p = snapW(w, prev, e);
        if (m === 'poly' && S.draft.pts.length > 2 && G.dist(p, S.draft.pts[0]) < 1e-6) { finishDraft(); return; }
        S.draft.pts.push(p);
      } else if (m === 'two') {
        const p = snapW(w, S.draft && S.draft.a, e);
        if (!S.draft) S.draft = { a: p };
        else if (G.dist(S.draft.a, p) > 2) {
          const el = buildElement(S.item, { a: S.draft.a, b: p });
          S.els.push(el); S.sel = el.id; S.draft = null; commit();
        }
      } else if (m === 'roundabout') {
        const rb = buildRoundabout(w, S.params);
        if (rb.turbo) {
          // put the spiral step just upstream of the busiest entry, so its traffic can pick the new inner lane
          const legs = rbLegs(rb).filter((l) => l.incoming).sort((p, q) => q.lanes - p.lanes);
          if (legs.length) {
            // centre the spiral step on the main road; the blend spans the road's mouth
            rb.turboAxis = G.angle(G.sub(legs[0].X, rb.p));
            const half = Math.asin(Math.min(0.95, (Math.max(legs[0].leftExt, legs[0].rightExt) + 1) / rb.R)) * 180 / Math.PI;
            rb.turboTaper = Math.round(G.clamp(half + 4, 12, 40));
          }
        }
        S.els.push(rb); syncRoundabout(rb); S.sel = rb.id; commit(); setTool('select'); S.sel = rb.id; renderProps();
      } else if (m === 'junction') {
        const made = buildJunction(w, S.params);
        if (made) { S.els.push(...made); S.sel = made[0].id; commit(); setTool('select'); S.sel = made[0].id; renderProps(); }
      } else if (m === 'point') {
        const el = buildElement(S.item, { p: w });
        S.els.push(el); S.sel = el.id; commit();
      }
      redraw();
    }
  });

  window.addEventListener('mousemove', (e) => {
    const s = evPos(e), w = toWorld(s.x, s.y);
    S.mouseS = s; S.mouseW = w;
    const d = S.drag;
    if (d) {
      if (d.kind === 'pan') { S.view.x = d.v0.x + (s.x - d.s0.x); S.view.y = d.v0.y + (s.y - d.s0.y); }
      else if (d.kind === 'move') { const el = findEl(S.sel); moveEl(el, d.orig, G.sub(w, d.w0)); d.moved = true; if (el.type === 'roundabout') syncRoundabout(el); }
      else if (d.kind === 'handle') {
        const el = findEl(S.sel), h = d.h;
        const o = d.orig;
        const rotSnap = (a, near) => (e.shiftKey ? Math.round(a / (Math.PI / 12)) * (Math.PI / 12) : e.altKey ? a : magnetAngle(a, near, el.id));
        if (h.key === 'pts') {
          const nb = o.pts[h.i - 1] || o.pts[h.i + 1];
          el.pts[h.i] = snapW(w, nb, e, el.id);
        } else if (h.key === 'p') el.p = snapW(w, null, e, el.id);
        else if (h.key === 'rad') el.R = G.clamp(Math.round((G.dist(w, el.p) / ppm()) * 2) / 2, el.turbo ? 3 + 2 * el.laneWidth + 0.45 + (el.laneWidth + 0.45) / 2 : 8, 70);
        else if (h.key === 'a' || h.key === 'b') {
          // keep the crossing square to traffic: the dragged end slides along the line through the other end
          const other = h.key === 'a' ? o.b : o.a;
          let p = snapW(w, null, e, el.id);
          if (!e.altKey) { const n = G.rightN(G.fromAngle(o.dir)); p = G.add(other, G.mul(n, G.dot(G.sub(p, other), n))); }
          el[h.key] = p;
        } else if (h.key === 'rot') {
          el.dir = rotSnap(G.angle(G.sub(w, el.p)), el.p);
        } else if (h.key === 'rot2') {
          // rotate the whole crosswalk / stop line / box about its centre
          const m = G.mid(o.a, o.b);
          const nd = rotSnap(G.angle(G.sub(w, m)), m), da = nd - o.dir;
          const rot = (q) => { const v = G.sub(q, m), c = Math.cos(da), sn = Math.sin(da); return { x: m.x + v.x * c - v.y * sn, y: m.y + v.x * sn + v.y * c }; };
          el.a = rot(o.a); el.b = rot(o.b); el.dir = nd;
        }
        d.moved = true;
        if (el.type === 'roundabout') syncRoundabout(el);
      }
      redraw();
    } else {
      if (S.tool === 'item' || S.tool === 'calibrate' || S.tool === 'measure') {
        const prev = S.draft ? (S.draft.pts ? S.draft.pts[S.draft.pts.length - 1] : S.draft.a) : (S.measure && !S.measure.b ? S.measure.a : null);
        S.mouseW = snapW(w, prev, e);
        redraw();
      } else if (S.tool === 'select' && e.target === canvas) {
        const el = hitTest(w); const id = el ? el.id : null;
        const onHandle = !!hitHandle(s.x, s.y);
        stage.style.cursor = onHandle ? 'pointer' : el ? 'move' : 'default';
        if (id !== S.hover) { S.hover = id; redraw(); }
      }
    }
    $('#stInfo').textContent = `x ${w.x.toFixed(0)}, y ${w.y.toFixed(0)} px  |  ${S.ppm ? (1 / S.ppm).toFixed(3) + ' m/px' : '未校正比例尺 — not calibrated'}  |  zoom ${(S.view.s * 100).toFixed(0)}%`;
  });

  window.addEventListener('mouseup', () => {
    const d = S.drag;
    if (!d) return;
    S.drag = null;
    if (d.kind === 'pan') stage.style.cursor = S.tool === 'pan' ? 'grab' : S.tool === 'select' ? 'default' : 'crosshair';
    if (d.moved) commit();
  });

  stage.addEventListener('dblclick', (e) => {
    const s = evPos(e), w = toWorld(s.x, s.y);
    if (S.tool === 'item' && S.draft && S.draft.pts) {
      // remove the duplicate point added by the second click
      S.draft.pts.pop();
      finishDraft(); return;
    }
    if (S.tool === 'select') {
      const el = findEl(S.sel);
      if (el && el.pts) {
        const closed = !['line', 'section'].includes(el.type);
        const r = G.nearestOnPolyline(w, el.pts, closed);
        if (r && r.d < 10 / S.view.s) { el.pts.splice(r.i + 1, 0, r.proj); commit(); }
      }
    }
  });

  stage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (S.draft && S.draft.pts) finishDraft();
    else if (S.draft) { S.draft = null; redraw(); }
  });

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const s = evPos(e);
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const k = Math.exp(-e.deltaY * (e.ctrlKey && !mouseWheel ? 0.01 : 0.0015));
      const ns = G.clamp(S.view.s * k, 0.02, 40);
      const w = toWorld(s.x, s.y);
      S.view.s = ns; S.view.x = s.x - w.x * ns; S.view.y = s.y - w.y * ns;
    } else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; }
    redraw();
  }, { passive: false });

  // ---------------- keyboard ----------------
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const mod = e.metaKey || e.ctrlKey;
    const sel = findEl(S.sel);
    if (e.code === 'Space') { if (!S.space) { S.space = true; stage.style.cursor = 'grab'; } e.preventDefault(); return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (sel) duplicate(sel); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
    if (mod) return;
    if (e.key === 'Escape' && S.align) { endAlign(!S.align.tgtId ? false : false); return; }
    if (e.key === 'Escape') {
      if (S.draft || S.measure) { S.draft = null; S.measure = null; }
      else if (S.tool !== 'select') setTool('select');
      else S.sel = null;
      renderProps(); redraw(); return;
    }
    if (e.key === 'Enter') { if (S.draft && S.draft.pts) finishDraft(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (S.draft && S.draft.pts && S.draft.pts.length) { S.draft.pts.pop(); if (!S.draft.pts.length) S.draft = null; redraw(); }
      else if (S.draft) { S.draft = null; redraw(); }
      else if (sel) deleteEl(sel.id);
      return;
    }
    if (e.key === 'v') setTool('select');
    if (e.key === 'h') setTool('pan');
    if (e.key === 'm') setTool('measure');
    if (e.key === '0') fitView();
    if (sel && sel.dir != null && (e.key === '[' || e.key === ']')) {
      sel.dir += (e.key === ']' ? 1 : -1) * (e.shiftKey ? Math.PI / 2 : Math.PI / 12); commit();
    }
    if (sel && e.key === 'f') doAction('flip');
    if (sel && e.key === 'a') startAlign();
    if (sel && e.key.startsWith('Arrow')) {
      const k = (e.shiftKey ? 10 : 1) / S.view.s;
      const d = { ArrowLeft: { x: -k, y: 0 }, ArrowRight: { x: k, y: 0 }, ArrowUp: { x: 0, y: -k }, ArrowDown: { x: 0, y: k } }[e.key];
      moveEl(sel, clone(sel), d); e.preventDefault(); commit();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { S.space = false; stage.style.cursor = S.tool === 'pan' ? 'grab' : S.tool === 'select' ? 'default' : 'crosshair'; }
  });

  function deleteEl(id) {
    const el = findEl(id);
    if (el && el.owner) { const o = findEl(el.owner); if (o && o.type === 'roundabout' && el.legKey) (o.removed = o.removed || []).push(el.type + ':' + el.legKey); }
    // deleting an intersection or roundabout also deletes the markings it generated
    S.els = S.els.filter((e) => e.id !== id && e.owner !== id);
    if (S.sel === id || !findEl(S.sel)) S.sel = null;
    commit();
  }
  function duplicate(el) {
    const c = clone(el); c.id = newId(); delete c.owner; delete c.legKey; delete c.anchor;
    moveEl(c, clone(c), { x: 2 * ppm(), y: 2 * ppm() });
    S.els.push(c); S.sel = c.id; commit();
  }

  function doAction(a) {
    const el = findEl(S.sel);
    if (!el) return;
    if (a === 'flip') {
      if (el.dir != null) el.dir += Math.PI;
      if (el.type === 'line' || el.type === 'section') el.pts.reverse();
    }
    if (a === 'realign') { if (el.a) alignTwo(el, false); else if (!alignPoint(el)) alert('附近找不到車道 — 請先畫路段或車道線。No lane found nearby.'); }
    if (a === 'square') alignTwo(el, true);
    if (a === 'addStop' && el.type === 'crosswalk') {
      const f = R.frame(el, ppm(), el.width, false);
      const spec = P().stopLine, sw = spec.width.max;
      const off = G.mul(f.t, -(f.back + ((spec.toCrosswalk.min + sw / 2) * ppm()) / f.sin));
      const s = { id: newId(), type: 'stopline', width: sw, a: G.add(el.a, off), b: G.add(el.b, off), dir: el.dir };
      S.els.push(s); S.sel = s.id;
    }
    if (a === 'regen' && el.type === 'roundabout') { regenerateRoundabout(el); return; }
    if (a === 'rotL') el.dir -= Math.PI / 12;
    if (a === 'rotR') el.dir += Math.PI / 12;
    commit();
  }


  // ---------------- align two objects ----------------
  const BAND = new Set(['crosswalk', 'stopline', 'scooterbox', 'yield']);
  const POINT = new Set(['arrow', 'text', 'symbol']);
  const canAlign = (el) => el && el.type !== 'junction';
  const centerOf = (el) => (el.a ? G.mid(el.a, el.b) : el.p ? el.p : G.centroid(el.pts));
  function dirOf(el, near) {
    if (el.a || el.p) return el.dir || 0;
    const pts = R.basePts(el, ppm());
    const r = G.nearestOnPolyline(near || G.centroid(pts), pts, !['line', 'section'].includes(el.type));
    if (!r) return 0;
    let t = r.tangent;
    if (el.type === 'section' && el.lanesB > 0 && near && G.dot(G.sub(near, r.proj), G.rightN(t)) < 0) t = G.mul(t, -1);
    return G.angle(t);
  }
  // how far (px) a band element reaches from its a→b line on the side of unit normal n
  function bandExtent(el, n) {
    if (el.type === 'scooterbox') return G.dot(G.fromAngle(el.dir), n) > 0 ? el.depth * ppm() : 0;
    if (el.type === 'yield') return G.dot(G.fromAngle(el.dir), n) > 0 ? 0 : R.YIELD_DEPTH * ppm();
    return (el.width / 2) * ppm();
  }
  function defaultGap(src, tgt) {
    const pair = new Set([src.type, tgt.type]);
    if (pair.has('crosswalk') && pair.has('stopline')) return P().stopLine.toCrosswalk.min; // §170 淨距 2–3 m
    return 0;
  }
  function startAlign() {
    const el = findEl(S.sel);
    if (!canAlign(el)) return;
    if (S.tool !== 'select') setTool('select');
    S.sel = el.id;
    S.align = { srcId: el.id, orig: clone(el), tgtId: null, opts: { gap: 0, ends: false, axis: false, parallel: true, frame: 'target', ax: null, ay: null } };
    renderProps(); updateHint(); redraw();
  }
  function endAlign(cancel) {
    if (!S.align) return;
    if (cancel) { const el = findEl(S.align.srcId); if (el) Object.assign(el, clone(S.align.orig)); commit(); }
    S.align = null; renderProps(); updateHint(); redraw();
  }
  function applyAlign() {
    const A = S.align, src = findEl(A.srcId), tgt = findEl(A.tgtId);
    if (!src || !tgt) return;
    Object.assign(src, clone(A.orig));
    const o = A.opts;
    if (!o.parallel) { /* translation-only alignment below */ }
    else if (BAND.has(src.type)) {
      const c = centerOf(src), L = G.dist(src.a, src.b);
      let tDir = dirOf(tgt, c);
      if (G.dot(G.fromAngle(tDir), G.fromAngle(src.dir)) < 0) tDir += Math.PI; // keep the source's own traffic sense
      src.dir = tDir;
      if (BAND.has(tgt.type)) {
        const dock = o.ay == null; // edge-to-edge docking unless a top/middle/bottom alignment is chosen
        let uT = G.norm(G.sub(tgt.b, tgt.a));
        if (G.dot(uT, G.sub(src.b, src.a)) < 0) uT = G.mul(uT, -1);
        src.a = G.sub(c, G.mul(uT, L / 2)); src.b = G.add(c, G.mul(uT, L / 2));
        const n = G.rightN(G.norm(G.sub(tgt.b, tgt.a)));
        const dC = G.dot(G.sub(c, tgt.a), n), side = Math.sign(dC) || 1, ns = G.mul(n, side);
        const want = side * (bandExtent(tgt, ns) + o.gap * ppm() + bandExtent(src, G.mul(ns, -1)));
        if (!dock) { /* keep position; ax/ay below */ }
        else if (o.ends && o.ax == null) {
          const tA = G.dot(G.sub(src.a, tgt.a), uT) < G.dot(G.sub(src.b, tgt.a), uT) ? [tgt.a, tgt.b] : [tgt.b, tgt.a];
          const flip = G.dot(G.sub(tgt.b, tgt.a), uT) < 0;
          src.a = G.add(flip ? tgt.b : tgt.a, G.mul(n, want)); src.b = G.add(flip ? tgt.a : tgt.b, G.mul(n, want));
        } else {
          const sh = G.mul(n, want - dC);
          src.a = G.add(src.a, sh); src.b = G.add(src.b, sh);
        }
      } else {
        // square the crossing to the target's direction, keeping its first end and length
        const n = G.rightN(G.fromAngle(tDir));
        const sgn = Math.sign(G.dot(G.sub(src.b, src.a), n)) || 1;
        src.a = G.sub(c, G.mul(n, (sgn * L) / 2)); src.b = G.add(c, G.mul(n, (sgn * L) / 2));
      }
    } else if (POINT.has(src.type)) {
      const tDir = dirOf(tgt, src.p);
      src.dir = G.dot(G.fromAngle(tDir), G.fromAngle(src.dir)) < 0 && !o.matchSense ? tDir + Math.PI : tDir;
      if (o.axis && (tgt.a || tgt.p)) {
        // put the source on the target's centre line (along traffic)
        const c = centerOf(tgt), t = G.fromAngle(tDir);
        src.p = G.add(c, G.mul(t, G.dot(G.sub(src.p, c), t)));
      }
    }
    applyEdgeAlign(src, tgt);
  }
  function alignAxes(tgt, src) {
    if (A_frame() === 'screen') return { F: { x: 0, y: -1 }, Rt: { x: 1, y: 0 } };
    const F = G.fromAngle(dirOf(tgt, centerOf(src)));
    return { F, Rt: G.rightN(F) };
  }
  const A_frame = () => (S.align && S.align.opts.frame) || 'target';
  function extentAlong(el, axis) {
    const sh = R.shape(el, ppm(), P());
    if (!sh) return [0, 0];
    const pts = sh.poly || sh.line, pad = sh.line ? sh.w / 2 : 0;
    let lo = Infinity, hi = -Infinity;
    for (const q of pts) { const v = G.dot(q, axis); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return [lo - pad, hi + pad];
  }
  function shiftToAlign(src, tgt, axis, mode) {
    if (!mode) return;
    const [sl, sh] = extentAlong(src, axis), [tl, th] = extentAlong(tgt, axis);
    const d = mode === 'min' ? tl - sl : mode === 'max' ? th - sh : (tl + th) / 2 - (sl + sh) / 2;
    moveEl(src, clone(src), G.mul(axis, d));
  }
  function applyEdgeAlign(src, tgt) {
    const o = S.align.opts, ax = alignAxes(tgt, src);
    shiftToAlign(src, tgt, ax.Rt, o.ax);
    shiftToAlign(src, tgt, ax.F, o.ay);
  }

  function pickAlignTarget(el) {
    const A = S.align;
    if (!el || el.id === A.srcId) return;
    A.tgtId = el.id;
    const src = findEl(A.srcId);
    A.opts.gap = defaultGap(src, el);
    A.opts.parallel = BAND.has(src.type) || POINT.has(src.type);
    A.opts.frame = (el.a || el.p || ['line', 'section'].includes(el.type)) ? 'target' : 'screen';
    applyAlign(); commit(); updateHint();
  }



  // ---------------- roundabout generator ----------------
  // The roundabout owns its yield lines and crosswalks: they are recomputed from the roundabout and the
  // road sections every time something changes, keeping each piece's own settings (width, type, lanes,
  // and how far a crosswalk was moved along its leg).
  const RB_YD = 0.6; // yield line distance outside the circle (m)
  function rbLegs(rb) {
    const m = ppm(), C = rb.p, legs = [];
    // the outer edge: one circle, or for a turbo roundabout the union of its two offset circles
    const circles = rb.turbo ? [] : [{ c: C, r: rb.R * m, rM: rb.R }];
    const outline = rb.turbo ? R.rbOutline(rb, m) : null;
    for (const el of S.els) {
      if (el.type !== 'section') continue;
      const pts = R.basePts(el, m), L = R.sectionLayout(el);
      const hits = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], d = G.sub(pts[i + 1], a), A = G.dot(d, d);
        if (A === 0) continue;
        if (outline) { // turbo: intersect with the spiral outline polygon; curve the yield around the centre
          for (let j = 0; j < outline.length; j++) {
            const q0 = outline[j], q1 = outline[(j + 1) % outline.length], e = G.sub(q1, q0), den = G.cross(d, e);
            if (Math.abs(den) < 1e-9) continue;
            const sp = G.cross(G.sub(q0, a), e) / den, sq = G.cross(G.sub(q0, a), d) / den;
            if (sp < 0 || sp > 1 || sq < 0 || sq >= 1) continue;
            if (hits.some((h) => Math.abs(h.pos - (i + sp)) < 1e-6)) continue;
            const X = G.add(a, G.mul(d, sp));
            hits.push({ pos: i + sp, X, t: G.norm(d), cc: { c: C, rM: G.dist(X, C) / m } });
          }
        }
        for (const cc of circles) {
          const f = G.sub(a, cc.c), B = 2 * G.dot(f, d), Cc = G.dot(f, f) - cc.r * cc.r, disc = B * B - 4 * A * Cc;
          if (disc < 0) continue;
          for (const root of [-1, 1]) {
            const sp = (-B + root * Math.sqrt(disc)) / (2 * A);
            if (sp < 0 || sp > 1) continue;
            const X = G.add(a, G.mul(d, sp));
            if (circles.some((o) => o !== cc && G.dist(X, o.c) < o.r - 0.5)) continue; // inside the other disc: not on the edge
            hits.push({ pos: i + sp, X, t: G.norm(d), cc });
          }
        }
      }
      hits.sort((p, q) => p.pos - q.pos);
      hits.forEach((h, k) => {
        const { X, t, cc } = h;
        const sgn = G.dot(t, G.sub(X, C)) > 0 ? 1 : -1;
        const v = G.mul(t, sgn), nv = G.rightN(v);
        const rightExt = sgn > 0 ? L.right : L.left, leftExt = sgn > 0 ? L.left : L.right;
        const oneWay = el.lanesB === 0, median = !oneWay && el.centerType === 'median';
        legs.push({ key: el.id + ':' + k, el, X, v, nv, sgn, rightExt, leftExt, oneWay, median, bc: G.copy(cc.c), br: cc.rM,
          incoming: oneWay ? sgn < 0 : true,
          inner: oneWay ? rightExt - 0.3 : -(median ? el.medianWidth / 2 + 0.3 : 0.15),
          lanes: Math.max(1, oneWay ? el.lanesF : (sgn > 0 ? el.lanesB : el.lanesF)) });
      });
    }
    return legs;
  }

  // Curved kerb returns where each road meets the ring: a fillet circle of radius rf tangent to the road
  // edge and to the ring. Stored in px on the roundabout for drawing (paving, edge line, cut-outs, ring gaps).
  function rbCorners(rb, legs) {
    const m = ppm(), C = rb.p, rf = (rb.cornerR != null ? rb.cornerR : 12) * m;
    rb.corners = [];
    legs.forEach((lg, li) => {
      const Rb = G.dist(lg.X, C);
      const angs = [];
      for (const side of [1, -1]) {
        const ext = (side > 0 ? lg.rightExt : lg.leftExt) * m;
        const base = G.sub(G.add(lg.X, G.mul(lg.nv, side * (ext + rf))), C);
        const b = G.dot(base, lg.v), q = b * b - (G.dot(base, base) - (Rb + rf) ** 2);
        if (q < 0) continue;
        const sq = -b + Math.sqrt(q);                                   // outer solution: fillet sits on the approach
        const Q = G.add(G.add(lg.X, G.mul(lg.v, sq)), G.mul(lg.nv, side * (ext + rf)));
        const T1 = G.sub(Q, G.mul(lg.nv, side * rf));                  // tangent point on the road edge
        const T2 = G.add(C, G.mul(G.norm(G.sub(Q, C)), Rb));            // tangent point on the ring
        const ep = G.add(lg.X, G.mul(lg.nv, side * ext)), f = G.sub(ep, C), bb = G.dot(f, lg.v), qq = bb * bb - (G.dot(f, f) - Rb * Rb);
        const E = qq >= 0 ? G.add(ep, G.mul(lg.v, -bb + (Math.abs(-bb + Math.sqrt(qq)) < Math.abs(-bb - Math.sqrt(qq)) ? Math.sqrt(qq) : -Math.sqrt(qq)))) : null;
        // strip that hides the road's own straight edge line between T1 and the ring
        const at = (sAlong, off) => G.add(G.add(lg.X, G.mul(lg.v, sAlong)), G.mul(lg.nv, side * off));
        const curve = rb.curveLanes !== false;
        const lo = curve ? 0 : ext - 0.75 * m, hi = ext + 0.6 * m, s1 = sq, s0 = -4 * m;
        rb.corners.push({ leg: li, side, Q, rf: rb.cornerR != null ? rb.cornerR : 12, T1, T2, E, C: G.copy(C), Rb: Rb / m,
          sAlong: sq / m, ext: ext / m, mask: [at(s0, lo), at(s1, lo), at(s1, hi), at(s0, hi)] });
        angs.push(G.angle(G.sub(T2, C)));
      }
      if (angs.length === 2) { // exact ring edge-line gap for this leg: between its two corner tangent points
        const d = Math.atan2(Math.sin(angs[1] - angs[0]), Math.cos(angs[1] - angs[0]));
        rb.legs[li].ang = angs[0] + d / 2; rb.legs[li].h = Math.abs(d) / 2;
      }
    });
  }

  // ---- lanes bending into the ring ----
  // From the corner's tangent point, a line at lateral offset o (m, on that side) follows a circle around the
  // corner centre Q with radius rf + ext - o (concentric with the kerb), so lane widths stay constant.
  // Returns the path (px) from the tangent point until it reaches stopR (m) from the roundabout centre.
  function bendPath(rb, lg, k, o, stopR) {
    const m = ppm(), C = rb.p, side = k.side;
    const P1 = G.add(G.add(lg.X, G.mul(lg.v, k.sAlong * m)), G.mul(lg.nv, side * o * m));
    const rq = (k.rf + k.ext - o) * m, a0 = Math.atan2(P1.y - k.Q.y, P1.x - k.Q.x);
    const pt = (a) => ({ x: k.Q.x + rq * Math.cos(a), y: k.Q.y + rq * Math.sin(a) });
    const step = 0.4 * Math.PI / 180, dirn = G.dist(pt(a0 + step), C) < G.dist(pt(a0 - step), C) ? 1 : -1;
    const out = [P1], target = stopR * m;
    if (G.dist(P1, C) <= target) return out;
    let a = a0;
    for (let i = 0; i < 900; i++) {
      const nb = a + dirn * step, q = pt(nb);
      if (G.dist(q, C) <= target) { // refine the end on the stop circle
        let lo = a, hi = nb;
        for (let j = 0; j < 20; j++) { const md = (lo + hi) / 2; if (G.dist(pt(md), C) > target) lo = md; else hi = md; }
        out.push(pt(hi)); return out;
      }
      out.push(q); a = nb;
    }
    return out;
  }
  // distance (px) along a section's line at offset so (m) from its start to the point nearest p
  function posOnSectionLine(el, so, p) {
    const m = ppm(), line = G.offset(R.basePts(el, m), so * m);
    const r = G.nearestOnPolyline(p, line);
    if (!r) return 0;
    let acc = 0; for (let i = 0; i < r.i; i++) acc += G.dist(line[i], line[i + 1]);
    return acc + G.dist(line[r.i], r.proj);
  }
  const splitBase = (lg) => (lg.median ? lg.el.medianWidth / 2 : 0.6); // splitter island half-width at its start
  function rbCurves(rb, legs) {
    const m = ppm();
    rb.curves = []; rb.splits = []; rb.legMasks = [];
    const stopAtCw = rb.laneStop !== false;
    // the roundabout takes priority: on each leg, lane markings start on the far side of its crosswalk
    if (stopAtCw) for (const lg of legs) {
      const cw = S.els.find((e) => e.owner === rb.id && e.type === 'crosswalk' && e.legKey === lg.key);
      if (!cw) continue;
      const sOut = RB_YD + 0.54 + (cw.setback || 0) + cw.width, atL = (sA, off) => G.add(G.add(lg.X, G.mul(lg.v, sA * m)), G.mul(lg.nv, off * m));
      const lo = -(lg.leftExt - 0.45), hi = lg.rightExt - 0.45; // edge lines (0.225 m from the kerb) stay
      rb.legMasks.push([atL(-4, lo), atL(sOut, lo), atL(sOut, hi), atL(-4, hi)]);
    }
    if (rb.curveLanes === false) return;
    legs.forEach((lg, li) => {
      const bySide = {};
      for (const k of rb.corners) if (k.leg === li) bySide[k.side] = k;
      const hasCw = stopAtCw && S.els.some((e) => e.owner === rb.id && e.type === 'crosswalk' && e.legKey === lg.key);
      const L = R.sectionLayout(lg.el), styles = P().lineStyles;
      // split double / mixed lines into single components (section frame), then map to the leg frame
      const comps = [];
      for (const ln of L.lines) {
        const st = styles[ln.style]; if (!st) continue;
        const single = (pattern) => ({ color: st.color, width: st.width, pattern, dash: st.dash });
        const o = ((st.sep || 0) + st.width) / 2;
        if (st.pattern === 'double') comps.push([ln.off - o, single('solid')], [ln.off + o, single('solid')]);
        else if (st.pattern === 'double-dashed') comps.push([ln.off - o, single('dashed')], [ln.off + o, single('dashed')]);
        else if (st.pattern === 'solid-dashed') comps.push([ln.off - o, single('solid')], [ln.off + o, single('dashed')]);
        else comps.push([ln.off, single(st.pattern)]);
      }
      for (const [so, style] of hasCw ? [] : comps) { // lanes stop at the crosswalk: no bent continuations
        const vo = lg.sgn > 0 ? so : -so;
        for (const side of Math.abs(vo) < 0.02 ? [1, -1] : [Math.sign(vo)]) {
          const k = bySide[side]; if (!k) continue;
          const o = Math.abs(vo);
          if (Math.abs(o - (k.ext - 0.225)) < 0.05) continue;          // outer edge line: drawn by the kerb curve
          const incomingHalf = lg.incoming && (lg.oneWay || side < 0);
          // lines hugging the splitter/median end at its nose; other exit lines run to the ring
          const stopR = lg.br + (incomingHalf ? RB_YD + 0.54 : o <= splitBase(lg) + 0.6 ? RB_YD : 0.3);
          const bent = bendPath(rb, lg, k, o, stopR);
          if (bent.length < 2) continue;
          // overlap 5 cm with the straight line, and continue its dash pattern (position along the section line)
          const U = G.add(bent[0], G.mul(lg.v, 0.05 * m)), pts = [U].concat(bent);
          let total = 0; for (let i = 1; i < pts.length; i++) total += G.dist(pts[i - 1], pts[i]);
          const L0 = posOnSectionLine(lg.el, so, U);
          if (lg.sgn > 0) rb.curves.push({ pts: pts.slice().reverse(), style, dashOffset: L0 - total });
          else rb.curves.push({ pts, style, dashOffset: L0 });
        }
      }
      // splitter island: the gap that opens between the two halves of a two-way road
      if (rb.splitters !== false && !lg.oneWay && bySide[1] && bySide[-1]) {
        const b0 = splitBase(lg), endR = lg.br + RB_YD;
        const cR = bendPath(rb, lg, bySide[1], b0, endR), cL = bendPath(rb, lg, bySide[-1], b0, endR);
        const nose = shortArcPts(rb.p, endR * m, cR[cR.length - 1], cL[cL.length - 1]);
        const poly = [], atL = (sA, off) => G.add(G.add(lg.X, G.mul(lg.v, sA * m)), G.mul(lg.nv, off * m));
        if (!lg.median) { // tapered tail back along the centre line
          const sT = Math.max(bySide[1].sAlong, bySide[-1].sAlong) + 12;
          poly.push(atL(sT, 0));
          poly.push(...cR, ...nose.slice(1, -1), ...cL.slice().reverse());
        } else {
          // one island with the median: run back to the middle of the crosswalk (the refuge cut hides the join)
          const cw = S.els.find((e) => e.owner === rb.id && e.type === 'crosswalk' && e.legKey === lg.key);
          const sBack = cw ? RB_YD + 0.54 + (cw.setback || 0) + cw.width / 2 : Math.max(bySide[1].sAlong, bySide[-1].sAlong) + 8;
          poly.push(atL(sBack, b0), ...cR, ...nose.slice(1, -1), ...cL.slice().reverse(), atL(sBack, -b0));
        }
        rb.splits.push(poly);
      }
    });
  }
  function shortArcPts(c, r, p0, p1) {
    const a0 = Math.atan2(p0.y - c.y, p0.x - c.x), a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
    const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), n = Math.max(4, Math.ceil(Math.abs(d) / (Math.PI / 90)));
    const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (d * i) / n; o.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); }
    return o;
  }
  // a point on the bent lane line at offset o (incoming side), where it reaches radius rM from the centre
  function bentPoint(rb, lg, side, o, rM) {
    const k = rb.corners.find((c) => c.leg === lg.li && c.side === side);
    if (!k || rb.curveLanes === false) return null;
    const p = bendPath(rb, lg, k, o, rM);
    return p[p.length - 1];
  }

  function yieldTrianglesBent(rb, lg, y, offs) {
    const m = ppm(), out = [];
    for (const vo of offs) {
      const side = vo >= 0 ? 1 : -1, k = rb.corners.find((c) => c.leg === lg.li && c.side === side);
      if (!k) return null;
      const path = bendPath(rb, lg, k, Math.abs(vo), y.arcR);
      let need = (0.54 + 2.25 + 1.5) * m, pos = null, dirv = null;
      for (let i = path.length - 1; i > 0; i--) { // walk upstream from the yield line along the bent lane
        const a = path[i - 1], b = path[i], d = G.dist(a, b);
        if (d >= need) { pos = G.add(b, G.mul(G.norm(G.sub(a, b)), need)); dirv = G.norm(G.sub(b, a)); break; }
        need -= d;
      }
      if (!pos) { pos = G.add(path[0], G.mul(lg.v, need)); dirv = G.mul(lg.v, -1); }
      out.push({ x: pos.x, y: pos.y, dir: G.angle(dirv) });
    }
    return out;
  }
  // One triangle per entry lane, placed on that lane's own path (the road section, curved or straight):
  // tip toward approaching cars, base square to the lane's direction of travel. Stored in px.
  function yieldTriangles(lg, y) {
    const m = ppm(), el = lg.el, pts = R.basePts(el, m), n = Math.max(1, y.lanes | 0);
    const offA = lg.inner, offB = -lg.leftExt + 0.3, out = [];
    const C = y.arcC, r0 = y.arcR * m;
    for (let k = 0; k < n; k++) {
      const offV = offA + ((k + 0.5) / n) * (offB - offA);          // lateral offset in the leg frame (m)
      const offS = lg.sgn > 0 ? offV : -offV;                       // same offset in the section's own frame
      const lane = G.offset(pts, offS * m);
      // walk the lane path: find where it crosses the yield arc, then go upstream (away from the ring)
      const cum = [0]; for (let i = 1; i < lane.length; i++) cum.push(cum[i - 1] + G.dist(lane[i - 1], lane[i]));
      const pointAt = (sl) => {
        let i = 1; while (i < lane.length - 1 && cum[i] < sl) i++;
        const a = lane[i - 1], b = lane[i], u = (sl - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
        return { p: G.add(a, G.mul(G.sub(b, a), G.clamp(u, 0, 1))), t: G.norm(G.sub(b, a)) };
      };
      // where the lane path crosses the yield arc (segment–circle intersection), nearest this leg
      let sHit = null, best = Infinity;
      for (let i = 1; i < lane.length; i++) {
        const a = lane[i - 1], d = G.sub(lane[i], a), f = G.sub(a, C), A = G.dot(d, d);
        if (!A) continue;
        const B = 2 * G.dot(f, d), Cc = G.dot(f, f) - r0 * r0, disc = B * B - 4 * A * Cc;
        if (disc < 0) continue;
        for (const root of [-1, 1]) {
          const u = (-B + root * Math.sqrt(disc)) / (2 * A);
          if (u < 0 || u > 1) continue;
          const q = G.add(a, G.mul(d, u)), dd = G.dist(q, lg.X);
          if (dd < best) { best = dd; sHit = cum[i - 1] + (cum[i] - cum[i - 1]) * u; }
        }
      }
      if (sHit == null) continue;
      const fwdOut = G.dist(pointAt(sHit + m).p, C) > G.dist(pointAt(sHit).p, C) ? 1 : -1; // direction along the polyline that leaves the ring
      const mid = pointAt(sHit + fwdOut * (0.54 + 2.25 + 1.5) * m);
      const travel = G.mul(mid.t, -fwdOut);                         // toward the ring
      out.push({ x: mid.p.x, y: mid.p.y, dir: G.angle(travel) });
    }
    return out;
  }

  function syncRoundabout(rb) {
    if (rb.curvedYield === undefined) rb.curvedYield = true;
    const m = ppm(), legs = rbLegs(rb);
    rb.legs = legs.map((lg) => ({ ang: G.angle(G.sub(lg.X, rb.p)), w: Math.max(lg.rightExt, lg.leftExt) }));
    legs.forEach((lg, i) => { lg.li = i; });
    rbCorners(rb, legs);
    rbCurves(rb, legs);
    if (rb.yields === undefined) adoptLegacy(rb, legs); // roundabouts made before pieces were linked
    const kids = S.els.filter((e) => e.owner === rb.id);
    // remember how far each crosswalk was moved along its leg (measured against where its leg was last time)
    for (const k of kids) if (k.type === 'crosswalk' && k.anchor) {
      const c = G.mid(k.a, k.b);
      k.setback = Math.max(0, Math.round((G.dot(G.sub(c, k.anchor.X), k.anchor.v) / m - (RB_YD + 0.54) - (k.anchor.w || k.width) / 2) * 100) / 100);
    }
    const removed = rb.removed || [], keep = new Set();
    for (const lg of legs) {
      const at = (dist, off) => G.add(G.add(lg.X, G.mul(lg.v, dist * m)), G.mul(lg.nv, off * m));
      if (rb.yields && lg.incoming && !removed.includes('yield:' + lg.key)) {
        let y = kids.find((k) => k.type === 'yield' && k.legKey === lg.key);
        if (!y) { y = { id: newId(), type: 'yield', owner: rb.id, legKey: lg.key, triangles: true, lanes: lg.lanes }; S.els.push(y); }
        y.a = at(RB_YD, lg.inner); y.b = at(RB_YD, -lg.leftExt + 0.3); y.dir = G.angle(G.mul(lg.v, -1));
        // follow the roundabout's edge (arc around the edge circle at this entry); toggle on the roundabout or per yield
        y.arcC = G.copy(lg.bc); y.arcR = lg.br + RB_YD;
        // on bent lanes: the line runs from the splitter/centre to the kerb along the bent lane edges
        const aOff = lg.median ? lg.el.medianWidth / 2 + 0.3 : rb.splitters !== false ? splitBase(lg) + 0.3 : 0.15;
        const ends = lg.oneWay ? [lg.rightExt - 0.5, -(lg.leftExt - 0.5)] : [-aOff, -(lg.leftExt - 0.5)]; // signed, leg frame; ends clear of the edge line
        const pa = bentPoint(rb, lg, Math.sign(ends[0]) || -1, Math.abs(ends[0]), y.arcR), pb = bentPoint(rb, lg, Math.sign(ends[1]) || -1, Math.abs(ends[1]), y.arcR);
        if (pa && pb) { y.a = pa; y.b = pb; }
        const n = Math.max(1, y.lanes | 0), offs = [];
        for (let i = 0; i < n; i++) offs.push(ends[0] + ((i + 0.5) / n) * (ends[1] - ends[0]));
        y.tris = (pa && pb && yieldTrianglesBent(rb, lg, y, offs)) || yieldTriangles(lg, y);
        const cv = rb.curvedYield !== false;
        if (y.curvedFrom !== cv) { y.curved = cv; y.curvedFrom = cv; }
        keep.add(y.id);
      }
      if (rb.crosswalks && !removed.includes('crosswalk:' + lg.key)) {
        let c = kids.find((k) => k.type === 'crosswalk' && k.legKey === lg.key);
        if (!c) { c = { id: newId(), type: 'crosswalk', owner: rb.id, legKey: lg.key, kind: rb.cwKind || 'ties', width: rb.cwWidth || 4, gap: 0.4, green: false, setback: rb.cwSetback != null ? rb.cwSetback : 6.5 }; S.els.push(c); }
        const dc = RB_YD + 0.54 + c.setback + c.width / 2;
        c.a = at(dc, -lg.leftExt + 0.05); c.b = at(dc, lg.rightExt - 0.05); c.dir = G.angle(lg.v);
        c.anchor = { X: G.copy(lg.X), v: G.copy(lg.v), w: c.width };
        keep.add(c.id);
      }
    }
    S.els = S.els.filter((e) => e.owner !== rb.id || keep.has(e.id));
  }
  // Link existing, unlinked yield lines / crosswalks that sit on a roundabout's legs to that roundabout.
  function adoptNearby(rb, legs) {
    const m = ppm();
    for (const lg of legs) {
      for (const e of S.els) {
        if (e.owner || (e.type !== 'yield' && e.type !== 'crosswalk') || !e.a) continue;
        const c = G.mid(e.a, e.b), along = G.dot(G.sub(c, lg.X), lg.v) / m, lat = G.dot(G.sub(c, lg.X), lg.nv) / m;
        if (lat < -lg.leftExt - 1 || lat > lg.rightExt + 1) continue;
        const par = G.dot(G.fromAngle(e.dir || 0), lg.v);
        if (e.type === 'yield' && along > -3 && along < 8 && par < -0.7 && !S.els.some((k) => k.owner === rb.id && k.type === 'yield' && k.legKey === lg.key)) {
          e.owner = rb.id; e.legKey = lg.key;
        }
        if (e.type === 'crosswalk' && along > 0 && along < 35 && Math.abs(par) > 0.7 && !S.els.some((k) => k.owner === rb.id && k.type === 'crosswalk' && k.legKey === lg.key)) {
          e.owner = rb.id; e.legKey = lg.key; e.anchor = { X: G.copy(lg.X), v: G.copy(lg.v), w: e.width };
        }
      }
    }
  }
  function adoptLegacy(rb, legs) {
    rb.yields = true; rb.crosswalks = true; rb.cwKind = rb.cwKind || 'ties'; rb.cwWidth = rb.cwWidth || 4; rb.cwSetback = rb.cwSetback != null ? rb.cwSetback : 6.5; rb.removed = rb.removed || [];
    // the old version cut medians with small 4-point areas; medians are now opened live under crosswalks
    const lim = (rb.R + 30) * ppm();
    S.els = S.els.filter((e) => !(e.type === 'junction' && !e.owner && e.pts.length === 4 && e.pts.every((q) => G.dist(q, rb.p) < lim)));
    adoptNearby(rb, legs);
  }
  function regenerateRoundabout(rb) {
    const legs = rbLegs(rb);
    S.els = S.els.filter((e) => e.owner !== rb.id);
    rb.removed = [];
    // also replace unlinked yield lines / crosswalks sitting on its legs
    adoptNearby(rb, legs);
    S.els = S.els.filter((e) => e.owner !== rb.id);
    commit();
  }
  const syncAll = () => { for (const e of S.els.slice()) if (e.type === 'roundabout') syncRoundabout(e); };
  function buildRoundabout(C, prm) {
    return { id: newId(), type: 'roundabout', p: G.copy(C), R: prm.R, lanes: prm.turbo ? 2 : prm.lanes, laneWidth: prm.laneWidth, apron: prm.turbo ? 0 : prm.apron,
      turbo: !!prm.turbo, divider: prm.divider || 'raised', turboAxis: prm.turboAxis || 0, turboTaper: 20, cornerR: prm.cornerR != null ? prm.cornerR : 12, laneStop: prm.laneStop !== false, curveLanes: prm.curveLanes !== false, splitters: prm.splitters !== false, curvedYield: prm.curvedYield !== false,
      island: prm.island || 'island', legs: [], yields: prm.yields, crosswalks: prm.crosswalks, cwKind: prm.cwKind, cwWidth: prm.cwWidth, cwSetback: prm.cwSetback, removed: [] };
  }

  // ---------------- intersection generator ----------------
  function lineIntersect(p1, t1, p2, t2) {
    const den = G.cross(t1, t2);
    if (Math.abs(den) < 0.15) return null; // (nearly) parallel
    const s = G.cross(G.sub(p2, p1), t2) / den;
    return G.add(p1, G.mul(t1, s));
  }
  function lengthsFrom(pts, i, proj) {
    let f = G.dist(proj, pts[i + 1]), b = G.dist(pts[i], proj);
    for (let k = i + 1; k < pts.length - 1; k++) f += G.dist(pts[k], pts[k + 1]);
    for (let k = 0; k < i; k++) b += G.dist(pts[k], pts[k + 1]);
    return { f, b };
  }
  function buildJunction(click, prm) {
    const m = ppm();
    let roads = [];
    for (const el of S.els) {
      if (el.type !== 'section') continue;
      const pts = R.basePts(el, m);
      if (pts.length < 2) continue;
      const L = R.sectionLayout(el);
      const r = G.nearestOnPolyline(click, pts);
      if (!r || r.d > (Math.max(L.left, L.right) + 6) * m) continue;
      roads.push({ el, pts, L, r });
    }
    if (roads.length < 2) {
      alert('找不到兩條交會的路段。請先用「② 路段」沿每條道路的中心線畫過路口，再點兩路交會處。\nNeed two road sections crossing here — draw sections along each road first.');
      return null;
    }
    const cs = [];
    for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
      const p = lineIntersect(roads[i].r.proj, roads[i].r.tangent, roads[j].r.proj, roads[j].r.tangent);
      if (p && G.dist(p, click) < 40 * m) cs.push(p);
    }
    if (!cs.length) { alert('這些路段幾乎平行，無法判斷路口。Sections are parallel here.'); return null; }
    const C = { x: cs.reduce((a, p) => a + p.x, 0) / cs.length, y: cs.reduce((a, p) => a + p.y, 0) / cs.length };
    for (const rd of roads) { rd.r = G.nearestOnPolyline(C, rd.pts); rd.t = rd.r.tangent; rd.n = G.rightN(rd.t); }

    const legs = [];
    for (const rd of roads) {
      const len = lengthsFrom(rd.pts, rd.r.i, rd.r.proj);
      for (const sgn of [1, -1]) {
        if ((sgn > 0 ? len.f : len.b) < 6 * m) continue; // road ends here (T-junction)
        const v = G.mul(rd.t, sgn), nv = G.rightN(v);
        legs.push({ rd, v, nv, sgn, rightExt: sgn > 0 ? rd.L.right : rd.L.left, leftExt: sgn > 0 ? rd.L.left : rd.L.right });
      }
    }
    // distance along each leg from C to the crossing roads' pavement edge (checked at both leg edges, so skewed crossings work)
    for (const lg of legs) {
      let E = 0;
      for (const B of roads) {
        if (B === lg.rd) continue;
        const k = G.dot(lg.v, B.n);
        if (Math.abs(k) < 0.2) continue;
        const ext = (k > 0 ? B.L.right : B.L.left) * m;
        const base = G.dot(G.sub(C, B.r.proj), B.n);
        for (const q of [G.mul(lg.nv, lg.rightExt * m), G.mul(lg.nv, -lg.leftExt * m)]) {
          const s = (Math.sign(k) * ext - base - G.dot(q, B.n)) / k;
          E = Math.max(E, s);
        }
      }
      lg.E = E;
    }
    const out = [];
    const jid = newId();
    const stopW = 0.4;
    const poly = [];
    legs.sort((a, b) => G.angle(a.v) - G.angle(b.v));
    for (const lg of legs) {
      const el = lg.rd.el;
      const at = (d, off) => G.add(G.add(C, G.mul(lg.v, d)), G.mul(lg.nv, off * m));
      const cwIn = lg.E + prm.setback * m, cwOut = cwIn + (prm.crosswalks ? prm.cwWidth * m : 0);
      if (prm.crosswalks) {
        const w = G.clamp(prm.cwWidth, P().crosswalk[prm.cwKind].width.min, P().crosswalk[prm.cwKind].width.max);
        const d = cwIn + (w * m) / 2;
        out.push({ id: newId(), owner: jid, type: 'crosswalk', kind: prm.cwKind, width: w, gap: 0.4, green: false,
          a: at(d, -lg.leftExt + 0.05), b: at(d, lg.rightExt - 0.05), dir: G.angle(lg.v) });
      }
      // incoming lanes: traffic heading toward C keeps right, i.e. the left side of v
      const oneWay = el.lanesB === 0;
      const incoming = oneWay ? lg.sgn < 0 : true;
      const ds = cwOut + (prm.crosswalks ? prm.stopGap * m : 0) + (stopW * m) / 2;
      if (prm.stops && incoming) {
        const inner = oneWay ? lg.rightExt - 0.3 : -((el.centerType === 'median' ? el.medianWidth / 2 + 0.2 : 0.15));
        out.push({ id: newId(), owner: jid, type: 'stopline', width: stopW, a: at(ds, inner), b: at(ds, -lg.leftExt + 0.3), dir: G.angle(G.mul(lg.v, -1)) });
      }
      const dIn = prm.stops && incoming ? ds + (stopW * m) / 2 : cwOut;
      const dOut = oneWay && incoming && prm.stops ? dIn : cwOut;
      // Outline steps from the stop line (incoming half) to the crosswalk edge (outgoing half).
      // With a median the step sits on the median's incoming edge, so the median ends at the crosswalk;
      // otherwise just past the centre line, so the centre line ends at the stop line.
      const median = el.lanesB > 0 && el.centerType === 'median';
      const step = median ? -(el.medianWidth / 2) : 0.3;
      if (oneWay || Math.abs(dIn - dOut) < 1e-6) poly.push(at(dIn, -lg.leftExt - 1), at(dOut, lg.rightExt + 1));
      else poly.push(at(dIn, -lg.leftExt - 1), at(dIn, step), at(dOut, step), at(dOut, lg.rightExt + 1));
    }
    out.unshift({ id: jid, type: 'junction', pts: poly });
    return out;
  }

  // ---------------- side panels ----------------
  function buildLibrary() {
    const lib = $('#library');
    lib.innerHTML = '';
    const mk = (id, label, en, icon) => {
      const b = document.createElement('button');
      b.className = 'tool'; b.dataset.id = id; b.title = label + ' — ' + en;
      const ico = document.createElement('span'); ico.className = 'ico';
      if (icon.line) {
        const c = document.createElement('canvas'); c.width = 60; c.height = 36; c.style.width = '30px'; c.style.height = '18px';
        const g = c.getContext('2d'); g.fillStyle = P().colors.asphalt; g.fillRect(0, 0, 60, 36);
        const st = P().lineStyles[icon.line];
        R.drawStyled(g, [{ x: 0, y: 18 }, { x: 60, y: 18 }], Object.assign({}, st, { dash: st.dash ? [0.35, 0.25] : null }), 40);
        ico.appendChild(c);
      } else if (icon.fill) ico.style.background = icon.fill;
      else ico.textContent = icon.glyph || '';
      const lbl = document.createElement('span'); lbl.className = 'lbl';
      lbl.innerHTML = `<b></b><small></small>`; lbl.querySelector('b').textContent = label; lbl.querySelector('small').textContent = en;
      b.append(ico, lbl);
      b.onclick = () => setTool(id);
      return b;
    };
    const g0 = document.createElement('div'); g0.className = 'group';
    g0.innerHTML = '<h4>工具 Tools</h4>';
    const t0 = document.createElement('div'); t0.className = 'tools basic';
    BASIC.forEach((t) => t0.appendChild(mk(t.id, t.label, t.en, { glyph: t.glyph })));
    g0.appendChild(t0); lib.appendChild(g0);
    for (const grp of P().library) {
      const g = document.createElement('div'); g.className = 'group';
      const h = document.createElement('h4'); h.textContent = grp.title; g.appendChild(h);
      const t = document.createElement('div'); t.className = 'tools';
      grp.items.forEach((it) => t.appendChild(mk(it.id, it.label, it.en, it.icon)));
      g.appendChild(t); lib.appendChild(g);
    }
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.id === (S.item ? S.item.id : S.tool)));
  }

  function clampAll(target) {
    for (const f of P().fields(target)) {
      if (f.kind === 'num' && typeof target[f.key] === 'number') target[f.key] = G.clamp(target[f.key], f.min, f.max);
    }
  }

  function fieldRow(f, target, onChange) {
    const row = document.createElement('div'); row.className = 'field';
    if (f.kind === 'info') { const d = document.createElement('div'); d.className = 'info'; d.textContent = f.text; return d; }
    if (f.kind === 'law') { const d = document.createElement('div'); d.className = 'lawbox'; d.textContent = '⚖ ' + f.text; return d; }
    const lab = document.createElement('label'); lab.textContent = f.label; row.appendChild(lab);
    let inp;
    if (f.kind === 'lock') { inp = document.createElement('span'); inp.className = 'lock'; inp.textContent = f.value; inp.title = '依法規固定 Fixed by regulation'; row.appendChild(inp); return row; }
    if (f.kind === 'num' || f.kind === 'deg') {
      inp = document.createElement('input'); inp.type = 'number';
      if (f.kind === 'deg') { inp.step = 1; inp.value = Math.round((((target[f.key] * 180) / Math.PI) % 360 + 360) % 360); }
      else { inp.min = f.min; inp.max = f.max; inp.step = f.step; inp.value = +(+target[f.key]).toFixed(3); }
      inp.onchange = () => {
        let v = parseFloat(inp.value); if (isNaN(v)) return;
        if (f.kind === 'deg') v = (v * Math.PI) / 180; else v = G.clamp(v, f.min, f.max);
        onChange(f.key, v);
      };
    } else if (f.kind === 'sel') {
      inp = document.createElement('select');
      f.options.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; inp.appendChild(o); });
      inp.value = target[f.key];
      inp.onchange = () => onChange(f.key, inp.value);
    } else if (f.kind === 'chk') {
      inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!target[f.key];
      inp.onchange = () => onChange(f.key, inp.checked);
    } else if (f.kind === 'txt') {
      inp = document.createElement('input'); inp.type = 'text'; inp.value = target[f.key] || '';
      inp.onchange = () => onChange(f.key, inp.value);
    } else if (f.kind === 'color') {
      inp = document.createElement('input'); inp.type = 'color'; inp.value = target[f.key];
      inp.oninput = () => onChange(f.key, inp.value, true);
    }
    row.appendChild(inp);
    if (f.law) { const l = document.createElement('div'); l.className = 'law'; l.textContent = f.law === '≈' ? '≈ 常用值 (未對照法規條文) typical value' : '⚖ ' + f.law; row.appendChild(l); }
    return row;
  }

  function alignPanel(el) {
    const A = S.align, tgt = findEl(A.tgtId);
    const box = document.createElement('div'); box.className = 'alignbox';
    const t = document.createElement('div'); t.className = 'aligntitle';
    t.textContent = tgt ? '📐 對齊至：' + (P().typeNames[tgt.type] || tgt.type).split(' ')[0] : '📐 點選畫面上要對齊的目標物件…';
    box.appendChild(t);
    if (tgt) {
      const set = (k, v) => { A.opts[k] = v; applyAlign(); commit(); };
      box.appendChild(fieldRow({ kind: 'sel', key: 'frame', label: '基準 Frame', options: [['target', '依目標方向 (前方=上)'], ['screen', '依畫面 Screen']] }, A.opts, set));
      if (BAND.has(el.type) || POINT.has(el.type)) box.appendChild(fieldRow({ kind: 'chk', key: 'parallel', label: '同方向 Match direction' }, A.opts, set));
      // 3×2 alignment grid
      const grid = document.createElement('div'); grid.className = 'aligngrid';
      const btn = (axis, mode, icon, label) => {
        const b = document.createElement('button'); b.innerHTML = `<span>${icon}</span><small>${label}</small>`;
        if (A.opts[axis] === mode) b.className = 'on';
        b.title = label;
        b.onclick = () => set(axis, A.opts[axis] === mode ? null : mode);
        grid.appendChild(b);
      };
      btn('ax', 'min', '⇤', '靠左 Left'); btn('ax', 'mid', '⇹', '水平置中 Centre'); btn('ax', 'max', '⇥', '靠右 Right');
      btn('ay', 'max', '⤒', '靠上 Top'); btn('ay', 'mid', '⇕', '垂直置中 Middle'); btn('ay', 'min', '⤓', '靠下 Bottom');
      box.appendChild(grid);
      const note = document.createElement('div'); note.className = 'info';
      note.textContent = A.opts.frame === 'target' ? '依目標方向：上=行車前方，左右=駕駛人左右。Target frame: up = direction of travel.' : '依畫面：上下左右即螢幕方向。Screen frame.';
      box.appendChild(note);
      if (BAND.has(el.type) && BAND.has(tgt.type) && A.opts.parallel && A.opts.ay == null) {
        const pair = new Set([el.type, tgt.type]);
        box.appendChild(fieldRow({ kind: 'num', key: 'gap', label: '貼齊間距 Edge gap', min: 0, max: 30, step: 0.1,
          law: pair.has('crosswalk') && pair.has('stopline') ? '§170 停止線與行人穿越道淨距 2–3 m (受限時≥1 m)' : null }, A.opts, set));
        if (A.opts.ax == null) box.appendChild(fieldRow({ kind: 'chk', key: 'ends', label: '端點對齊 Match ends' }, A.opts, set));
      }
      if (POINT.has(el.type) && (tgt.a || tgt.p) && A.opts.ax == null) box.appendChild(fieldRow({ kind: 'chk', key: 'axis', label: '對齊中心線 Same centre line' }, A.opts, set));
    }
    const row = document.createElement('div'); row.className = 'btnrow';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = '完成 Done'; ok.onclick = () => endAlign(false);
    const cancel = document.createElement('button'); cancel.textContent = '取消 Cancel'; cancel.onclick = () => endAlign(true);
    const other = document.createElement('button'); other.textContent = '換目標 Pick another'; other.onclick = () => { A.tgtId = null; Object.assign(el, clone(A.orig)); commit(); updateHint(); };
    row.append(ok, cancel); if (tgt) row.append(other);
    box.appendChild(row);
    return box;
  }

  function renderProps() {
    const el = findEl(S.sel);
    const box = $('#props');
    box.innerHTML = '';
    const target = el || (S.tool === 'item' ? S.params : null);
    if (target) {
      const h = document.createElement('h3');
      h.textContent = (el ? '' : '新增：') + (P().typeNames[target.type] || target.type);
      box.appendChild(h);
      if (el && S.align && S.align.srcId === el.id) box.appendChild(alignPanel(el));
      if (!el && S.item) { const i = document.createElement('div'); i.className = 'info'; i.textContent = S.item.label + ' — ' + S.item.en + '（以下設定套用於接下來放置的物件）'; box.appendChild(i); }
      const onChange = (key, v, live) => {
        target[key] = v;
        if (target.type === 'surface' && key === 'kind' && P().colors[v]) target.color = P().colors[v];
        clampAll(target);
        if (el && S.params && S.params.type === el.type) { S.params[key] = v; clampAll(S.params); }
        if (el) { if (live) redraw(); else commit(); } else { renderProps(); redraw(); }
      };
      const btns = document.createElement('div'); btns.className = 'btnrow';
      for (const f of P().fields(target)) {
        if (f.kind === 'btn') {
          if (!el) continue;
          const b = document.createElement('button'); b.textContent = f.label; b.onclick = () => doAction(f.action); btns.appendChild(b);
        } else box.appendChild(fieldRow(f, target, onChange));
      }
      if (el && el.owner) {
        const info = document.createElement('div'); info.className = 'info';
        info.textContent = '🔗 此物件由路口/圓環自動產生並連動；刪除路口/圓環時會一併刪除。Linked to its intersection/roundabout.';
        box.insertBefore(info, box.children[1] || null);
        const dt = document.createElement('button'); dt.textContent = '解除連動 Detach';
        dt.onclick = () => { const o = findEl(el.owner); if (o && o.type === 'roundabout' && el.legKey) (o.removed = o.removed || []).push(el.type + ':' + el.legKey); delete el.owner; delete el.legKey; delete el.anchor; commit(); };
        btns.appendChild(dt);
      }
      if (el && canAlign(el) && !S.align) {
        const ab = document.createElement('button'); ab.textContent = '📐 對齊至… Align to (A)'; ab.onclick = startAlign; btns.prepend(ab);
      }
      if (el) {
        const d = document.createElement('button'); d.textContent = '複製 Duplicate'; d.onclick = () => duplicate(el); btns.appendChild(d);
        const x = document.createElement('button'); x.className = 'danger'; x.textContent = '刪除 Delete'; x.onclick = () => deleteEl(el.id); btns.appendChild(x);
      }
      box.appendChild(btns);
    } else {
      const h = document.createElement('h3'); h.textContent = '專案 Project'; box.appendChild(h);
      const steps = [
        [!!S.img, '上傳/貼上衛星圖 Upload image'],
        [!!S.ppm, '校正比例尺 Calibrate scale'],
        [S.els.some((e) => e.type === 'road'), '描繪車道範圍 Mark road area'],
        [S.els.some((e) => e.type === 'sidewalk'), '描繪人行道 Mark sidewalks'],
        [S.els.some((e) => !['road', 'sidewalk'].includes(e.type)), '放置標線 Add markings from library'],
      ];
      const ol = document.createElement('ol'); ol.className = 'steps';
      steps.forEach(([done, t]) => { const li = document.createElement('li'); li.textContent = (done ? '✓ ' : '') + t; if (done) li.className = 'done'; ol.appendChild(li); });
      box.appendChild(ol);
    }

    // scale
    const sc = document.createElement('div');
    sc.innerHTML = '<h5>比例尺 Scale</h5>';
    const row = document.createElement('div'); row.className = 'field';
    const lab = document.createElement('label'); lab.innerHTML = S.ppm ? '<span class="okc">已校正</span> m / px' : '<span class="warn">未校正</span> m / px';
    const inp = document.createElement('input'); inp.type = 'number'; inp.step = 0.001; inp.min = 0.001; inp.value = (1 / ppm()).toFixed(4);
    inp.onchange = () => { const v = parseFloat(inp.value); if (v > 0) { S.ppm = 1 / v; commit(); } };
    row.append(lab, inp); sc.appendChild(row);
    const cb = document.createElement('div'); cb.className = 'btnrow';
    const b1 = document.createElement('button'); b1.textContent = '📏 量兩點校正 Calibrate'; b1.onclick = () => setTool('calibrate'); cb.appendChild(b1);
    sc.appendChild(cb);
    const law = document.createElement('div'); law.className = 'info'; law.textContent = '法規依據：' + P().law + '。標示「≈」者為常用值，請依最新法規條文確認。';
    sc.appendChild(law);
    box.appendChild(sc);

    // layers
    const lh = document.createElement('h5'); lh.textContent = `圖層 Layers (${S.els.length})`; box.appendChild(lh);
    const ul = document.createElement('ul'); ul.className = 'layers';
    S.els.slice().reverse().forEach((e) => {
      const li = document.createElement('li'); if (e.id === S.sel) li.className = 'sel';
      const sp = document.createElement('span');
      let extra = '';
      if (e.type === 'line') extra = P().lineStyles[e.style].name;
      if (e.type === 'text') extra = e.text;
      if (e.type === 'crosswalk') extra = P().crosswalk[e.kind].name;
      sp.textContent = (P().typeNames[e.type] || e.type).split(' ')[0] + (extra ? ' · ' + extra : '');
      li.appendChild(sp);
      const up = document.createElement('button'); up.textContent = '↑'; up.title = 'Bring forward';
      up.onclick = (ev) => { ev.stopPropagation(); const i = S.els.indexOf(e); if (i < S.els.length - 1) { S.els.splice(i, 1); S.els.splice(i + 1, 0, e); commit(); } };
      const dn = document.createElement('button'); dn.textContent = '↓'; dn.title = 'Send backward';
      dn.onclick = (ev) => { ev.stopPropagation(); const i = S.els.indexOf(e); if (i > 0) { S.els.splice(i, 1); S.els.splice(i - 1, 0, e); commit(); } };
      const x = document.createElement('button'); x.textContent = '✕'; x.onclick = (ev) => { ev.stopPropagation(); deleteEl(e.id); };
      li.append(up, dn, x);
      li.onclick = () => { if (S.tool !== 'select') setTool('select'); S.sel = e.id; renderProps(); redraw(); };
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  // ---------------- files ----------------
  function loadImageSrc(src, keepView) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        S.img = img; S.imgSrc = src; S.w = img.naturalWidth; S.h = img.naturalHeight;
        stage.classList.add('has-image');
        if (!keepView) fitView();
        renderProps(); autosave(); redraw(); res();
      };
      img.onerror = () => { alert('無法讀取圖片 Could not read image'); res(); };
      img.src = src;
    });
  }
  function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const fr = new FileReader();
    fr.onload = () => loadImageSrc(fr.result).then(() => { if (!S.ppm) setTool('calibrate'); });
    fr.readAsDataURL(file);
  }
  $('#fileImage').onchange = (e) => { loadImageFile(e.target.files[0]); e.target.value = ''; };

  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault(); stage.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.name.endsWith('.json')) loadProjectFile(f); else loadImageFile(f);
  });
  window.addEventListener('paste', (e) => {
    for (const it of e.clipboardData.items) if (it.type.startsWith('image/')) { loadImageFile(it.getAsFile()); e.preventDefault(); return; }
  });

  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function saveProject() {
    const data = { app: 'road-plan-studio', v: 1, country: S.country, ppm: S.ppm, els: S.els, imgSrc: S.imgSrc };
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'road-plan.json');
  }
  function loadProjectFile(file) {
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const d = JSON.parse(fr.result);
        S.country = d.country && window.RoadPresets[d.country] ? d.country : 'TW';
        S.els = d.els || []; S.ppm = d.ppm || 0; S.sel = null; S.hist = []; S.fut = []; syncAll(); S.cur = snapshot();
        if (d.imgSrc) await loadImageSrc(d.imgSrc); else { S.img = null; S.imgSrc = null; stage.classList.remove('has-image'); }
        buildLibrary(); setTool('select'); autosave();
      } catch (e) { alert('專案檔格式錯誤 Invalid project file'); }
    };
    fr.readAsText(file);
  }
  $('#btnSave').onclick = saveProject;
  $('#fileProject').onchange = (e) => { if (e.target.files[0]) loadProjectFile(e.target.files[0]); e.target.value = ''; };
  $('#btnExport').onclick = () => {
    const c = document.createElement('canvas'); c.width = S.w; c.height = S.h;
    const g = c.getContext('2d');
    const bg = $('#chkExportBg').checked;
    R.drawScene(g, { img: bg ? S.img : null, w: S.w, h: S.h, imgOpacity: S.imgOpacity, roadOpacity: S.roadOpacity, clip: S.clip, els: S.els, ppm: ppm(), P: P() });
    c.toBlob((b) => download(b, 'road-plan.png'), 'image/png');
  };
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;
  $('#btnNew').onclick = () => {
    if (!confirm('清除所有內容並開始新專案？ Clear everything?')) return;
    S.els = []; S.ppm = 0; S.img = null; S.imgSrc = null; S.sel = null; S.hist = []; S.fut = []; S.cur = snapshot();
    S.w = 2400; S.h = 1600; stage.classList.remove('has-image'); fitView(); setTool('select'); autosave();
  };
  $('#rngImage').oninput = (e) => { S.imgOpacity = +e.target.value; redraw(); };
  $('#rngRoad').oninput = (e) => { S.roadOpacity = +e.target.value; redraw(); };
  $('#chkClip').onchange = (e) => { S.clip = e.target.checked; redraw(); };
  try { const mg = localStorage.getItem('roadplan:magnet'); if (mg != null) S.magnet = mg === '1'; } catch (e) { /* ignore */ }
  $('#chkMagnet').checked = S.magnet;
  $('#chkMagnet').onchange = (e) => { S.magnet = e.target.checked; try { localStorage.setItem('roadplan:magnet', S.magnet ? '1' : '0'); } catch (er) { /* ignore */ } };
  const selC = $('#selCountry');
  Object.values(window.RoadPresets).forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; selC.appendChild(o); });
  selC.onchange = () => { S.country = selC.value; buildLibrary(); setTool('select'); };

  window.addEventListener('resize', redraw);
  new ResizeObserver(redraw).observe(stage);

  // ---------------- boot ----------------
  async function boot() {
    buildLibrary();
    let d = null;
    try { d = JSON.parse(localStorage.getItem('roadplan:auto') || 'null'); } catch (e) { d = null; }
    if (d) {
      S.country = d.country && window.RoadPresets[d.country] ? d.country : 'TW';
      S.els = d.els || []; S.ppm = d.ppm || 0;
      if (d.imgSrc) await loadImageSrc(d.imgSrc);
    }
    syncAll();
    S.cur = snapshot();
    if (!S.img) fitView();
    setTool('select');
    (function loop() { if (needs) { needs = false; render(); } requestAnimationFrame(loop); })();
  }
  window.__roadplan = S; // for debugging
  boot();
})();
