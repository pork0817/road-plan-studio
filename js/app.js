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
    if (el.type === 'crosswalk' || el.type === 'stopline' || el.type === 'scooterbox') { el.dir = null; alignTwo(el, false); }
    if (el.type === 'arrow' || el.type === 'text' || el.type === 'symbol' || el.type === 'chevron' || el.type === 'yellowbox') alignPoint(el);
    return el;
  }
  const findEl = (id) => S.els.find((e) => e.id === id);

  function hitRank(el) {
    return { sidewalk: 5, arrow: 4, text: 4, stopline: 4, crosswalk: 3.5, scooterbox: 3.4, line: 3, chevron: 2.5, yellowbox: 2.5, surface: 2, section: 1, road: 0 }[el.type] || 0;
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
    if (el.pts) return el.pts.map((p, i) => ({ key: 'pts', i, p }));
    if (el.a) {
      const m = G.mid(el.a, el.b), t = G.fromAngle(el.dir || 0);
      const ext = (el.type === 'crosswalk' ? el.width / 2 : el.type === 'scooterbox' ? el.depth : el.width / 2) + 1.5;
      return [{ key: 'a', p: el.a }, { key: 'b', p: el.b }, { key: 'rot2', p: G.add(m, G.mul(t, ext * ppm())) }];
    }
    if (el.p) {
      const len = (el.type === 'arrow' ? el.length : el.type === 'symbol' ? R.iconSize(el)[1] : R.textLength(el)) * ppm();
      return [{ key: 'p', p: el.p }, { key: 'rot', p: G.add(el.p, G.mul(G.fromAngle(el.dir), len / 2 + 1.2 * ppm())) }];
    }
    return [];
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
    else if (S.tool === 'select') h = '點選物件編輯，拖曳控制點修改；雙擊邊線新增節點，Alt+點節點刪除。<kbd>Del</kbd> 刪除 <kbd>⌘D</kbd> 複製 <kbd>[ ]</kbd> 旋轉';
    else if (S.tool === 'pan') h = '拖曳平移；⌘/Ctrl+滾輪或觸控板捏合縮放';
    else if (S.tool === 'calibrate') h = '在圖上點兩點 (例如 Google 地圖比例尺兩端)，再輸入實際距離 (公尺)';
    else if (S.tool === 'measure') h = '點兩點量測距離';
    else if (S.item) {
      const m = S.item.mode;
      if (m === 'poly') h = '逐點點擊描繪範圍，<kbd>Enter</kbd>/雙擊/點回起點 完成，<kbd>⌫</kbd> 退一點，<kbd>Esc</kbd> 取消，<kbd>Shift</kbd> 鎖角度，<kbd>Alt</kbd> 不吸附';
      if (m === 'polyline') h = '沿道路中心 (或標線位置) 逐點點擊，<kbd>Enter</kbd>/雙擊 完成。畫線方向的右側=順向車道';
      if (m === 'two') h = '從道路一側點到另一側 — 會自動對齊最近車道方向 (與車流同向)';
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

  function strokeShape(sh, color, width) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash([]);
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
    const sel = findEl(S.sel);
    if (sel) {
      const sh = R.shape(sel, ppm(), P());
      if (sh) strokeShape(sh, '#3fb6ff', 1.5);
      if (sel.type === 'section' || sel.type === 'line') { ctx.setLineDash([4, 4]); strokeShape({ line: sel.pts }, '#ffffffaa', 1); ctx.setLineDash([]); }
      for (const h of handlesOf(sel)) {
        const s = toScreen(h.p);
        const isRot = h.key === 'rot' || h.key === 'rot2';
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
      else if (d.kind === 'move') { const el = findEl(S.sel); moveEl(el, d.orig, G.sub(w, d.w0)); d.moved = true; }
      else if (d.kind === 'handle') {
        const el = findEl(S.sel), h = d.h;
        const o = d.orig;
        const rotSnap = (a, near) => (e.shiftKey ? Math.round(a / (Math.PI / 12)) * (Math.PI / 12) : e.altKey ? a : magnetAngle(a, near, el.id));
        if (h.key === 'pts') {
          const nb = o.pts[h.i - 1] || o.pts[h.i + 1];
          el.pts[h.i] = snapW(w, nb, e, el.id);
        } else if (h.key === 'p') el.p = snapW(w, null, e, el.id);
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

  function deleteEl(id) { S.els = S.els.filter((e) => e.id !== id); if (S.sel === id) S.sel = null; commit(); }
  function duplicate(el) {
    const c = clone(el); c.id = newId();
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
    if (a === 'rotL') el.dir -= Math.PI / 12;
    if (a === 'rotR') el.dir += Math.PI / 12;
    commit();
  }


  // ---------------- align two objects ----------------
  const BAND = new Set(['crosswalk', 'stopline', 'scooterbox']);
  const POINT = new Set(['arrow', 'text', 'symbol']);
  const canAlign = (el) => el && (BAND.has(el.type) || POINT.has(el.type));
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
    S.align = { srcId: el.id, orig: clone(el), tgtId: null, opts: { gap: 0, ends: false, axis: true } };
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
    if (BAND.has(src.type)) {
      const c = centerOf(src), L = G.dist(src.a, src.b);
      let tDir = dirOf(tgt, c);
      if (G.dot(G.fromAngle(tDir), G.fromAngle(src.dir)) < 0) tDir += Math.PI; // keep the source's own traffic sense
      src.dir = tDir;
      if (BAND.has(tgt.type)) {
        let uT = G.norm(G.sub(tgt.b, tgt.a));
        if (G.dot(uT, G.sub(src.b, src.a)) < 0) uT = G.mul(uT, -1);
        src.a = G.sub(c, G.mul(uT, L / 2)); src.b = G.add(c, G.mul(uT, L / 2));
        const n = G.rightN(G.norm(G.sub(tgt.b, tgt.a)));
        const dC = G.dot(G.sub(c, tgt.a), n), side = Math.sign(dC) || 1, ns = G.mul(n, side);
        const want = side * (bandExtent(tgt, ns) + o.gap * ppm() + bandExtent(src, G.mul(ns, -1)));
        if (o.ends) {
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
  }
  function pickAlignTarget(el) {
    const A = S.align;
    if (!el || el.id === A.srcId) return;
    A.tgtId = el.id;
    const src = findEl(A.srcId);
    A.opts.gap = defaultGap(src, el);
    applyAlign(); commit(); updateHint();
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
      if (BAND.has(el.type) && BAND.has(tgt.type)) {
        box.appendChild(fieldRow({ kind: 'num', key: 'gap', label: '間距 Gap', min: 0, max: 30, step: 0.1,
          law: new Set([el.type, tgt.type]).has('crosswalk') && new Set([el.type, tgt.type]).has('stopline') ? '§170 停止線與行人穿越道淨距 2–3 m (受限時≥1 m)' : null }, A.opts, set));
        box.appendChild(fieldRow({ kind: 'chk', key: 'ends', label: '端點對齊 Match ends' }, A.opts, set));
        const i = document.createElement('div'); i.className = 'info'; i.textContent = '已設為平行並貼齊邊緣 (間距由邊緣量起)。Parallel, measured edge to edge.'; box.appendChild(i);
      } else if (POINT.has(el.type)) {
        if (tgt.a || tgt.p) box.appendChild(fieldRow({ kind: 'chk', key: 'axis', label: '對齊中心線 Same centre line' }, A.opts, set));
        const i = document.createElement('div'); i.className = 'info'; i.textContent = '方向已與目標一致。Direction matched to target.'; box.appendChild(i);
      } else {
        const i = document.createElement('div'); i.className = 'info'; i.textContent = '已轉為與目標行車方向垂直。Squared to target direction.'; box.appendChild(i);
      }
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
        S.els = d.els || []; S.ppm = d.ppm || 0; S.sel = null; S.hist = []; S.fut = []; S.cur = snapshot();
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
    S.cur = snapshot();
    if (!S.img) fitView();
    setTool('select');
    (function loop() { if (needs) { needs = false; render(); } requestAnimationFrame(loop); })();
  }
  window.__roadplan = S; // for debugging
  boot();
})();
