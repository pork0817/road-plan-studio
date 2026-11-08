// Rendering of road elements. All drawing happens in world (image-pixel) coordinates;
// physical sizes are in metres and converted with ppm (pixels per metre).
window.Render = (function () {
  const G = window.G;
  const R = {};
  const patternCache = new Map();

  function path(ctx, pts, closed) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
  }
  R.path = path;

  R.basePts = (el, ppm) => (el.smooth && el.pts.length > 2 ? G.smooth(el.pts, Math.max(2, ppm * 0.75)) : el.pts);
  const colorOf = (P, c) => P.colors[c] || c;

  // ---------- styled lines ----------
  R.drawStyled = function (ctx, pts, st, ppm) {
    if (!st || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = st.color; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const w = st.width * ppm;
    const one = (p, dashed) => {
      ctx.lineWidth = w;
      ctx.setLineDash(dashed ? st.dash.map((v) => v * ppm) : []);
      path(ctx, p); ctx.stroke();
    };
    const o = ((st.sep || 0) + st.width) / 2 * ppm;
    switch (st.pattern) {
      case 'solid': one(pts, false); break;
      case 'dashed': one(pts, true); break;
      case 'double': one(G.offset(pts, -o), false); one(G.offset(pts, o), false); break;
      case 'double-dashed': one(G.offset(pts, -o), true); one(G.offset(pts, o), true); break;
      case 'solid-dashed': one(G.offset(pts, -o), false); one(G.offset(pts, o), true); break;
    }
    ctx.restore();
  };

  // ---------- road section layout (offsets in metres, + = right of drawing direction) ----------
  R.sectionLayout = function (el) {
    const lines = [], bands = [];
    const lw = el.laneWidth, nF = el.lanesF | 0, nB = el.lanesB | 0;
    const stack = (start, side, n) => {
      let o = start;
      for (let i = 0; i < n; i++) { o += lw; if (i < n - 1) lines.push({ off: side * o, style: 'lane' }); }
      if (el.slowLane > 0) { lines.push({ off: side * o, style: 'slowSep' }); o += el.slowLane; }
      if (el.bikeLane > 0) { lines.push({ off: side * o, style: 'bikeSep' }); bands.push({ off: side * (o + el.bikeLane / 2), width: el.bikeLane, kind: 'bike' }); o += el.bikeLane; }
      if (el.edge) { lines.push({ off: side * (o + 0.075), style: 'edge' }); o += 0.3; }
      return o;
    };
    let left = 0, right = 0;
    if (nB === 0) {
      const W = nF * lw + (el.slowLane || 0) + (el.bikeLane || 0);
      const s0 = -W / 2;
      right = stack(s0, 1, nF);
      if (el.edge) { lines.push({ off: s0 - 0.075, style: 'edge' }); left = -s0 + 0.3; } else left = -s0;
    } else {
      const median = el.centerType === 'median';
      const mh = median ? el.medianWidth / 2 : 0;
      if (median) {
        bands.push({ off: 0, width: el.medianWidth, kind: 'median' });
        lines.push({ off: mh + 0.2, style: 'edge' }, { off: -(mh + 0.2), style: 'edge' });
      } else lines.push({ off: 0, style: el.centerType });
      const start = median ? mh + 0.3 : 0;
      right = nF > 0 ? stack(start, 1, nF) : start;
      left = stack(start, -1, nB);
    }
    return { lines, bands, left, right };
  };

  R.sectionPoly = function (el, ppm) {
    const pts = R.basePts(el, ppm);
    if (pts.length < 2) return null;
    const L = R.sectionLayout(el);
    const a = G.offset(pts, -L.left * ppm), b = G.offset(pts, L.right * ppm).reverse();
    return a.concat(b);
  };

  // ---------- crosswalk-like frames ----------
  // a→b is the line across the road; dir is traffic direction. Returns parallelogram data.
  R.frame = function (el, ppm, depthM, oneSided) {
    const u = G.norm(G.sub(el.b, el.a));
    const t = G.fromAngle(el.dir);
    const sin = Math.max(0.25, Math.abs(G.cross(u, t)));
    const Wt = (depthM * ppm) / sin;
    const L = G.dist(el.a, el.b);
    const back = oneSided ? 0 : Wt / 2, fwd = oneSided ? Wt : Wt / 2;
    const corners = [
      G.add(el.a, G.mul(t, -back)), G.add(el.b, G.mul(t, -back)),
      G.add(el.b, G.mul(t, fwd)), G.add(el.a, G.mul(t, fwd)),
    ];
    return { u, t, sin, Wt, L, corners, back, fwd };
  };

  function stripes(ctx, center, angle, width, gap, radius) {
    const v = G.fromAngle(angle), n = G.rightN(v), step = width + gap;
    const N = Math.ceil(radius / step) + 1;
    ctx.lineWidth = width; ctx.lineCap = 'butt'; ctx.setLineDash([]);
    ctx.beginPath();
    for (let k = -N; k <= N; k++) {
      const c = G.add(center, G.mul(n, k * step));
      ctx.moveTo(c.x - v.x * radius, c.y - v.y * radius);
      ctx.lineTo(c.x + v.x * radius, c.y + v.y * radius);
    }
    ctx.stroke();
  }

  function drawCrosswalk(ctx, el, ppm, P) {
    const spec = P.crosswalk[el.kind];
    const f = R.frame(el, ppm, el.width, false);
    ctx.fillStyle = P.colors.white;
    if (el.green) { ctx.fillStyle = P.colors.crossGreen; path(ctx, f.corners, true); ctx.fill(); ctx.fillStyle = P.colors.white; }
    if (el.kind === 'ties') {
      const bar = (spec.bar * ppm) / f.sin, gap = (el.gap * ppm) / f.sin, step = bar + gap;
      const n = Math.max(0, Math.floor((f.L + gap) / step));
      const start = (f.L - (n * step - gap)) / 2;
      for (let i = 0; i < n; i++) {
        const s0 = start + i * step;
        const p0 = G.add(el.a, G.mul(f.u, s0)), p1 = G.add(el.a, G.mul(f.u, s0 + bar));
        path(ctx, [G.add(p0, G.mul(f.t, -f.back)), G.add(p1, G.mul(f.t, -f.back)), G.add(p1, G.mul(f.t, f.fwd)), G.add(p0, G.mul(f.t, f.fwd))], true);
        ctx.fill();
      }
    } else {
      const e = (spec.edge * ppm) / f.sin;
      const strip = (o0, o1) => { path(ctx, [G.add(el.a, G.mul(f.t, o0)), G.add(el.b, G.mul(f.t, o0)), G.add(el.b, G.mul(f.t, o1)), G.add(el.a, G.mul(f.t, o1))], true); ctx.fill(); };
      strip(-f.back, -f.back + e); strip(f.fwd - e, f.fwd);
      ctx.save();
      path(ctx, [G.add(el.a, G.mul(f.t, -f.back + e)), G.add(el.b, G.mul(f.t, -f.back + e)), G.add(el.b, G.mul(f.t, f.fwd - e)), G.add(el.a, G.mul(f.t, f.fwd - e))], true);
      ctx.clip();
      ctx.strokeStyle = P.colors.white;
      stripes(ctx, G.mid(el.a, el.b), G.angle(f.u) + (spec.angle * Math.PI) / 180, spec.stripe * ppm, spec.gap * ppm, f.L + f.Wt);
      ctx.restore();
    }
  }

  function drawStopLine(ctx, el, ppm, P) {
    ctx.save();
    ctx.strokeStyle = P.colors.white; ctx.lineWidth = el.width * ppm; ctx.lineCap = 'butt'; ctx.setLineDash([]);
    path(ctx, [el.a, el.b]); ctx.stroke();
    ctx.restore();
  }

  // ---------- traced regulation shapes ----------
  const pathCache = new Map();
  function shapePath(d) {
    let p = pathCache.get(d);
    if (!p) { p = new Path2D(d); pathCache.set(d, p); }
    return p;
  }
  const shapes = () => window.RoadShapesTW || { glyphs: {}, icons: {} };

  // Draw one character/icon cell. Local frame: origin = cell centre, -y = forward (far end).
  function drawCell(ctx, P, ch, cw, cl, glyphD) {
    if (glyphD) {
      ctx.save(); ctx.translate(-cw / 2, -cl / 2); ctx.scale(cw, cl); ctx.fill(shapePath(glyphD), 'evenodd'); ctx.restore();
    } else {
      // not in the traced set: bold font stretched to the regulation cell
      ctx.save(); ctx.scale(1, cl / cw);
      ctx.font = `900 ${cw * 0.98}px ${P.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ch, 0, cw * 0.04); ctx.restore();
    }
  }

  function drawText(ctx, P, p, dir, str, charLen, charWid, color, order, gapPx) {
    const chars = Array.from(str || '');
    if (!chars.length) return;
    const n = chars.length, gap = gapPx != null ? gapPx : charLen * 0.4, total = n * charLen + (n - 1) * gap;
    const gl = shapes().glyphs;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(dir + Math.PI / 2);
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const ch = chars[order === 'far' ? n - 1 - i : i];
      const y = total / 2 - (i * (charLen + gap) + charLen / 2); // i=0 is nearest the approaching driver
      ctx.save(); ctx.translate(0, y); drawCell(ctx, P, ch, charWid, charLen, gl[ch]); ctx.restore();
    }
    ctx.restore();
  }
  const charGap = (el) => (el.charGap != null ? el.charGap : el.charLen * 0.4);
  R.textLength = (el) => { const n = Array.from(el.text || '').length; return n * el.charLen + Math.max(0, n - 1) * charGap(el); };

  // §174-1 / §183-1 icons
  R.iconSize = (el) => {
    const k = el.small ? 0.7 : 1;
    const s = { scooter: [0.9, 2.5], bike: [1.0, 1.8], scooterSmall: [0.65, 1.8] }[el.kind] || [1, 2];
    return [s[0] * k, s[1] * k];
  };
  function drawIcon(ctx, el, ppm, P) {
    const d = shapes().icons[el.kind];
    if (!d) return;
    const [w, h] = R.iconSize(el);
    ctx.save(); ctx.translate(el.p.x, el.p.y); ctx.rotate(el.dir + Math.PI / 2);
    ctx.fillStyle = P.colors.white;
    drawCell(ctx, P, '', w * ppm, h * ppm, d);
    ctx.restore();
  }

  function drawScooterBox(ctx, el, ppm, P) {
    const f = R.frame(el, ppm, el.depth, true);
    const b = (0.20 * ppm) / f.sin; // §174-2 front/back lines 20 cm
    ctx.fillStyle = P.colors.white;
    const strip = (o0, o1) => { path(ctx, [G.add(el.a, G.mul(f.t, o0)), G.add(el.b, G.mul(f.t, o0)), G.add(el.b, G.mul(f.t, o1)), G.add(el.a, G.mul(f.t, o1))], true); ctx.fill(); };
    strip(0, b); strip(f.Wt - b, f.Wt);
    const bu = (parseFloat(el.side) || 0.15) * ppm; // side lines 10 or 15 cm
    const side = (p, s) => { path(ctx, [p, G.add(p, G.mul(f.u, s * bu)), G.add(G.add(p, G.mul(f.u, s * bu)), G.mul(f.t, f.Wt)), G.add(p, G.mul(f.t, f.Wt))], true); ctx.fill(); };
    side(el.a, 1); side(el.b, -1);
    const c = G.add(G.mid(el.a, el.b), G.mul(f.t, f.Wt / 2));
    if (el.icon) {
      // §174-2 figure: 機車 icon inside the box (縮小型 when the box is shallow)
      const [w, h] = R.iconSize({ kind: 'scooter', small: el.depth < 3.2 });
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(el.dir + Math.PI / 2);
      const k = Math.min(1, (el.depth - 0.6) / h);
      drawCell(ctx, P, '', w * k * ppm, h * k * ppm, shapes().icons.scooter); ctx.restore();
    } else if (el.text) {
      const n = Array.from(el.text).length;
      const cl = Math.min(1.6, (el.depth * 0.75) / (n + (n - 1) * 0.3)) * ppm;
      drawText(ctx, P, c, el.dir, el.text, cl, cl * 0.45, P.colors.white, 'far', cl * 0.3);
    }
  }

  // ---------- §188 指向線 (arrows), built from the figure dimensions ----------
  // Units: metres. x = lateral (right +), y = forward from the tail (0 … 5.0).
  const arc = (cx, cy, r, a0, a1) => {
    const out = [], n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 60)));
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  };
  const DEG = Math.PI / 180;
  // 圖二 弧形箭頭 arm (left), attached at shaft top y=2.7, shaft x∈[-0.1,0.1]; outer R=2.0, inner R=1.2
  const ARM = (() => {
    const tOut = Math.atan2(1.55, 1.25);            // outer arc ends where it meets the head (-0.643, 4.257)
    const tIn = Math.acos((1.3 - 0.65) / 1.2);       // inner arc meets the spike line x=-0.65
    return [[-0.1, 2.7], [0.1, 2.7]]
      .concat(arc(-1.9, 2.7, 2.0, 0, tOut))
      .concat([[-0.45, 5.0], [-1.1, 4.25], [-0.65, 2.8]])
      .concat(arc(-1.3, 2.7, 1.2, tIn, 0));
  })();
  const mirror = (poly) => poly.map(([x, y]) => [-x, y]).reverse();
  const shift = (poly, dx, dy) => poly.map(([x, y]) => [x + dx, y + dy]);
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // 圖一 直線箭頭: head 2.6 m × 0.9 m, shaft 0.2 m, barbs 0.1 m below the shaft joint
  const STRAIGHT = [[-0.1, 0], [0.1, 0], [0.1, 2.5], [0.45, 2.4], [0, 5.0], [-0.45, 2.4], [-0.1, 2.5]];
  // 圖三 分岔箭頭 straight part: 0.3 m stub (0.4 m), shaft 0.2 m offset 0.05 m, head 2.3 m × 0.9 m
  const SPLIT_STRAIGHT = [[-0.05, 0.3], [0.15, 0.3], [0.15, 2.8], [0.5, 2.7], [0.05, 5.0], [-0.4, 2.7], [-0.05, 2.8]];
  const SPLIT_ARM = shift(ARM, -0.05, -2.3);
  const STUB = rect(-0.15, 0, 0.15, 0.4);
  const SL = [STUB, SPLIT_STRAIGHT, SPLIT_ARM];
  const ARROWS = {
    S: [STRAIGHT],
    L: [rect(-0.1, 0, 0.1, 2.75), ARM],
    R: [rect(-0.1, 0, 0.1, 2.75), mirror(ARM)],
    SL,
    SR: SL.map(mirror),
    LR: [rect(-0.1, 0, 0.1, 2.75), ARM, mirror(ARM)],                 // 圖四
    SLR: [STUB, SPLIT_STRAIGHT, mirror(SPLIT_STRAIGHT), SPLIT_ARM, mirror(SPLIT_ARM)], // 圖五
    // 迴轉: no figure in §188 — drawn with the same 0.2 m stroke and 圖二 head proportions (≈)
    U: (() => {
      const shaft = rect(-0.1, 0, 0.1, 3.4);
      const outer = arc(-0.7, 3.4, 0.8, 0, Math.PI), inner = arc(-0.7, 3.4, 0.6, Math.PI, 0);
      const bend = outer.concat(inner);
      const leg = rect(-1.5, 2.2, -1.3, 3.4);
      const head = [[-1.4, 0.9], [-1.85, 2.2], [-0.95, 2.2]];
      return [shaft, bend, leg, head];
    })(),
  };
  R.arrowKinds = Object.keys(ARROWS);

  function drawArrow(ctx, el, ppm, P) {
    const polys = ARROWS[el.kind] || ARROWS.S;
    const k = (el.length / 5) * ppm;
    ctx.save();
    ctx.translate(el.p.x, el.p.y); ctx.rotate(el.dir);
    // local: +x forward, +y right. Arrow data: y forward, x right; centre the 5 m length on p.
    ctx.fillStyle = P.colors.white;
    for (const poly of polys) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => { const X = (y - 2.5) * k, Y = x * k; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawHatched(ctx, el, ppm, P, twoWay) {
    if (el.pts.length < 3) return;
    const col = twoWay ? P.colors.yellow : colorOf(P, el.color);
    ctx.save();
    path(ctx, el.pts, true); ctx.clip();
    ctx.strokeStyle = col;
    const c = G.centroid(el.pts);
    let r = 0; el.pts.forEach((p) => { r = Math.max(r, G.dist(p, c)); });
    stripes(ctx, c, el.dir + Math.PI / 4, el.stripe * ppm, el.gap * ppm, r);
    if (twoWay) stripes(ctx, c, el.dir - Math.PI / 4, el.stripe * ppm, el.gap * ppm, r);
    ctx.lineWidth = el.border * ppm * 2; ctx.lineJoin = 'miter';
    path(ctx, el.pts, true); ctx.stroke();
    ctx.restore();
  }

  // ---------- sidewalk patterns ----------
  function sidewalkPattern(ctx, style, ppm) {
    const key = style + '|' + ppm.toFixed(3);
    if (patternCache.has(key)) return patternCache.get(key);
    const defs = {
      pavers: { base: '#a9a69f', joint: '#8f8c85', tile: 0.6 },
      redbrick: { base: '#b0614c', joint: '#8e4b3a', tile: 0.4 },
      concrete: { base: '#c3bfb6', joint: '#a6a299', tile: 1.5 },
      tactile: { base: '#a9a69f', joint: '#8f8c85', tile: 0.6 },
      island: { base: '#6a9a50', joint: '#5d8a46', tile: 0.8 },
    };
    const d = defs[style] || defs.pavers;
    const size = Math.round(d.tile * ppm);
    let result = d.base;
    if (size >= 6) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d');
      g.fillStyle = d.base; g.fillRect(0, 0, size, size);
      g.strokeStyle = d.joint; g.lineWidth = Math.max(1, size / 60);
      if (style === 'redbrick') {
        const rh = size / 4;
        for (let r = 0; r < 4; r++) {
          g.beginPath(); g.moveTo(0, r * rh); g.lineTo(size, r * rh); g.stroke();
          const off = r % 2 ? size / 4 : 0;
          for (let x = off; x < size + 1; x += size / 2) { g.beginPath(); g.moveTo(x, r * rh); g.lineTo(x, r * rh + rh); g.stroke(); }
        }
      } else if (style === 'island') {
        g.fillStyle = '#5c8a43';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(((i * 37) % 100) / 100 * size, ((i * 61) % 100) / 100 * size, size / 7, 0, Math.PI * 2); g.fill(); }
      } else {
        const div = style === 'concrete' ? 1 : 2;
        for (let i = 0; i < div; i++) { const p = (i * size) / div; g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.moveTo(p, 0); g.lineTo(p, size); g.stroke(); }
      }
      result = ctx.createPattern(c, 'repeat');
    }
    patternCache.set(key, result);
    return result;
  }

  function drawSidewalk(ctx, el, ppm, P) {
    if (el.pts.length < 3) return;
    ctx.save();
    ctx.fillStyle = sidewalkPattern(ctx, el.style, ppm);
    path(ctx, el.pts, true); ctx.fill();
    if (el.style === 'tactile') {
      // yellow tactile guide strip, 0.3m wide, 0.6m in from the first edge
      ctx.save(); path(ctx, el.pts, true); ctx.clip();
      const a = el.pts[0], b = el.pts[1];
      const t = G.norm(G.sub(b, a)); let n = G.rightN(t);
      if (!G.pointInPoly(G.add(G.mid(a, b), G.mul(n, ppm * 0.3)), el.pts)) n = G.mul(n, -1);
      const o = 0.75 * ppm;
      ctx.strokeStyle = '#e0b21c'; ctx.lineWidth = 0.3 * ppm; ctx.setLineDash([]);
      path(ctx, [G.add(G.add(a, G.mul(n, o)), G.mul(t, -1e4)), G.add(G.add(b, G.mul(n, o)), G.mul(t, 1e4))]); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = el.style === 'island' ? '#b9b5ab' : '#7d7a73';
    ctx.lineWidth = 0.25 * ppm; ctx.lineJoin = 'round'; ctx.setLineDash([]);
    path(ctx, el.pts, true); ctx.stroke();
    ctx.restore();
  }

  function drawSurface(ctx, el, ppm, P) {
    if (el.pts.length < 3) return;
    ctx.save();
    ctx.fillStyle = el.color; path(ctx, el.pts, true); ctx.fill();
    if (el.edge) { path(ctx, el.pts, true); ctx.clip(); ctx.strokeStyle = P.colors.white; ctx.lineWidth = 0.15 * ppm * 2; ctx.stroke(); }
    ctx.restore();
  }


  // ---------- roundabout ----------
  R.circlePts = (c, r, n = 96) => { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; o.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); } return o; };
  // R = outer edge of the circulating roadway; Ra = outer edge of the truck apron; Ri = raised central island
  R.rbRadii = (el) => { const Ri = Math.max(2, el.R - el.lanes * el.laneWidth - el.apron); return { Ro: el.R, Ri, Ra: Ri + el.apron }; };
  function drawRoundaboutLines(ctx, el, ppm, P) {
    const { Ro, Ra } = R.rbRadii(el), c = el.p;
    ctx.save(); ctx.strokeStyle = P.colors.white; ctx.lineCap = 'butt';
    for (let k = 1; k < el.lanes; k++) { // circulating lane lines (§182 車道線 4 m / 6 m)
      ctx.lineWidth = 0.1 * ppm; ctx.setLineDash([4 * ppm, 6 * ppm]);
      ctx.beginPath(); ctx.arc(c.x, c.y, (Ra + k * el.laneWidth) * ppm, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 0.15 * ppm; // §183 路面邊線 15 cm
    ctx.beginPath(); ctx.arc(c.x, c.y, (Ra + 0.25) * ppm, 0, 2 * Math.PI); ctx.stroke();
    const rr = Ro - 0.3;
    const gaps = (el.legs || []).map((g) => ({ c: g.ang, h: Math.asin(Math.min(0.99, (g.w + 0.6) / rr)) })).sort((a, b) => a.c - b.c);
    if (!gaps.length) { ctx.beginPath(); ctx.arc(c.x, c.y, rr * ppm, 0, 2 * Math.PI); ctx.stroke(); }
    for (let i = 0; i < gaps.length; i++) {
      const a0 = gaps[i].c + gaps[i].h, nx = gaps[(i + 1) % gaps.length];
      let a1 = nx.c - nx.h; if (i === gaps.length - 1) a1 += 2 * Math.PI;
      if (a1 > a0) { ctx.beginPath(); ctx.arc(c.x, c.y, rr * ppm, a0, a1); ctx.stroke(); }
    }
    ctx.restore();
  }
  function drawRoundaboutIsland(ctx, el, ppm, P) {
    const { Ri, Ra } = R.rbRadii(el);
    if (el.apron > 0) drawSidewalk(ctx, { pts: R.circlePts(el.p, Ra * ppm), style: 'concrete' }, ppm, P); // mountable truck apron
    drawSidewalk(ctx, { pts: R.circlePts(el.p, Ri * ppm), style: el.island || 'island' }, ppm, P);
  }

  // ---------- §172 讓路線 yield line ----------
  // Double white dashed line across the entry + an inverted triangle per lane (1.2 m × 3.0 m, 15 cm outline,
  // 60 cm solid top) whose top sits 2.0–2.5 m before the line. Dash size measured from the §172 figure (≈).
  R.YIELD_DEPTH = 0.54 + 2.25 + 3.0;
  function drawYield(ctx, el, ppm, P) {
    const u = G.norm(G.sub(el.b, el.a)), L = G.dist(el.a, el.b), t = G.fromAngle(el.dir);
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = P.colors.white; ctx.lineCap = 'butt';
    ctx.lineWidth = 0.18 * ppm; ctx.setLineDash([0.36 * ppm, 0.24 * ppm]);
    for (const sv of [-0.09, -0.45]) { const o = G.mul(t, sv * ppm); path(ctx, [G.add(el.a, o), G.add(el.b, o)]); ctx.stroke(); }
    ctx.setLineDash([]);
    if (el.triangles) {
      const n = Math.max(1, el.lanes | 0);
      const ins = 0.15 / Math.cos(Math.atan(0.6 / 3.0)), hw = (q) => (0.6 * q) / 3.0, u1 = 3.0 - 0.6, u0 = (ins * 3.0) / 0.6 + 0.1;
      for (let k = 0; k < n; k++) {
        const cpt = G.add(el.a, G.mul(u, (L * (k + 0.5)) / n));
        const Q = (sv, wv) => G.add(G.add(cpt, G.mul(t, sv * ppm)), G.mul(u, wv * ppm));
        const base = -(0.54 + 2.25), apex = base - 3.0;
        ctx.beginPath();
        [[base, -0.6], [base, 0.6], [apex, 0]].forEach(([sv, wv], i) => { const q = Q(sv, wv); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
        ctx.closePath();
        [[apex + u1, -(hw(u1) - ins)], [apex + u1, hw(u1) - ins], [apex + u0, 0]].forEach(([sv, wv], i) => { const q = Q(sv, wv); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
        ctx.closePath(); ctx.fill('evenodd');
      }
    }
    ctx.restore();
  }

  // ---------- scene ----------
  const MARK = new Set(['roundabout', 'yield', 'symbol', 'line', 'section', 'crosswalk', 'stopline', 'scooterbox', 'arrow', 'text', 'chevron', 'yellowbox']);

  R.drawScene = function (ctx, o) {
    const { ppm, P } = o;
    const els = o.preview ? o.els.concat([o.preview]) : o.els;
    if (o.background) { ctx.fillStyle = o.background; ctx.fillRect(0, 0, o.w, o.h); }
    if (o.img && o.imgOpacity > 0) { ctx.globalAlpha = o.imgOpacity; ctx.drawImage(o.img, 0, 0); ctx.globalAlpha = 1; }

    // Layer 0: pavement
    ctx.save(); ctx.globalAlpha = o.roadOpacity;
    const tones = { asphalt: P.colors.asphalt, worn: P.colors.asphaltWorn, concrete: P.colors.concrete };
    for (const el of els) {
      if (el.type === 'road' && el.pts.length >= 3) { ctx.fillStyle = tones[el.tone] || P.colors.asphalt; path(ctx, el.pts, true); ctx.fill(); }
      if (el.type === 'section' && el.pave) { const poly = R.sectionPoly(el, ppm); if (poly) { ctx.fillStyle = P.colors.asphalt; path(ctx, poly, true); ctx.fill(); } }
      if (el.type === 'roundabout') { ctx.fillStyle = P.colors.asphalt; path(ctx, R.circlePts(el.p, el.R * ppm), true); ctx.fill(); }
    }
    ctx.restore();

    // Clip markings to the road surface
    ctx.save();
    if (o.clip) {
      const polys = [];
      for (const el of els) {
        if (el.type === 'road' && el.pts.length >= 3) polys.push(el.pts);
        if (el.type === 'section' && el.pave) { const p = R.sectionPoly(el, ppm); if (p) polys.push(p); }
        if (el.type === 'roundabout') polys.push(R.circlePts(el.p, el.R * ppm));
      }
      if (polys.length) {
        ctx.beginPath();
        for (let p of polys) {
          if (G.area(p) < 0) p = p.slice().reverse();
          ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y); ctx.closePath();
        }
        ctx.clip('nonzero');
      }
    }
    // Layer 1: coloured surfaces
    for (const el of els) {
      if (el.type === 'surface') drawSurface(ctx, el, ppm, P);
      if (el.type === 'section') {
        const pts = R.basePts(el, ppm);
        if (pts.length < 2) continue;
        for (const b of R.sectionLayout(el).bands) if (b.kind === 'bike') {
          ctx.strokeStyle = P.colors.bike; ctx.lineWidth = b.width * ppm; ctx.lineCap = 'butt'; ctx.setLineDash([]);
          path(ctx, G.offset(pts, b.off * ppm)); ctx.stroke();
        }
      }
    }
    // Layer 2: markings. Lane lines are interrupted inside intersection areas.
    const junctions = els.filter((e) => e.type === 'junction' && e.pts.length >= 3)
      .concat(els.filter((e) => e.type === 'roundabout').map((e) => ({ pts: R.circlePts(e.p, (e.R + 1.2) * ppm, 72) })));
    const cutJunctions = () => {
      if (!junctions.length) return;
      ctx.beginPath(); ctx.rect(-1e6, -1e6, 2e6, 2e6);
      for (const j of junctions) { ctx.moveTo(j.pts[0].x, j.pts[0].y); for (let i = 1; i < j.pts.length; i++) ctx.lineTo(j.pts[i].x, j.pts[i].y); ctx.closePath(); }
      ctx.clip('evenodd');
    };
    for (const el of els) {
      if (!MARK.has(el.type)) continue;
      ctx.save();
      if (el.type === 'line' || el.type === 'section') cutJunctions();
      switch (el.type) {
        case 'line': R.drawStyled(ctx, R.basePts(el, ppm), P.lineStyles[el.style], ppm); break;
        case 'section': {
          const pts = R.basePts(el, ppm);
          if (pts.length < 2) break;
          for (const l of R.sectionLayout(el).lines) R.drawStyled(ctx, G.offset(pts, l.off * ppm), P.lineStyles[l.style], ppm);
          break;
        }
        case 'crosswalk': drawCrosswalk(ctx, el, ppm, P); break;
        case 'stopline': drawStopLine(ctx, el, ppm, P); break;
        case 'scooterbox': drawScooterBox(ctx, el, ppm, P); break;
        case 'arrow': drawArrow(ctx, el, ppm, P); break;
        case 'symbol': drawIcon(ctx, el, ppm, P); break;
        case 'roundabout': drawRoundaboutLines(ctx, el, ppm, P); break;
        case 'yield': drawYield(ctx, el, ppm, P); break;
        case 'text': drawText(ctx, P, el.p, el.dir, el.text, el.charLen * ppm, el.charWid * ppm, colorOf(P, el.color), el.order, charGap(el) * ppm); break;
        // §171 槽化線 border 15 / stripe 20 / gap 30 cm; §173 網狀線 border 20 / lines 10 cm, spacing user (1–5 m)
        case 'chevron': drawHatched(ctx, Object.assign({}, el, { border: 0.15, stripe: 0.20, gap: 0.30 }), ppm, P, false); break;
        case 'yellowbox': drawHatched(ctx, Object.assign({}, el, { border: 0.20, stripe: 0.10, gap: Math.max(0, el.gap - 0.10) }), ppm, P, true); break;
      }
      ctx.restore();
    }
    ctx.restore();

    // Layer 3: sidewalks & medians always on top (crosswalks run "under" them)
    for (const el of els) {
      if (el.type === 'sidewalk') drawSidewalk(ctx, el, ppm, P);
      if (el.type === 'roundabout') drawRoundaboutIsland(ctx, el, ppm, P);
      if (el.type === 'section') {
        const pts = R.basePts(el, ppm);
        if (pts.length < 2) continue;
        for (const b of R.sectionLayout(el).bands) if (b.kind === 'median') {
          const poly = G.offset(pts, -b.width / 2 * ppm).concat(G.offset(pts, b.width / 2 * ppm).reverse());
          if (!junctions.length) { drawSidewalk(ctx, { pts: poly, style: 'island' }, ppm, P); continue; }
          // median stops at intersections: cut by the junction area, with a curb along the cut end
          ctx.save(); cutJunctions(); drawSidewalk(ctx, { pts: poly, style: 'island' }, ppm, P); ctx.restore();
          ctx.save(); path(ctx, poly, true); ctx.clip(); cutJunctions();
          ctx.strokeStyle = '#b9b5ab'; ctx.lineWidth = 0.5 * ppm; ctx.lineJoin = 'round'; ctx.setLineDash([]);
          for (const j of junctions) { path(ctx, j.pts, true); ctx.stroke(); }
          ctx.restore();
        }
      }
    }
  };

  // ---------- shapes for hit-testing & selection outline ----------
  R.shape = function (el, ppm, P) {
    switch (el.type) {
      case 'road': case 'sidewalk': case 'surface': case 'chevron': case 'yellowbox': case 'junction': return { poly: el.pts };
      case 'line': { const st = P.lineStyles[el.style]; return { line: R.basePts(el, ppm), w: ((st ? st.width + (st.sep || 0) * 2 : 0.2) * ppm) }; }
      case 'section': { const p = R.sectionPoly(el, ppm); return p ? { poly: p } : { line: el.pts, w: 4 }; }
      case 'crosswalk': return { poly: R.frame(el, ppm, el.width, false).corners };
      case 'scooterbox': return { poly: R.frame(el, ppm, el.depth, true).corners };
      case 'roundabout': return { poly: R.circlePts(el.p, el.R * ppm, 48) };
      case 'yield': { const t = G.mul(G.fromAngle(el.dir), -R.YIELD_DEPTH * ppm); return { poly: [el.a, el.b, G.add(el.b, t), G.add(el.a, t)] }; }
      case 'stopline': { const n = G.mul(G.rightN(G.norm(G.sub(el.b, el.a))), (el.width * ppm) / 2); return { poly: [G.add(el.a, n), G.add(el.b, n), G.sub(el.b, n), G.sub(el.a, n)] }; }
      case 'arrow': case 'text': case 'symbol': {
        const sz = el.type === 'symbol' ? R.iconSize(el) : null;
        const len = (el.type === 'arrow' ? el.length : el.type === 'text' ? R.textLength(el) : sz[1]) * ppm;
        const wid = (el.type === 'arrow' ? 2.6 : el.type === 'text' ? el.charWid * 1.2 : sz[0] * 1.2) * ppm;
        const t = G.fromAngle(el.dir), n = G.rightN(t);
        const c = el.p, a = G.mul(t, len / 2), b = G.mul(n, wid / 2);
        return { poly: [G.add(G.sub(c, a), G.mul(b, -1)), G.add(G.add(c, a), G.mul(b, -1)), G.add(G.add(c, a), b), G.add(G.sub(c, a), b)] };
      }
    }
    return null;
  };

  return R;
})();
