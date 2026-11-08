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

  function drawText(ctx, P, p, dir, str, charLen, charWid, color, order, gapPx) {
    const chars = Array.from(str || '');
    if (!chars.length) return;
    const n = chars.length, gap = gapPx != null ? gapPx : charLen * 0.3, total = n * charLen + (n - 1) * gap;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(dir + Math.PI / 2);
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${charWid}px ${P.fontFamily}`;
    for (let i = 0; i < n; i++) {
      const ch = chars[order === 'far' ? n - 1 - i : i];
      const y = total / 2 - (i * (charLen + gap) + charLen / 2); // i=0 is nearest the approaching driver
      ctx.save(); ctx.translate(0, y); ctx.scale(1, charLen / charWid); ctx.fillText(ch, 0, charWid * 0.04); ctx.restore();
    }
    ctx.restore();
  }
  const charGap = (el) => (el.charGap != null ? el.charGap : el.charLen * 0.3);
  R.textLength = (el) => { const n = Array.from(el.text || '').length; return n * el.charLen + Math.max(0, n - 1) * charGap(el); };

  function drawScooterBox(ctx, el, ppm, P) {
    const f = R.frame(el, ppm, el.depth, true);
    const b = (0.20 * ppm) / f.sin; // §174-2 front/back lines 20 cm
    ctx.fillStyle = P.colors.white;
    const strip = (o0, o1) => { path(ctx, [G.add(el.a, G.mul(f.t, o0)), G.add(el.b, G.mul(f.t, o0)), G.add(el.b, G.mul(f.t, o1)), G.add(el.a, G.mul(f.t, o1))], true); ctx.fill(); };
    strip(0, b); strip(f.Wt - b, f.Wt);
    const bu = (parseFloat(el.side) || 0.15) * ppm; // side lines 10 or 15 cm
    const side = (p, s) => { path(ctx, [G.add(p, G.mul(f.t, 0)), G.add(G.add(p, G.mul(f.u, s * bu)), G.mul(f.t, 0)), G.add(G.add(p, G.mul(f.u, s * bu)), G.mul(f.t, f.Wt)), G.add(p, G.mul(f.t, f.Wt))], true); ctx.fill(); };
    side(el.a, 1); side(el.b, -1);
    const n = Array.from(el.text || '').length || 1;
    const cl = Math.min(1.6, (el.depth * 0.75) / (n + (n - 1) * 0.3)) * ppm;
    drawText(ctx, P, G.add(G.mid(el.a, el.b), G.mul(f.t, f.Wt / 2)), el.dir, el.text, cl, cl * 0.5, P.colors.white, 'far', cl * 0.3);
  }

  function drawArrow(ctx, el, ppm, P) {
    const L = el.length * ppm, u = L / 5;
    const hw = 0.12 * u, hl = 1.4 * u, hh = 0.45 * u, thl = 1.0 * u, thh = 0.4 * u;
    ctx.save();
    ctx.translate(el.p.x, el.p.y); ctx.rotate(el.dir); ctx.translate(-L / 2, 0);
    ctx.fillStyle = ctx.strokeStyle = P.colors.white;
    ctx.lineWidth = 2 * hw; ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
    const tri = (a, b, c) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath(); ctx.fill(); };
    const straight = () => {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L - hl + 1, 0); ctx.stroke();
      tri([L - hl, -hh], [L, 0], [L - hl, hh]);
    };
    const turn = (s, fromX) => { // s=-1 left, +1 right (local y is to the right)
      const x0 = L - 2.2 * u, xe = L - 1.2 * u, ye = s * 0.55 * u;
      ctx.beginPath(); ctx.moveTo(fromX, 0); ctx.lineTo(x0, 0); ctx.quadraticCurveTo(xe, 0, xe, ye); ctx.stroke();
      tri([xe - thh, ye], [xe, ye + s * thl], [xe + thh, ye]);
    };
    const k = el.kind;
    if (k === 'S') straight();
    if (k === 'SL') { straight(); turn(-1, L * 0.3); }
    if (k === 'SR') { straight(); turn(1, L * 0.3); }
    if (k === 'L') turn(-1, 0);
    if (k === 'R') turn(1, 0);
    if (k === 'LR') { turn(-1, 0); turn(1, L * 0.3); }
    if (k === 'U') {
      const s = -1, x0 = L - 2.4 * u, r = 0.6 * u, y = s * 2 * r;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x0, 0);
      ctx.bezierCurveTo(x0 + 1.35 * r * 1.3, 0, x0 + 1.35 * r * 1.3, y, x0, y);
      ctx.lineTo(x0 - 0.8 * u, y); ctx.stroke();
      tri([x0 - 0.8 * u + 1, y - thh], [x0 - 0.8 * u - thl, y], [x0 - 0.8 * u + 1, y + thh]);
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

  // ---------- scene ----------
  const MARK = new Set(['line', 'section', 'crosswalk', 'stopline', 'scooterbox', 'arrow', 'text', 'chevron', 'yellowbox']);

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
    }
    ctx.restore();

    // Clip markings to the road surface
    ctx.save();
    if (o.clip) {
      const polys = [];
      for (const el of els) {
        if (el.type === 'road' && el.pts.length >= 3) polys.push(el.pts);
        if (el.type === 'section' && el.pave) { const p = R.sectionPoly(el, ppm); if (p) polys.push(p); }
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
    // Layer 2: markings
    for (const el of els) {
      if (!MARK.has(el.type)) continue;
      ctx.save();
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
      if (el.type === 'section') {
        const pts = R.basePts(el, ppm);
        if (pts.length < 2) continue;
        for (const b of R.sectionLayout(el).bands) if (b.kind === 'median') {
          const poly = G.offset(pts, -b.width / 2 * ppm).concat(G.offset(pts, b.width / 2 * ppm).reverse());
          drawSidewalk(ctx, { pts: poly, style: 'island' }, ppm, P);
        }
      }
    }
  };

  // ---------- shapes for hit-testing & selection outline ----------
  R.shape = function (el, ppm, P) {
    switch (el.type) {
      case 'road': case 'sidewalk': case 'surface': case 'chevron': case 'yellowbox': return { poly: el.pts };
      case 'line': { const st = P.lineStyles[el.style]; return { line: R.basePts(el, ppm), w: ((st ? st.width + (st.sep || 0) * 2 : 0.2) * ppm) }; }
      case 'section': { const p = R.sectionPoly(el, ppm); return p ? { poly: p } : { line: el.pts, w: 4 }; }
      case 'crosswalk': return { poly: R.frame(el, ppm, el.width, false).corners };
      case 'scooterbox': return { poly: R.frame(el, ppm, el.depth, true).corners };
      case 'stopline': { const n = G.mul(G.rightN(G.norm(G.sub(el.b, el.a))), (el.width * ppm) / 2); return { poly: [G.add(el.a, n), G.add(el.b, n), G.sub(el.b, n), G.sub(el.a, n)] }; }
      case 'arrow': case 'text': {
        const len = (el.type === 'arrow' ? el.length : R.textLength(el)) * ppm;
        const wid = (el.type === 'arrow' ? 2.4 : el.charWid * 1.2) * ppm;
        const t = G.fromAngle(el.dir), n = G.rightN(t);
        const c = el.p, a = G.mul(t, len / 2), b = G.mul(n, wid / 2);
        return { poly: [G.add(G.sub(c, a), G.mul(b, -1)), G.add(G.add(c, a), G.mul(b, -1)), G.add(G.add(c, a), b), G.add(G.sub(c, a), b)] };
      }
    }
    return null;
  };

  return R;
})();
