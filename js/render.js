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

  R.basePts = (el, ppm) => {
    let pts = el.pts;
    // a bike lane joined to a bus stop leaves the join in the stop's own direction (guide point 2 m out along it)
    if (el.type === 'bikelane' && (el.tanS || el.tanE) && pts.length >= 2) {
      pts = pts.slice();
      if (el.tanE) pts.splice(pts.length - 1, 0, G.add(pts[pts.length - 1], G.mul(el.tanE, 2 * ppm)));
      if (el.tanS) pts.splice(1, 0, G.add(pts[0], G.mul(el.tanS, 2 * ppm)));
      return G.smooth(pts, Math.max(2, ppm * 0.75));
    }
    return el.smooth && pts.length > 2 ? G.smooth(pts, Math.max(2, ppm * 0.75)) : pts;
  };
  const colorOf = (P, c) => P.colors[c] || c;


  // ---------- curved area edges ----------
  // el.bend[i] (px, relative to edge i's chord): the curve's midpoint sits n across and t along from the chord's
  // midpoint. Edge i runs from pts[i] to pts[i+1] (closing edge last); drawn as a quadratic curve through that point.
  R.areaPts = (el) => {
    const pts = el.pts, bend = el.bend;
    if (!pts || !bend || !bend.some(Boolean)) return pts;
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const A = pts[i], B = pts[(i + 1) % n], bd = bend[i];
      out.push(A);
      if (!bd) continue;
      const d = G.sub(B, A), L = G.len(d);
      if (L < 1e-6) continue;
      const dir = G.mul(d, 1 / L), nrm = G.rightN(dir), mid = G.mid(A, B);
      const M = G.add(G.add(mid, G.mul(nrm, bd.n)), G.mul(dir, bd.t || 0)), Cc = G.sub(G.mul(M, 2), mid);
      const k = Math.max(8, Math.min(48, Math.ceil((L + 2 * Math.abs(bd.n)) / 6)));
      for (let j = 1; j < k; j++) {
        const t = j / k, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        out.push({ x: a * A.x + b * Cc.x + c * B.x, y: a * A.y + b * Cc.y + c * B.y });
      }
    }
    return out;
  };
  R.bendMid = (el, i) => { // the point on edge i's curve halfway along (handle position)
    const A = el.pts[i], B = el.pts[(i + 1) % el.pts.length], bd = el.bend && el.bend[i], mid = G.mid(A, B);
    if (!bd) return mid;
    const d = G.norm(G.sub(B, A));
    return G.add(G.add(mid, G.mul(G.rightN(d), bd.n)), G.mul(d, bd.t || 0));
  };

  // ---------- styled lines ----------
  R.drawStyled = function (ctx, pts, st, ppm, dashOffsetPx) {
    if (!st || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = st.color; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.lineDashOffset = dashOffsetPx || 0; // lets a bent continuation keep the dash rhythm of the straight line
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
  // Lane layout across a road section. Every line / band carries a key (side + role) so the layouts at the two
  // ends of a section whose lane count changes can be matched up. anchorW (one-way roads) keeps the left edge
  // where the narrower layout had it, so added lanes appear on the right.
  R.sectionLayout = function (el, anchorW) {
    const lines = [], bands = [];
    const lw = el.laneWidth, nF = el.lanesF | 0, nB = el.lanesB | 0;
    const stack = (start, side, n) => {
      let o = start;
      const sd = side > 0 ? 'R' : 'L';
      for (let i = 0; i < n; i++) { o += lw; if (i < n - 1) lines.push({ off: side * o, style: 'lane', key: sd + 'lane' + i }); }
      if (el.slowLane > 0) { lines.push({ off: side * o, style: 'slowSep', key: sd + 'slow' }); o += el.slowLane; }
      if (el.bikeLane > 0) { lines.push({ off: side * o, style: 'bikeSep', key: sd + 'bikeSep' }); bands.push({ off: side * (o + el.bikeLane / 2), width: el.bikeLane, kind: 'bike', key: sd + 'bike' }); o += el.bikeLane; }
      if (el.edge) { lines.push({ off: side * (o + 0.075), style: 'edge', key: sd + 'edge' }); o += 0.3; }
      return o;
    };
    let left = 0, right = 0;
    if (nB === 0) {
      const W = nF * lw + (el.slowLane || 0) + (el.bikeLane || 0);
      const s0 = -(anchorW != null ? anchorW : W) / 2;
      right = stack(s0, 1, nF);
      if (el.edge) { lines.push({ off: s0 - 0.075, style: 'edge', key: 'Ledge' }); left = -s0 + 0.3; } else left = -s0;
    } else {
      const median = el.centerType === 'median';
      const mh = median ? el.medianWidth / 2 : 0;
      if (median) {
        bands.push({ off: 0, width: el.medianWidth, kind: 'median', key: 'median' });
        lines.push({ off: mh + 0.2, style: 'edge', key: 'm+' }, { off: -(mh + 0.2), style: 'edge', key: 'm-' });
      } else lines.push({ off: 0, style: el.centerType, key: 'centre' });
      const start = median ? mh + 0.3 : 0;
      right = nF > 0 ? stack(start, 1, nF) : start;
      left = stack(start, -1, nB);
    }
    return { lines, bands, left, right };
  };

  // ---------- lane additions / drops along a section ----------
  // lanesF2 / lanesB2: lane counts after the change; changeAt: where the taper starts (m from the first point);
  // taper: its length (m). Added lanes open on the kerb side; a dropped lane narrows away over the taper.
  R.hasLaneChange = (el) => el.type === 'section' && ((el.lanesF2 != null && el.lanesF2 !== '' && +el.lanesF2 !== +el.lanesF) || (el.lanesB2 != null && el.lanesB2 !== '' && +el.lanesB2 !== +el.lanesB));
  R.sectionEnd = (el) => Object.assign({}, el, { lanesF: el.lanesF2 != null && el.lanesF2 !== '' ? +el.lanesF2 : el.lanesF, lanesB: el.lanesB2 != null && el.lanesB2 !== '' ? +el.lanesB2 : el.lanesB });
  const densify = (pts, step) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(G.dist(pts[i - 1], pts[i]) / step));
      for (let k = 1; k <= n; k++) out.push(G.add(pts[i - 1], G.mul(G.sub(pts[i], pts[i - 1]), k / n)));
    }
    return out;
  };
  const offsetVar = (pts, d) => { // like G.offset, with a per-point distance
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const nPrev = i > 0 ? G.rightN(G.norm(G.sub(pts[i], pts[i - 1]))) : null;
      const nNext = i < n - 1 ? G.rightN(G.norm(G.sub(pts[i + 1], pts[i]))) : null;
      let m;
      if (!nPrev) m = nNext; else if (!nNext) m = nPrev;
      else { const sm = G.add(nPrev, nNext), l = G.len(sm); m = l < 1e-6 ? nNext : G.mul(G.mul(sm, 1 / l), 1 / Math.max(G.dot(G.mul(sm, 1 / l), nNext), 0.25)); }
      out.push({ x: pts[i].x + m.x * d[i], y: pts[i].y + m.y * d[i] });
    }
    return out;
  };
  // Full geometry of a section: offset polylines for every line and band, and the two pavement edges.
  const geomCache = new WeakMap();
  R.sectionGeom = function (el, ppm) { // cached per element: called many times per frame
    const sig = JSON.stringify([ppm, el.pts, el.smooth, el.lanesF, el.lanesB, el.lanesF2, el.lanesB2, el.changeAt, el.taper, el.laneWidth, el.centerType, el.medianWidth, el.slowLane, el.bikeLane, el.edge]);
    const c = geomCache.get(el);
    if (c && c.sig === sig) return c.g;
    const g = sectionGeomRaw(el, ppm);
    geomCache.set(el, { sig, g });
    return g;
  };
  function sectionGeomRaw(el, ppm) {
    let pts = R.basePts(el, ppm);
    if (pts.length < 2) return null;
    const ch = R.hasLaneChange(el);
    const L0 = R.sectionLayout(el);
    if (!ch) {
      return { pts, L: L0,
        lines: L0.lines.map((l) => ({ l, pts: G.offset(pts, l.off * ppm) })),
        bands: L0.bands.map((b) => ({ b, pts: G.offset(pts, b.off * ppm) })),
        left: G.offset(pts, -L0.left * ppm), right: G.offset(pts, L0.right * ppm) };
    }
    pts = densify(pts, ppm);
    const e1 = R.sectionEnd(el);
    const W0 = el.lanesB === 0 ? el.lanesF * el.laneWidth + (el.slowLane || 0) + (el.bikeLane || 0) : null;
    const L1 = R.sectionLayout(e1, e1.lanesB === 0 && el.lanesB === 0 ? W0 : undefined);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + G.dist(pts[i - 1], pts[i]) / ppm);
    const cA = Math.max(0, +el.changeAt || 0), tp = Math.max(1, +el.taper || 30);
    const w = cum.map((sm) => G.clamp((sm - cA) / tp, 0, 1));
    const lerp = (a, b) => w.map((u) => (a + (b - a) * u) * ppm);
    const slice = (poly, from, to) => { // the part of an offset polyline between two stations (m)
      const out = [];
      for (let i = 0; i < poly.length; i++) if (cum[i] >= from - 1e-6 && cum[i] <= to + 1e-6) out.push(poly[i]);
      return out.length > 1 ? G.trimLoops(out) : null;
    };
    const total = cum[cum.length - 1];
    const match = (A, B, make) => {
      const res = [], bk = new Map(B.map((x) => [x.key, x]));
      for (const a of A) {
        const b = bk.get(a.key);
        if (b) { bk.delete(a.key); res.push(make(a, G.trimLoops(offsetVar(pts, lerp(a.off, b.off))))); }
        else { const q = slice(offsetVar(pts, lerp(a.off, a.off)), 0, cA); if (q) res.push(make(a, q)); } // gone after the change
      }
      for (const b of bk.values()) { const q = slice(offsetVar(pts, lerp(b.off, b.off)), cA + tp, total); if (q) res.push(make(b, q)); } // new after the change
      return res;
    };
    return { pts, L: L0, L1, cum, w,
      lines: match(L0.lines, L1.lines, (l, q) => ({ l, pts: q })),
      bands: match(L0.bands, L1.bands, (b, q) => ({ b, pts: q })),
      left: G.trimLoops(offsetVar(pts, lerp(-L0.left, -L1.left))), right: G.trimLoops(offsetVar(pts, lerp(L0.right, L1.right))) };
  }
  // pavement edge distances (m) at a station (m) along the section, following any lane-change taper
  R.sectionExtAt = function (el, sM) {
    const L0 = R.sectionLayout(el);
    if (!R.hasLaneChange(el)) return { left: L0.left, right: L0.right };
    const e1 = R.sectionEnd(el), W0 = el.lanesB === 0 ? el.lanesF * el.laneWidth + (el.slowLane || 0) + (el.bikeLane || 0) : null;
    const L1 = R.sectionLayout(e1, e1.lanesB === 0 && el.lanesB === 0 ? W0 : undefined);
    const u = G.clamp((sM - (+el.changeAt || 0)) / Math.max(1, +el.taper || 30), 0, 1);
    return { left: L0.left + (L1.left - L0.left) * u, right: L0.right + (L1.right - L0.right) * u };
  };
  // the layout (lane counts and edge distances) in force at a station (m) along the section
  R.sectionAt = function (el, sM) {
    if (!R.hasLaneChange(el)) return { el, L: R.sectionLayout(el) };
    const cA = +el.changeAt || 0, tp = Math.max(1, +el.taper || 30);
    const end = sM >= cA + tp / 2, e = end ? R.sectionEnd(el) : el;
    const W0 = el.lanesB === 0 ? el.lanesF * el.laneWidth + (el.slowLane || 0) + (el.bikeLane || 0) : null;
    return { el: e, L: R.sectionLayout(e, end && el.lanesB === 0 ? W0 : undefined) };
  };

  R.sectionPoly = function (el, ppm) {
    const g = R.sectionGeom(el, ppm);
    if (!g) return null;
    return g.left.concat(g.right.slice().reverse());
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


  // ---------- crosswalk geometry: rectangle/parallelogram or free trapezoid ----------
  // el.quad (px): [c0, c1, c2, c3] — back edge c0→c1 and front edge c3→c2 (the two edges traffic crosses);
  // side ends c0–c3 (at a) and c1–c2 (at b).
  R.crosswalkQuad = (el, ppm) => (el.quad && el.quad.length === 4 ? el.quad : R.frame(el, ppm, el.width, false).corners);
  // the crosswalk grown by pad (m) beyond its back and front edges (for median openings and lane-line cuts)
  R.crosswalkPad = (el, ppm, padM) => {
    if (!(el.quad && el.quad.length === 4)) return R.frame(el, ppm, el.width + 2 * padM, false).corners;
    const [c0, c1, c2, c3] = el.quad, d = G.norm(G.sub(G.mid(c3, c2), G.mid(c0, c1))), o = G.mul(d, padM * ppm);
    return [G.sub(c0, o), G.sub(c1, o), G.add(c2, o), G.add(c3, o)];
  };
  const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  function drawCrosswalkQuad(ctx, el, ppm, P) {
    const spec = P.crosswalk[el.kind], [c0, c1, c2, c3] = el.quad;
    const back = (t) => lerpP(c0, c1, t), front = (t) => lerpP(c3, c2, t);
    const L = G.dist(G.mid(c0, c3), G.mid(c1, c2)) / ppm; // crossing length along the centre line (m)
    ctx.save();
    path(ctx, el.quad, true);
    if (el.green) { ctx.fillStyle = P.colors.crossGreen; ctx.fill(); }
    ctx.clip();
    ctx.strokeStyle = ctx.fillStyle = P.colors.white; ctx.lineCap = 'butt'; ctx.setLineDash([]);
    const ext = (a, b, m) => { const d = G.mul(G.norm(G.sub(b, a)), m); return [G.sub(a, d), G.add(b, d)]; };
    if (el.kind === 'ties') {
      // Bars stay parallel to traffic, 40 cm wide with the same gap between every pair (as in Japan's
      // trapezoid crossings); only their length changes, ending on the slanted edges of the shape.
      const bar = spec.bar * ppm, gap = el.gap * ppm, pitch = bar + gap;
      const d = G.fromAngle(el.dir != null ? el.dir : G.angle(G.sub(G.mid(c3, c2), G.mid(c0, c1))));
      let u = G.rightN(d); if (G.dot(G.sub(G.mid(c1, c2), G.mid(c0, c3)), u) < 0) u = G.mul(u, -1);
      const cen = G.centroid(el.quad), us = el.quad.map((c) => G.dot(G.sub(c, cen), u));
      const lo = Math.min(...us), hi = Math.max(...us), n = Math.max(0, Math.floor((hi - lo + gap) / pitch));
      const first = lo + ((hi - lo) - (n * pitch - gap)) / 2;
      // length (px) of a line across the shape (along d) at lateral position uu
      const spanAt = (uu) => {
        const O = G.add(cen, G.mul(u, uu)); let tMin = Infinity, tMax = -Infinity;
        for (let k = 0; k < 4; k++) {
          const a = el.quad[k], b = el.quad[(k + 1) % 4], r = G.sub(b, a), den = G.cross(d, r);
          if (Math.abs(den) < 1e-9) continue;
          const t = G.cross(G.sub(a, O), r) / den, s = G.cross(G.sub(a, O), d) / den;
          if (s >= -1e-9 && s <= 1 + 1e-9) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
        }
        return tMax > tMin ? tMax - tMin : 0;
      };
      for (let i = 0; i < n; i++) {
        const u0 = first + i * pitch;
        // a bar that would only be a sliver at a slanted side is left out
        if (Math.min(spanAt(u0 + 0.05 * bar), spanAt(u0 + 0.95 * bar)) < 1.0 * ppm) continue;
        const far = 1e4;
        const a0 = G.add(cen, G.mul(u, u0)), a1 = G.add(cen, G.mul(u, u0 + bar));
        path(ctx, [G.add(a0, G.mul(d, -far)), G.add(a1, G.mul(d, -far)), G.add(a1, G.mul(d, far)), G.add(a0, G.mul(d, far))], true);
        ctx.fill();
      }
    } else {
      // edge lines (10 cm) along both edges, inside the shape; 45° stripes between them
      const inward = (a, b, other) => { let nn = G.rightN(G.norm(G.sub(b, a))); if (G.dot(G.sub(other, a), nn) < 0) nn = G.mul(nn, -1); return nn; };
      const e = spec.edge * ppm;
      const nb = inward(c0, c1, c3), nf = inward(c3, c2, c0);
      ctx.lineWidth = e;
      for (const [a, b, nn] of [[c0, c1, nb], [c3, c2, nf]]) { const [p0, p1] = ext(G.add(a, G.mul(nn, e / 2)), G.add(b, G.mul(nn, e / 2)), 2 * ppm); path(ctx, [p0, p1]); ctx.stroke(); }
      ctx.save();
      path(ctx, [G.add(c0, G.mul(nb, e)), G.add(c1, G.mul(nb, e)), G.add(c2, G.mul(nf, e)), G.add(c3, G.mul(nf, e))], true); ctx.clip();
      const u = G.norm(G.sub(G.mid(c1, c2), G.mid(c0, c3))), cen = G.mid(G.mid(c0, c2), G.mid(c1, c3));
      let rad = 0; for (const c of el.quad) rad = Math.max(rad, G.dist(c, cen));
      stripes(ctx, cen, G.angle(u) + (spec.angle * Math.PI) / 180, spec.stripe * ppm, spec.gap * ppm, rad + ppm);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawCrosswalk(ctx, el, ppm, P) {
    if (el.quad && el.quad.length === 4) { drawCrosswalkQuad(ctx, el, ppm, P); return; }
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

  // Each arrow is centred on p by its whole outline (not its shaft), so turn and combined arrows — whose arm
  // sticks out to one side — sit visually in the middle of the lane like a straight arrow does.
  const arrowBox = {};
  R.arrowBox = (kind) => {
    if (!arrowBox[kind]) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const poly of ARROWS[kind] || ARROWS.S) for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      arrowBox[kind] = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    }
    return arrowBox[kind];
  };
  function drawArrow(ctx, el, ppm, P) {
    const polys = ARROWS[el.kind] || ARROWS.S, bx = R.arrowBox(el.kind);
    const k = (el.length / 5) * ppm;
    ctx.save();
    ctx.translate(el.p.x, el.p.y); ctx.rotate(el.dir);
    // local: +x forward, +y right. Arrow data: y forward, x right; the outline's centre sits on p.
    ctx.fillStyle = P.colors.white;
    for (const poly of polys) {
      ctx.beginPath();
      poly.forEach(([x, y], i) => { const X = (y - bx.cy) * k, Y = (x - bx.cx) * k; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawHatched(ctx, el, ppm, P, twoWay) {
    const aPts = R.areaPts(el);
    if (aPts.length < 3) return;
    const col = twoWay ? P.colors.yellow : colorOf(P, el.color);
    ctx.save();
    path(ctx, aPts, true); ctx.clip();
    ctx.strokeStyle = col;
    const c = G.centroid(aPts);
    let r = 0; aPts.forEach((p) => { r = Math.max(r, G.dist(p, c)); });
    stripes(ctx, c, el.dir + Math.PI / 4, el.stripe * ppm, el.gap * ppm, r);
    if (twoWay) stripes(ctx, c, el.dir - Math.PI / 4, el.stripe * ppm, el.gap * ppm, r);
    ctx.lineWidth = el.border * ppm * 2; ctx.lineJoin = 'miter';
    path(ctx, aPts, true); ctx.stroke();
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
    const aPts = R.areaPts(el);
    if (aPts.length < 3) return;
    ctx.save();
    ctx.fillStyle = sidewalkPattern(ctx, el.style, ppm);
    path(ctx, aPts, true); ctx.fill();
    if (el.style === 'tactile') {
      // yellow tactile guide strip, 0.3m wide, 0.6m in from the first edge
      ctx.save(); path(ctx, aPts, true); ctx.clip();
      const a = aPts[0], b = aPts[1];
      const t = G.norm(G.sub(b, a)); let n = G.rightN(t);
      if (!G.pointInPoly(G.add(G.mid(a, b), G.mul(n, ppm * 0.3)), aPts)) n = G.mul(n, -1);
      const o = 0.75 * ppm;
      ctx.strokeStyle = '#e0b21c'; ctx.lineWidth = 0.3 * ppm; ctx.setLineDash([]);
      path(ctx, [G.add(G.add(a, G.mul(n, o)), G.mul(t, -1e4)), G.add(G.add(b, G.mul(n, o)), G.mul(t, 1e4))]); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = el.style === 'island' ? '#b9b5ab' : '#7d7a73';
    ctx.lineWidth = 0.25 * ppm; ctx.lineJoin = 'round'; ctx.setLineDash([]);
    path(ctx, aPts, true); ctx.stroke();
    ctx.restore();
  }

  function drawSurface(ctx, el, ppm, P) {
    const aPts = R.areaPts(el);
    if (aPts.length < 3) return;
    ctx.save();
    ctx.fillStyle = el.color; path(ctx, aPts, true); ctx.fill();
    if (el.edge) { path(ctx, aPts, true); ctx.clip(); ctx.strokeStyle = P.colors.white; ctx.lineWidth = 0.15 * ppm * 2; ctx.stroke(); }
    ctx.restore();
  }


  // ---------- roundabout ----------
  R.circlePts = (c, r, n = 96) => { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; o.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); } return o; };
  // R = outer edge of the circulating roadway; Ra = outer edge of the truck apron; Ri = raised central island
  R.rbRadii = (el) => { const Ri = Math.max(2, el.R - el.lanes * el.laneWidth - el.apron); return { Ro: el.R, Ri, Ra: Ri + el.apron }; };
  function drawRoundaboutLines(ctx, el, ppm, P) {
    if (el.turbo) { drawTurboLines(ctx, el, ppm, P); return; }
    const { Ro, Ra } = R.rbRadii(el), c = el.p;
    ctx.save(); ctx.strokeStyle = P.colors.white; ctx.lineCap = 'butt';
    // circulating lane lines (§182 車道線, 4 m dash / 6 m gap on the outermost line). Every circle uses the same
    // whole number of dashes at the same angles, so dashes stay lined up radially at any radius.
    if (el.lanes > 1) {
      const rOut = Ra + (el.lanes - 1) * el.laneWidth, N = Math.max(6, Math.round((2 * Math.PI * rOut) / 10));
      const seg = (2 * Math.PI) / N, dash = seg * 0.4;
      ctx.lineWidth = 0.1 * ppm; ctx.setLineDash([]);
      for (let k = 1; k < el.lanes; k++) {
        const r = (Ra + k * el.laneWidth) * ppm;
        ctx.beginPath();
        for (let i = 0; i < N; i++) { const a0 = i * seg; ctx.moveTo(c.x + r * Math.cos(a0), c.y + r * Math.sin(a0)); ctx.arc(c.x, c.y, r, a0, a0 + dash); }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]); ctx.lineWidth = 0.15 * ppm; // §183 路面邊線 15 cm
    ctx.beginPath(); ctx.arc(c.x, c.y, (Ra + 0.25) * ppm, 0, 2 * Math.PI); ctx.stroke();
    ctx.restore(); // outer edge: drawRoundaboutKerbs
  }
  function drawRoundaboutIsland(ctx, el, ppm, P) {
    if (el.turbo) { drawTurboIsland(ctx, el, ppm, P); return; }
    const { Ri, Ra } = R.rbRadii(el);
    if (el.apron > 0) drawSidewalk(ctx, { pts: R.circlePts(el.p, Ra * ppm), style: 'concrete' }, ppm, P); // mountable truck apron
    drawSidewalk(ctx, { pts: R.circlePts(el.p, Ri * ppm), style: el.island || 'island' }, ppm, P);
  }


  // ---------- turbo roundabout ----------
  // Two lanes separated by a spiral divider. Every boundary (island, divider, outer edge) is a pair of
  // semicircles around centres offset ±Δ/2 along the turbo axis, so it steps by Δ at the axis. The steps are
  // blended over ±τ and centred on the main road: there the outer lane peels off as the exit and a new inner
  // lane opens for the entry. Right-hand traffic circulates counter-clockwise; no lane changes on the ring.
  R.turboGeom = (el) => {
    const w = el.laneWidth, sep = el.divider === 'double' ? 0.3 : 0.45, D = w + sep;
    const Rout = el.R - D / 2, Rdo = Rout - w, Rdi = Rdo - sep, R1 = Math.max(3, Rdi - w);
    const tau = ((el.turboTaper || 20) * Math.PI) / 180;
    return { w, sep, D, Rout, Rdo, Rdi, R1, al: el.turboAxis || 0, tau, nose: Math.min(tau, (12 * Math.PI) / 180) };
  };
  // distance (m) from the centre to a spiral boundary of nominal radius r, at screen angle th
  R.turboR = (g, r, th, tauOverride) => {
    const f = (x) => { const sgn = x >= 0 ? 1 : -1, h = g.D / 2; return sgn * h * Math.cos(x) + Math.sqrt(Math.max(0, r * r - (h * Math.sin(x)) ** 2)); };
    const d = Math.atan2(Math.sin(th - g.al), Math.cos(th - g.al)), t = tauOverride || g.tau;
    if (Math.abs(d) < t) { const k = (d + t) / (2 * t); return f(-t) * (1 - k) + f(t) * k; }
    if (Math.PI - Math.abs(d) < t) { const dd = d > 0 ? d - Math.PI : d + Math.PI, k = (dd + t) / (2 * t); return f(Math.PI - t) * (1 - k) + f(-Math.PI + t) * k; }
    return f(d);
  };
  const ringPts = (el, g, r, ppm, d0 = -Math.PI, d1 = Math.PI, rFn) => {
    const o = [], n = Math.max(8, Math.ceil(((d1 - d0) * 180) / Math.PI));
    for (let i = 0; i <= n; i++) {
      const d = d0 + ((d1 - d0) * i) / n, th = g.al + d, rr = (rFn ? rFn(d, r) : R.turboR(g, r, th)) * ppm;
      o.push({ x: el.p.x + rr * Math.cos(th), y: el.p.y + rr * Math.sin(th) });
    }
    return o;
  };
  R.turboEdgeAt = (el, g, th, rM, ppm) => R.turboR(g, rM, th) * ppm;
  R.rbOutline = (el, ppm, extraM = 0) => {
    if (!el.turbo) return R.circlePts(el.p, (el.R + extraM) * ppm);
    const g = R.turboGeom(el), o = ringPts(el, g, g.Rout + extraM, ppm);
    o.pop(); return o;
  };
  // divider pieces run between the steps (relative angle ranges), with tapered tips
  const dividerRanges = (g) => [[g.tau, Math.PI - g.tau], [-Math.PI + g.tau, -g.tau]];
  function dividerPoly(el, g, ppm, d0, d1) {
    const tip = (8 * Math.PI) / 180, mid = (g.Rdi + g.Rdo) / 2, half = (g.Rdo - g.Rdi) / 2;
    const k = (d) => Math.min(1, (d - d0) / tip, (d1 - d) / tip);
    const outer = ringPts(el, g, 0, ppm, d0, d1, (d) => R.turboR(g, mid, g.al + d) + half * k(d));
    const inner = ringPts(el, g, 0, ppm, d0, d1, (d) => R.turboR(g, mid, g.al + d) - half * k(d));
    return outer.concat(inner.reverse());
  }
  // true where the ring edge faces paving outside the ring (a road mouth), so no kerb line belongs there
  function openMouth(el, ppm) {
    const pav = R.cornerPaving(el, ppm);
    return (th) => {
      const r = (el.turbo ? R.turboR(R.turboGeom(el), R.turboGeom(el).Rout + 0.4, th) : el.R + 0.4) * ppm;
      const q = { x: el.p.x + r * Math.cos(th), y: el.p.y + r * Math.sin(th) };
      return pav.some((pv) => G.pointInPoly(q, pv));
    };
  }
  function edgeWithGaps(ctx, el, ppm, radiusAt, legs, extraGap) {
    const inGap = (th) => (extraGap && extraGap(th)) || (legs || []).some((g) => { const r = radiusAt(g.ang) / ppm; const h = g.h != null ? g.h : Math.asin(Math.min(0.99, (g.w + 0.6) / Math.max(r, 1))); return Math.abs(Math.atan2(Math.sin(th - g.ang), Math.cos(th - g.ang))) < h; });
    const N = 360; let open = false;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * 2 * Math.PI, r = radiusAt(th);
      const q = { x: el.p.x + r * Math.cos(th), y: el.p.y + r * Math.sin(th) };
      if (inGap(th)) { open = false; continue; }
      if (open) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); open = true; }
    }
    ctx.stroke();
  }
  function drawTurboLines(ctx, el, ppm, P) {
    const g = R.turboGeom(el);
    ctx.save(); ctx.strokeStyle = P.colors.white; ctx.lineCap = 'butt'; ctx.setLineDash([]);
    ctx.lineWidth = 0.15 * ppm;
    path(ctx, ringPts(el, g, g.R1 + 0.25, ppm, -Math.PI, Math.PI, (d, r) => R.turboR(g, r, g.al + d, g.nose)), true); ctx.stroke(); // edge line along the island
    if (el.divider === 'double') {                                                         // §167 雙白實線 divider
      ctx.lineWidth = 0.1 * ppm;
      for (const [d0, d1] of dividerRanges(g)) for (const r of [g.Rdi + 0.05, g.Rdo - 0.05]) { path(ctx, ringPts(el, g, r, ppm, d0, d1)); ctx.stroke(); }
    }
    ctx.restore(); // outer edge: drawRoundaboutKerbs
  }
  function drawTurboIsland(ctx, el, ppm, P) {
    const g = R.turboGeom(el);
    drawSidewalk(ctx, { pts: ringPts(el, g, g.R1, ppm, -Math.PI, Math.PI, (d, r) => R.turboR(g, r, g.al + d, g.nose)), style: el.island || 'island' }, ppm, P);
    if (el.divider !== 'double') for (const [d0, d1] of dividerRanges(g)) drawSidewalk(ctx, { pts: dividerPoly(el, g, ppm, d0, d1), style: 'concrete' }, ppm, P); // raised lane divider
  }


  // ---------- roundabout corners (curved kerb returns) ----------
  const shortArc = (c, r, p0, p1) => {
    const a0 = Math.atan2(p0.y - c.y, p0.x - c.x), a1 = Math.atan2(p1.y - c.y, p1.x - c.x);
    const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), n = Math.max(6, Math.ceil(Math.abs(d) / (Math.PI / 90)));
    const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (d * i) / n; o.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }); }
    return o;
  };
  R.cornerPaving = (rb, ppm) => (rb.corners || []).filter((k) => k.E).map((k) =>
    shortArc(k.Q, k.rf * ppm, k.T1, k.T2).concat(shortArc(k.C, k.Rb * ppm, k.T2, k.E).slice(1)));
  function drawCornerLines(ctx, rb, ppm, P) {
    ctx.save(); ctx.strokeStyle = P.colors.white; ctx.lineWidth = 0.15 * ppm; ctx.setLineDash([]); ctx.lineCap = 'butt';
    const cs = rb.corners || [];
    const pav = cs.map((k) => (k.E ? shortArc(k.Q, k.rf * ppm, k.T1, k.T2).concat(shortArc(k.C, k.Rb * ppm, k.T2, k.E).slice(1)) : null));
    cs.forEach((k, i) => {
      // start a hair before the tangent point so the straight edge line and the curve overlap (no gap)
      const r = (k.rf + 0.225) * ppm, a1 = Math.atan2(k.T2.y - k.Q.y, k.T2.x - k.Q.x);
      let a0 = Math.atan2(k.T1.y - k.Q.y, k.T1.x - k.Q.x); const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      a0 -= Math.sign(d) * (0.05 * ppm) / r;
      const span = d + Math.sign(d) * (0.05 * ppm) / r, n = Math.max(8, Math.ceil(Math.abs(span) / (Math.PI / 180)));
      const pts = [];
      for (let j = 0; j <= n; j++) {
        const a = a0 + (span * j) / n, q = { x: k.Q.x + r * Math.cos(a), y: k.Q.y + r * Math.sin(a) };
        // a neighbouring road's paved corner overlaps here: the kerb ends where the two roads meet
        if (j > 0 && cs.some((o, oi) => o.leg !== k.leg && pav[oi] && G.pointInPoly(q, pav[oi]))) break;
        pts.push(q);
      }
      if (pts.length > 1) { path(ctx, pts); ctx.stroke(); }
    });
    ctx.restore();
  }


  // ---------- roundabout kerb (edge) lines from the real outline ----------
  // The paved area around a roundabout is the union of the ring, the curved corners and the roads that join
  // it. Its edge line is drawn ONCE, 0.225 m inside the boundary of that union: boundary pieces that lie
  // inside another piece (road mouths, shared edges) are skipped, so lines can never overlap, gap or step.
  // Outside the zone near the ring, each road keeps drawing its own edge line at the same position.
  function drawRoundaboutKerbs(ctx, el, ppm, P) {
    const els = R._els || [];
    const polys = [R.rbOutline(el, ppm)].concat(R.cornerPaving(el, ppm));
    for (const id of el.legSecIds || []) { const sec = els.find((e) => e.id === id); const sp = sec && R.sectionPoly(sec, ppm); if (sp) polys.push(sp); }
    const C = el.p;
    let zone = el.R + 2;
    for (const k of el.corners || []) zone = Math.max(zone, G.dist(k.T1, C) / ppm + 1.5);
    const zonePx = zone * ppm, inset = 0.225 * ppm, eps = 0.06 * ppm, step = 0.2 * ppm;
    ctx.save(); ctx.strokeStyle = P.colors.white; ctx.lineWidth = 0.15 * ppm; ctx.setLineDash([]); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const runs = [];
    polys.forEach((poly, pi) => {
      if (!poly || poly.length < 3) return;
      const ccw = G.area(poly) > 0;
      let run = [];
      const flush = () => { if (run.length > 1) { path(ctx, run); ctx.stroke(); runs.push(run); } run = []; };
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], len = G.dist(a, b);
        if (len < 1e-6) continue;
        const t = G.mul(G.sub(b, a), 1 / len);
        const nIn = ccw ? G.rightN(t) : G.leftN(t); // inward normal (screen coords, y down)
        const keep = (u) => { // is the boundary point at distance u along this edge part of the outer kerb?
          const q = G.add(a, G.mul(t, u));
          if (G.dist(q, C) > zonePx) return false;
          const out = G.sub(q, G.mul(nIn, eps));
          return !polys.some((o, oi) => oi !== pi && o && G.pointInPoly(out, o));
        };
        const ptAt = (u) => G.add(G.add(a, G.mul(t, u)), G.mul(nIn, inset));
        const n = Math.max(1, Math.ceil(len / step));
        let prevU = 0, prevK = keep(0);
        if (prevK) run.push(ptAt(0));
        for (let j = 1; j <= n; j++) {
          const u = (len * j) / n, k = keep(u);
          if (k !== prevK) { // find the exact switch point so neighbouring pieces meet without a notch
            let lo = prevU, hi = u;
            for (let r = 0; r < 18; r++) { const md = (lo + hi) / 2; if (keep(md) === prevK) lo = md; else hi = md; }
            const sw = (lo + hi) / 2;
            if (prevK) { run.push(ptAt(sw)); flush(); } else { run.push(ptAt(sw)); }
          }
          if (k) run.push(ptAt(u));
          prevU = u; prevK = k;
        }
        if (!prevK) flush();
      }
      flush();
      flush();
    });
    // where two outline pieces meet at an angle, their inset lines end a little apart: join those ends
    const ends = runs.flatMap((r, ri) => [{ p: r[0], ri }, { p: r[r.length - 1], ri }]);
    ctx.lineCap = 'round';
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
      if (ends[i].ri === ends[j].ri) continue;
      const d = G.dist(ends[i].p, ends[j].p);
      if (d > 1e-3 && d < 0.8 * ppm) { path(ctx, [ends[i].p, ends[j].p]); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- §172 讓路線 yield line ----------
  // Double white dashed line across the entry + an inverted triangle per lane (1.2 m × 3.0 m, 15 cm outline,
  // 60 cm solid top) whose top sits 2.0–2.5 m before the line. Dash size measured from the §172 figure (≈).
  R.YIELD_DEPTH = 0.54 + 2.25 + 3.0;
  const YIELD_INS = 0.15 / Math.cos(Math.atan(0.6 / 3.0));
  function yieldTriangle(ctx, Q) {
    const hw = (q) => (0.6 * q) / 3.0, u1 = 3.0 - 0.6, u0 = (YIELD_INS * 3.0) / 0.6 + 0.1, ins = YIELD_INS;
    const base = -(0.54 + 2.25), apex = base - 3.0;
    ctx.beginPath();
    [[base, -0.6], [base, 0.6], [apex, 0]].forEach(([sv, wv], i) => { const q = Q(sv, wv); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.closePath();
    [[apex + u1, -(hw(u1) - ins)], [apex + u1, hw(u1) - ins], [apex + u0, 0]].forEach(([sv, wv], i) => { const q = Q(sv, wv); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
    ctx.closePath(); ctx.fill('evenodd');
  }
  // Yield line that follows the roundabout's edge. Each end is where the lane edge (a line along the
  // approach direction through a / b) meets the arc, so the line spans every lane. Triangles stay aligned
  // with their lane (apex toward approaching traffic) and their base follows the arc's tangent there.
  function drawYieldCurved(ctx, el, ppm, P) {
    const C = el.arcC, r0 = el.arcR * ppm, t = G.fromAngle(el.dir), u = G.rightN(t);
    const hit = (p, rr) => {
      const f = G.sub(p, C), b = G.dot(f, t), c = G.dot(f, f) - rr * rr, disc = b * b - c;
      if (disc < 0) return p;
      const s1 = -b - Math.sqrt(disc), s2 = -b + Math.sqrt(disc);
      return G.add(p, G.mul(t, Math.abs(s1) < Math.abs(s2) ? s1 : s2));
    };
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = P.colors.white; ctx.lineCap = 'butt';
    ctx.lineWidth = 0.18 * ppm; ctx.setLineDash([0.36 * ppm, 0.24 * ppm]);
    for (const off of [0.09, 0.45]) {
      const rr = r0 + off * ppm, ea = hit(el.a, rr), eb = hit(el.b, rr);
      const a0 = Math.atan2(ea.y - C.y, ea.x - C.x), a1 = Math.atan2(eb.y - C.y, eb.x - C.x);
      const d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      ctx.beginPath(); ctx.arc(C.x, C.y, rr, a0, a0 + d, d < 0); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (el.triangles && el.tris && el.tris.length) drawLaneTriangles(ctx, el.tris, ppm);
    else if (el.triangles) {
      const n = Math.max(1, el.lanes | 0), L = G.dist(el.a, el.b), ab = G.norm(G.sub(el.b, el.a));
      for (let k = 0; k < n; k++) {
        const Pk = hit(G.add(el.a, G.mul(ab, (L * (k + 0.5)) / n)), r0);
        yieldTriangle(ctx, (sv, wv) => G.add(G.add(Pk, G.mul(t, sv * ppm)), G.mul(u, wv * ppm)));
      }
    }
    ctx.restore();
  }
  // triangles placed on each lane's own path: tip toward approaching cars, base square to that lane's travel
  function drawLaneTriangles(ctx, tris, ppm) {
    for (const tr of tris) {
      const t = G.fromAngle(tr.dir), u = G.rightN(t), lead = (0.54 + 2.25 + 1.5) * ppm;
      const cpt = { x: tr.x + t.x * lead, y: tr.y + t.y * lead };
      yieldTriangle(ctx, (sv, wv) => G.add(G.add(cpt, G.mul(t, sv * ppm)), G.mul(u, wv * ppm)));
    }
  }
  function drawYield(ctx, el, ppm, P) {
    if (el.curved && el.arcC) { drawYieldCurved(ctx, el, ppm, P); return; }
    const u = G.norm(G.sub(el.b, el.a)), L = G.dist(el.a, el.b), t = G.fromAngle(el.dir);
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = P.colors.white; ctx.lineCap = 'butt';
    ctx.lineWidth = 0.18 * ppm; ctx.setLineDash([0.36 * ppm, 0.24 * ppm]);
    for (const sv of [-0.09, -0.45]) { const o = G.mul(t, sv * ppm); path(ctx, [G.add(el.a, o), G.add(el.b, o)]); ctx.stroke(); }
    ctx.setLineDash([]);
    if (el.triangles && el.tris && el.tris.length) drawLaneTriangles(ctx, el.tris, ppm);
    else if (el.triangles) {
      const n = Math.max(1, el.lanes | 0);
      for (let k = 0; k < n; k++) {
        const cpt = G.add(el.a, G.mul(u, (L * (k + 0.5)) / n));
        yieldTriangle(ctx, (sv, wv) => G.add(G.add(cpt, G.mul(t, sv * ppm)), G.mul(u, wv * ppm)));
      }
    }
    ctx.restore();
  }


  // ---------- bike lanes (draw the centre line; markings build themselves) ----------
  // §174 自行車專用車道: brick-red surface, separated from traffic by 雙白實線, white diamonds 2.5 × 1.0 m
  // (15 cm line) every 30–60 m, bike icons (§183-1). §174-4 自行車優先車道: two white solid lines ≥ 1.2 m apart
  // with bike icons. Widths follow the design manual (≈): one-way ≥ 1.2 m (1.5–2.0 typical), two-way ≥ 2.5 m.
  R.bikeBand = (el, ppm, padM = 0) => {
    const pts = R.basePts(el, ppm);
    if (pts.length < 2) return null;
    const h = (el.width / 2 + padM) * ppm;
    return G.offset(pts, -h).concat(G.offset(pts, h).reverse());
  };
  function along(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + G.dist(pts[i - 1], pts[i])); return cum; }
  function atLen(pts, cum, s) {
    let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], u = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return { p: G.add(a, G.mul(G.sub(b, a), G.clamp(u, 0, 1))), t: G.norm(G.sub(b, a)) };
  }
  function drawBikeSurface(ctx, el, ppm, P) {
    if (!el.surface) return;
    const band = R.bikeBand(el, ppm); if (!band) return;
    ctx.fillStyle = el.type === 'buslane' ? (el.color || P.colors.bus) : P.colors.bike; path(ctx, band, true); ctx.fill();
  }
  function drawBikeLane(ctx, el, ppm, P) {
    const pts = R.basePts(el, ppm); if (pts.length < 2) return;
    const w = el.width, white = P.colors.white;
    const solid = { color: white, width: 0.10, pattern: 'solid' };
    const dbl = { color: white, width: 0.10, sep: 0.10, pattern: 'double' };
    const sideOff = (sgn, st) => sgn * (w / 2 - ((st.sep || 0) + st.width * (st.sep != null ? 2 : 1)) / 2);
    if (el.kind === 'priority') {
      for (const sg of [-1, 1]) R.drawStyled(ctx, G.offset(pts, sideOff(sg, solid) * ppm), solid, ppm);
    } else {
      if (el.sep === 'edges') { // standard look: one thin white solid line along each edge
        for (const sg of [-1, 1]) R.drawStyled(ctx, G.offset(pts, sg * (w / 2 - 0.1) * ppm), solid, ppm);
      }
      const sides = el.sep === 'both' ? [-1, 1] : el.sep === 'right' ? [1] : el.sep === 'none' || el.sep === 'edges' ? [] : [-1];
      // §174: 雙白實線; where the lane's vehicles may move to the next lane, 單邊禁止變換車道線 (solid on the
      // traffic side, dashed on the lane side, 10 cm lines 10 cm apart)
      const mixed = { color: white, width: 0.10, sep: 0.10, pattern: 'solid-dashed', dash: [4, 6] };
      for (const sg of sides) {
        const st = el.sepStyle === 'mixed' ? mixed : el.sepStyle === 'single' ? solid : dbl, line = G.offset(pts, sideOff(sg, st) * ppm);
        R.drawStyled(ctx, sg > 0 && st === mixed ? line.slice().reverse() : line, st, ppm);
      }
    }
    if (el.twoWay) R.drawStyled(ctx, pts, { color: white, width: 0.10, pattern: 'dashed', dash: [1, 1] }, ppm); // ≈ centre line
    // symbols along the lane
    const cum = along(pts), total = cum[cum.length - 1] / ppm, sp = G.clamp(el.spacing || 40, 10, 100);
    const icon = (s, off, flip) => {
      const q = atLen(pts, cum, s * ppm), dirv = flip ? G.mul(q.t, -1) : q.t, p = G.add(q.p, G.mul(G.rightN(q.t), off * ppm));
      drawIcon(ctx, { kind: 'bike', small: (el.twoWay ? w / 2 : w) < 1.5, p, dir: G.angle(dirv) }, ppm, P);
    };
    // §174: a diamond at the start of the lane and every 30–60 m; the wording / icon sits midway between diamonds
    const diamond = (sd) => {
      const q = atLen(pts, cum, sd * ppm), n = G.rightN(q.t), L = 1.25 * ppm, Wd = Math.min(0.5, w / 2 - 0.2) * ppm;
      ctx.save(); ctx.strokeStyle = white; ctx.lineWidth = 0.15 * ppm; ctx.lineJoin = 'miter'; ctx.setLineDash([]);
      path(ctx, [G.add(q.p, G.mul(q.t, L)), G.add(q.p, G.mul(n, Wd)), G.sub(q.p, G.mul(q.t, L)), G.sub(q.p, G.mul(n, Wd))], true); ctx.stroke();
      ctx.restore();
    };
    const hasDiamonds = el.kind !== 'priority' && el.diamonds !== false;
    // §175 bus-lane wording, written along the lane: always whole. A diamond starts each run (after every
    // intersection, §174); the wording follows it, repeats between diamonds, and is repeated just before the end.
    const txt = el.text || '公車專用', nTxt = Array.from(txt).length, tLen = nTxt * 2.5 + (nTxt - 1) * 1.0;
    const words = [];
    const putWords = (mid) => { if (mid - tLen / 2 > 0.5 && mid + tLen / 2 < total - 0.5 && words.every((w) => Math.abs(w - mid) > tLen + 2)) words.push(mid); };
    for (let sd = Math.min(2, total / 4); sd < total - 1.3; sd += sp) {
      if (hasDiamonds) diamond(sd);
      let mid = sd + sp / 2;
      if (el.type === 'buslane') {
        if (mid + tLen / 2 >= total - 1 && !words.length) mid = sd + 1.25 + 1.5 + tLen / 2; // short run: right after the diamond
        putWords(mid);
      } else if (el.icons !== false && mid < total - 1.5) {
        if (el.twoWay) { icon(mid, w / 4, false); icon(mid, -w / 4, true); } else icon(mid, 0, false);
      }
    }
    if (el.type === 'buslane') {
      putWords(total - 2 - tLen / 2); // whole wording just before the lane ends (e.g. before the next intersection)
      for (const mid of words) { const q = atLen(pts, cum, mid * ppm); drawText(ctx, P, q.p, G.angle(q.t), txt, 2.5 * ppm, 1.0 * ppm, white, 'far', 1.0 * ppm); }
    }
  }

  // ---------- bus stops (公車停靠區) ----------
  // Placed by two clicks along a road section's kerb; everything is computed live from that section, so the stop
  // follows the road. Regulation: §190 停靠區 white 10 cm lines with white wording; §169 red 禁止臨時停車線 on the
  // kerb; §174-4 bike markings stay 2 m clear of a 公車停靠區. Bay sizes / tapers are not in the regulation (≈).
  //   roadside: the bus stops in the kerb lane; a boarding island sits at the kerb and the bike lane runs behind it.
  //   bay: the bus pulls right into a recess (entry taper, berth, exit taper); the platform and the bike lane are
  //        behind the bay.
  const smooth01 = (u) => { u = G.clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  R.busStopGeom = function (el, els, ppm) {
    const secs = els.filter((e) => e.type === 'section');
    if (!secs.length || !el.a || !el.b) return null;
    const mid = G.mid(el.a, el.b);
    let host = secs.find((e) => e.id === el.host);
    if (!host) { let bd = Infinity; for (const e of secs) { const g = R.sectionGeom(e, ppm); const r = g && G.nearestOnPolyline(mid, g.pts); if (r && r.d < bd) { bd = r.d; host = e; } } }
    const g = R.sectionGeom(host, ppm);
    if (!g) return null;
    const pts = g.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + G.dist(pts[i - 1], pts[i]) / ppm);
    const stationOf = (p) => { const r = G.nearestOnPolyline(p, pts); return { s: cum[r.i] + G.dist(pts[r.i], r.proj) / ppm, r }; };
    const A = stationOf(el.a), B = stationOf(el.b), rm = G.nearestOnPolyline(mid, pts);
    const side = G.dot(G.sub(mid, rm.proj), G.rightN(rm.tangent)) >= 0 ? 1 : -1; // which kerb
    const dir = host.lanesB === 0 ? 1 : side;                                       // travel along increasing station?
    const s0 = Math.min(A.s, B.s), s1 = Math.max(A.s, B.s), total = cum[cum.length - 1];
    const bay = el.kind === 'bay';
    const Lin = bay ? Math.max(0, +el.Lin || 0) : 0, Lout = bay ? Math.max(0, +el.Lout || 0) : 0;
    const before = dir > 0 ? Lin : Lout, after = dir > 0 ? Lout : Lin;
    const Tb = Math.max(2, +el.Tb || 10), D = bay ? Math.max(1, +el.D || 3) : 0, wP = Math.max(0.5, +el.wP || 2.5);
    let wb = Math.max(1, +el.wb || 1.5);
    const bL = host.bikeLane || 0, sl = host.slowLane || 0;
    // offsets (m) outward from the road centre line on the stop's side
    const extAt = (sm) => { const e = R.sectionExtAt(host, sm); return side > 0 ? e.right : e.left; };
    const aAt = (sm) => extAt(sm) - bL - sl - (host.edge ? 0.3 : 0);                 // outer edge of the motor lanes
    const outAt = (sm) => { // the kerb line of the stop (bay recess or plain kerb)
      if (!bay) return aAt(sm);
      let u = 1;
      if (sm < s0) u = before > 0 ? smooth01((sm - (s0 - before)) / before) : 0;
      else if (sm > s1) u = after > 0 ? smooth01(1 - (sm - s1) / after) : 0;
      return aAt(sm) + D * u;
    };
    // a point at station sm (m) and outward offset o (m)
    const at = (sm, o) => {
      sm = G.clamp(sm, 0, total);
      let i = 1; while (i < cum.length - 1 && cum[i] < sm) i++;
      const p0 = pts[i - 1], p1 = pts[i], u = (sm - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), t = G.norm(G.sub(p1, p0));
      return G.add(G.add(p0, G.mul(G.sub(p1, p0), G.clamp(u, 0, 1))), G.mul(G.rightN(t), side * o * ppm));
    };
    // a separately drawn bike lane running along this kerb, past both ends of the stop, is detoured too
    const lo0 = s0 - before - Tb, hi0 = s1 + after + Tb;
    const offOf = (p) => { const r = G.nearestOnPolyline(p, pts); return { o: side * G.dot(G.sub(p, r.proj), G.rightN(r.tangent)) / ppm, t: r.tangent }; };
    let through = null;
    if (el.bike !== false) for (const bl of els) {
      if (bl.type !== 'bikelane' || bl.kind === 'priority' || !bl.pts || bl.pts.length < 2) continue;
      const bp = R.basePts(bl, ppm), hit = (sm) => {
        const ref = at(sm, aAt(sm) + 1.5), r = G.nearestOnPolyline(ref, bp);
        if (!r || r.d > 6 * ppm || (r.i === 0 && r.t <= 0) || (r.i === bp.length - 2 && r.t >= 1)) return null;
        const q = offOf(r.proj); return Math.abs(G.dot(r.tangent, q.t)) > 0.9 ? q.o : null;
      };
      const oA = hit(lo0), oB = hit(hi0);
      if (oA != null && oB != null) { through = { el: bl, oA, oB }; wb = Math.max(1, bl.width || wb); break; }
    }
    const cb = (sm) => (through ? through.oA + (through.oB - through.oA) * G.clamp((sm - lo0) / Math.max(1e-6, hi0 - lo0), 0, 1)
      : aAt(sm) + (bL > 0 ? bL / 2 : 0.75));                                            // where bikes ride before / after
    // with no bike lane on the road there is nothing to rejoin: the bike lane runs straight behind the stop
    const straightOff = aAt((s0 + s1) / 2) + D + wP + wb / 2;
    const bikeAt = (sm) => {
      if (bL <= 0 && !through) return straightOff;
      const lo = s0 - before, hi = s1 + after, behind = (x) => outAt(x) + wP + wb / 2;
      if (sm >= lo && sm <= hi) return behind(sm);
      if (sm < lo) return cb(sm) + (behind(lo) - cb(sm)) * smooth01((sm - (lo - Tb)) / Tb);
      return cb(sm) + (behind(hi) - cb(sm)) * smooth01(1 - (sm - hi) / Tb);
    };
    const run = (from, to, f) => { const out = [], n = Math.max(2, Math.ceil((to - from) / 0.5) + 1); for (let k = 0; k < n; k++) { const sm = from + ((to - from) * k) / (n - 1); out.push(at(sm, f(sm))); } return out; };
    const band = (from, to, f0, f1) => run(from, to, f0).concat(run(from, to, f1).reverse());
    const lo = s0 - before, hi = s1 + after, mlo = lo - (el.bike !== false ? Tb : 0), mhi = hi + (el.bike !== false ? Tb : 0);
    const travel = (sm) => { const q = at(sm + 0.5, 0), p = at(sm - 0.5, 0); return G.angle(dir > 0 ? G.sub(q, p) : G.sub(p, q)); };
    return {
      host, side, dir, s0, s1, lo, hi, bay, wb, lw: host.laneWidth,
      mask: band(mlo, mhi, (x) => Math.min(aAt(x), through ? cb(x) - wb / 2 : Infinity) - 0.05, (x) => Math.max(extAt(x), bikeAt(x) + wb / 2, through ? cb(x) + wb / 2 : -Infinity) + 0.5),
      bayPave: bay ? band(lo, hi, (x) => aAt(x) - 0.2, outAt) : null,
      // the island / platform reaches back to the bike lane, so its ends taper along the bike lane's curve
      platform: el.bike !== false
        ? band(mlo, mhi, (x) => (x >= lo && x <= hi ? outAt(x) : aAt(x)), (x) => Math.max(x >= lo && x <= hi ? outAt(x) : aAt(x), bikeAt(x) - wb / 2))
        : band(lo, hi, outAt, (x) => outAt(x) + wP),
      bike: el.bike !== false ? (dir > 0 ? run(mlo, mhi, bikeAt) : run(mlo, mhi, bikeAt).reverse()) : null,
      mouth: bay ? run(lo, hi, (x) => aAt(x) + 0.075) : null,
      tapers: bay ? [run(lo, s0, (x) => outAt(x) - 0.075), run(s1, hi, (x) => outAt(x) - 0.075)] : [],
      kerb: run(s0, s1, (x) => outAt(x) + 0.075),
      box: bay ? band(s0, s1, (x) => aAt(x) + 0.1, (x) => outAt(x) - 0.25) : band(s0, s1, (x) => aAt(x) - host.laneWidth + 0.15, (x) => aAt(x) - 0.1),
      boxMid: (bay ? at((s0 + s1) / 2, aAt((s0 + s1) / 2) + D / 2) : at((s0 + s1) / 2, aAt((s0 + s1) / 2) - host.laneWidth / 2)),
      crossing: el.bike !== false ? { p: at((s0 + s1) / 2, bikeAt((s0 + s1) / 2)), dir: travel((s0 + s1) / 2) } : null,
      travelDir: travel((s0 + s1) / 2),
      through: through && through.el,
      // the two open ends of the stop's bike lane: point, direction pointing away from the stop, width
      ends: el.bike !== false && !through ? (() => {
        const b = dir > 0 ? run(mlo, mhi, bikeAt) : run(mlo, mhi, bikeAt).reverse(), n = b.length;
        return [{ p: b[0], t: G.norm(G.sub(b[0], b[1])), w: wb }, { p: b[n - 1], t: G.norm(G.sub(b[n - 1], b[n - 2])), w: wb }];
      })() : [],
    };
  };
  // the standard bike lane look (also what the bike lane tool draws by default)
  R.BIKE_STANDARD = { type: 'bikelane', kind: 'exclusive', surface: true, sep: 'edges', icons: true, diamonds: false, spacing: 30 };
  // The stop's own bike lane. With a drawn bike lane passing through or joined to it, it takes that lane's style
  // (separator lines, symbols); otherwise a plain lane with a white line on each side.
  function drawStopBikePath(ctx, g, ppm, P, style) {
    if (!g.bike) return;
    if (style) { // run in the drawn lane's direction, so its separator stays on the same side
      const r = G.nearestOnPolyline(g.bike[0], R.basePts(style, ppm)), d = G.sub(g.bike[g.bike.length - 1], g.bike[0]);
      const pts = r && G.dot(r.tangent, d) < 0 ? g.bike.slice().reverse() : g.bike;
      const bl = Object.assign({}, style, { pts, width: g.wb, smooth: false, tanS: null, tanE: null, surface: true });
      drawBikeSurface(ctx, bl, ppm, P); drawBikeLane(ctx, bl, ppm, P); return;
    }
    const bl = Object.assign({}, R.BIKE_STANDARD, { pts: g.bike, width: g.wb, smooth: false });
    drawBikeSurface(ctx, bl, ppm, P); drawBikeLane(ctx, bl, ppm, P);
  }
  // passengers cross the bike lane to the stop on a short 枕木紋 crossing (bars along the bike lane, §185)
  function drawStopCrossing(ctx, g, ppm, P) {
    if (!g.crossing) return;
    const c = g.crossing, t = G.fromAngle(c.dir), n = G.rightN(t), half = g.wb / 2;
    ctx.save(); ctx.fillStyle = P.colors.white;
    for (let o = -1.0; o <= 1.0 + 1e-6; o += 0.8) {
      const q = G.add(c.p, G.mul(t, o * ppm));
      path(ctx, [G.add(q, G.mul(n, -half * ppm)), G.add(q, G.mul(n, half * ppm)), G.add(G.add(q, G.mul(n, half * ppm)), G.mul(t, 0.4 * ppm)), G.add(G.add(q, G.mul(n, -half * ppm)), G.mul(t, 0.4 * ppm))], true); ctx.fill();
    }
    ctx.restore();
  }
  function drawBusStop(ctx, el, g, ppm, P, bikeStyle, skipBike) {
    const white = P.colors.white;
    if (g.bayPave) { ctx.fillStyle = P.colors.asphalt; path(ctx, g.bayPave, true); ctx.fill(); }
    drawSidewalk(ctx, { pts: g.platform, style: 'pavers' }, ppm, P);
    if (!skipBike) drawStopBikePath(ctx, g, ppm, P, bikeStyle);
    if (g.mouth) R.drawStyled(ctx, g.mouth, P.lineStyles.lane, ppm);                         // buses cross into the bay
    for (const tp of g.tapers) if (tp.length > 1) R.drawStyled(ctx, tp, P.lineStyles.edge, ppm);
    R.drawStyled(ctx, g.kerb, { color: P.colors.red, width: 0.15, pattern: 'solid' }, ppm);   // §169 禁止臨時停車
    ctx.save(); ctx.strokeStyle = white; ctx.lineWidth = 0.10 * ppm; ctx.setLineDash([]); path(ctx, g.box, true); ctx.stroke(); ctx.restore(); // §190
    const txt = el.text || '公車停靠區', n = Array.from(txt).length, len = (g.s1 - g.s0);
    const cl = Math.min(2.5, (len - 2) / (n + (n - 1) * 0.4)); // fit the wording inside the box
    if (cl > 0.5) drawText(ctx, P, g.boxMid, g.travelDir, txt, cl * ppm, Math.min(1.0, g.lw * 0.35) * ppm, white, 'far', cl * 0.4 * ppm);
  }

  // Split a lane's centre line into the runs that lie outside the given areas (intersections, crosswalks), so each
  // run can be marked on its own: §174 re-marks a lane after every intersection, and wording is never cut in half.
  R.splitRuns = function (pts, areas, ppm, minLenM = 3) {
    if (!areas.length || pts.length < 2) return [pts];
    const dense = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(G.dist(pts[i - 1], pts[i]) / (0.5 * ppm)));
      for (let k = 1; k <= n; k++) dense.push(G.add(pts[i - 1], G.mul(G.sub(pts[i], pts[i - 1]), k / n)));
    }
    const boxes = areas.map((a) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of a) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { a, x0, y0, x1, y1 }; });
    const inside = (p) => boxes.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 && G.pointInPoly(p, b.a));
    const runs = []; let cur = [];
    for (const p of dense) { if (inside(p)) { if (cur.length) runs.push(cur); cur = []; } else cur.push(p); }
    if (cur.length) runs.push(cur);
    const lenOf = (r) => { let L = 0; for (let i = 1; i < r.length; i++) L += G.dist(r[i - 1], r[i]); return L; };
    return runs.filter((r) => r.length > 1 && lenOf(r) >= minLenM * ppm);
  };

  // ---------- scene ----------
  const MARK = new Set(['buslane', 'bikelane', 'roundabout', 'yield', 'symbol', 'line', 'section', 'crosswalk', 'stopline', 'scooterbox', 'arrow', 'text', 'chevron', 'yellowbox']);

  const ppm_ = (o) => o.ppm;
  // Default stacking level of each kind of element (bottom → top). New elements are inserted at the top of their
  // level, and older projects are sorted this way once; after that the list order is the drawing order.
  R.RANK = { road: 0, section: 0, roundabout: 0, junction: 0, lanemask: 0, mediancut: 0, buslane: 1, surface: 1,
    line: 2, crosswalk: 2, stopline: 2, scooterbox: 2, arrow: 2, symbol: 2, text: 2, yield: 2, chevron: 2, yellowbox: 2,
    sidewalk: 3, busstop: 4, bikelane: 5 };
  R.rankOf = (el) => (R.RANK[el.type] != null ? R.RANK[el.type] : 2);
  const PAVER = new Set(['road', 'section', 'roundabout', 'junction', 'lanemask', 'mediancut']);

  // Elements are drawn in list order (the 圖層 Layers panel: bottom of the list = top of the drawing).
  // Consecutive road pieces are paved together as one union, so adjoining pavement has no seams; markings are
  // always clipped to road surface, and the automatic cut-outs (junctions, crosswalks, medians, bus stops) apply
  // whatever the order.
  R.drawScene = function (ctx, o) {
    const { ppm, P } = o;
    const all = o.preview ? o.els.concat([o.preview]) : o.els, hiddenIds = new Set(all.filter((e) => e.hidden).map((e) => e.id));
    const els = all.filter((e) => !e.hidden && !(e.owner && hiddenIds.has(e.owner))); // hidden in the layer list (or its group): not drawn
    R._els = els;
    const clipOutside = (pts) => {
      if (!pts || pts.length < 3) return;
      ctx.beginPath(); ctx.rect(-1e6, -1e6, 2e6, 2e6);
      ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
      ctx.clip('evenodd');
    };
    // ---- shared cut-outs ----
    const crossCuts = els.filter((e) => e.type === 'crosswalk' && e.a && e.b && e.dir != null).map((e) => R.crosswalkPad(e, ppm, 0.3));
    const bikeMasks = els.filter((e) => e.type === 'bikelane' || e.type === 'buslane').map((e) => R.bikeBand(e, ppm, -0.3)).filter(Boolean);
    const busStops = els.filter((e) => e.type === 'busstop').map((e) => ({ el: e, g: R.busStopGeom(e, els, ppm) })).filter((b) => b.g);
    const rbIds = new Set(els.filter((e) => e.type === 'roundabout').map((e) => e.id));
    const rbAreas = els.filter((e) => e.type === 'roundabout').flatMap((e) => [R.rbOutline(e, ppm)].concat(R.cornerPaving(e, ppm), e.splits || []));
    const yieldToRoundabouts = (el) => { if (rbAreas.length && !(el.owner && rbIds.has(el.owner)) && el.type !== 'roundabout') for (const a of rbAreas) clipOutside(a); };
    const junctions = els.filter((e) => (e.type === 'junction' || e.type === 'lanemask') && e.pts.length >= 3)
      .concat(els.filter((e) => e.type === 'junction').flatMap((e) => (e.cornerCuts || []).map((pts) => ({ pts }))))
      .concat(els.filter((e) => e.type === 'roundabout').map((e) => ({ pts: R.rbOutline(e, ppm, 1.2) })))
      .concat(els.filter((e) => e.type === 'roundabout').flatMap((e) => (e.corners || []).map((k) => ({ pts: k.mask })).concat((e.legMasks || []).concat(e.cornerMasks || []).map((pts) => ({ pts })))));
    const cutJunctions = () => { for (const j of junctions) clipOutside(j.pts); }; // one clip per area: overlaps can't cancel
    // where bus / bike lanes are broken: intersection areas (not the approach lane masks), roundabouts, crosswalks
    const laneBreaks = els.filter((e) => e.type === 'junction' && e.pts.length >= 3).map((e) => e.pts)
      .concat(els.filter((e) => e.type === 'junction').flatMap((e) => e.cornerCuts || []))
      .concat(els.filter((e) => e.type === 'roundabout').map((e) => R.rbOutline(e, ppm, 1.2)))
      .concat(crossCuts);
    const markLane = (d) => { // lines and symbols of a bus / bike lane, run by run
      const base = R.basePts(d, ppm);
      for (const run of R.splitRuns(base, laneBreaks, ppm)) drawBikeLane(ctx, Object.assign({}, d, { pts: run, smooth: false, tanS: null, tanE: null }), ppm, P);
    };
    // medians end flush with a roundabout's yield line (0.6 m outside the ring), and the splitter replaces them there
    const medianCuts = els.filter((e) => (e.type === 'junction' || e.type === 'mediancut') && e.pts.length >= 3).map((e) => e.pts)
      .concat(els.filter((e) => e.type === 'roundabout').map((e) => R.rbOutline(e, ppm, 0.6)))
      .concat(els.filter((e) => e.type === 'roundabout').flatMap((e) => e.splits || []));
    // road surface: markings are clipped to it
    const roadPolys = [];
    for (const el of els) {
      if (el.type === 'road' && el.pts.length >= 3) roadPolys.push(R.areaPts(el));
      if (el.type === 'section') { const p = R.sectionPoly(el, ppm); if (p) roadPolys.push(p); }
      if (el.type === 'junction') for (const c of el.corners || []) if (c.length >= 3) roadPolys.push(c);
      if (el.type === 'buslane') { const b = R.bikeBand(el, ppm); if (b) roadPolys.push(b); }
      if (el.type === 'roundabout') { roadPolys.push(R.rbOutline(el, ppm)); roadPolys.push(...R.cornerPaving(el, ppm)); }
    }
    const clipRoad = () => {
      if (!o.clip || !roadPolys.length) return;
      ctx.beginPath();
      for (let p of roadPolys) { if (G.area(p) < 0) p = p.slice().reverse(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y); ctx.closePath(); }
      ctx.clip('nonzero');
    };
    // bike lanes joined to a bus stop are drawn with the stop's bike lane as ONE lane (lane → stop → lane)
    const stopById = new Map(busStops.map((b) => [b.el.id, b]));
    const stopPath = (b, from) => (from === 0 ? b.g.bike : b.g.bike.slice().reverse());
    const merged = new Map(), consumed = new Set(), stopTaken = new Map(); // stop id → the lane drawing it
    const lanes = els.filter((e) => e.type === 'bikelane');
    for (const bl of lanes) {
      const L = bl.linkE, b = L && stopById.get(L.id);
      if (!b || !b.g.bike || stopTaken.has(b.el.id)) continue;
      let pts = R.basePts(bl, ppm).concat(stopPath(b, L.i).slice(1));
      const out = lanes.find((x) => x !== bl && x.linkS && x.linkS.id === L.id && x.linkS.i === 1 - L.i);
      if (out) { pts = pts.concat(R.basePts(out, ppm).slice(1)); consumed.add(out); }
      merged.set(bl, pts); stopTaken.set(b.el.id, bl);
    }
    for (const bl of lanes) {
      const L = bl.linkS, b = L && stopById.get(L.id);
      if (!b || !b.g.bike || stopTaken.has(b.el.id) || consumed.has(bl)) continue;
      merged.set(bl, stopPath(b, 1 - L.i).concat(R.basePts(bl, ppm).slice(1))); stopTaken.set(b.el.id, bl);
    }

    if (o.background) { ctx.fillStyle = o.background; ctx.fillRect(0, 0, o.w, o.h); }
    if (o.img && o.imgOpacity > 0) { ctx.globalAlpha = o.imgOpacity; ctx.drawImage(o.img, 0, 0); ctx.globalAlpha = 1; }

    // ---- pavement of a run of road pieces: one union per tone; roundabout paving on top ----
    const tones = { asphalt: P.colors.asphalt, worn: P.colors.asphaltWorn, concrete: P.colors.concrete };
    const addTo = (list, poly) => { if (poly && poly.length >= 3) list.push(G.area(poly) < 0 ? poly.slice().reverse() : poly); };
    const fillUnion = (color, list) => {
      if (!list.length) return;
      ctx.fillStyle = color; ctx.beginPath();
      for (const q of list) { ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y); ctx.closePath(); }
      ctx.fill('nonzero');
    };
    const pave = (run) => {
      const byTone = new Map(), rbPave = [];
      const toneList = (c) => { if (!byTone.has(c)) byTone.set(c, []); return byTone.get(c); };
      for (const el of run) {
        if (el.type === 'road') addTo(toneList(tones[el.tone] || P.colors.asphalt), R.areaPts(el));
        if (el.type === 'section' && el.pave) addTo(toneList(P.colors.asphalt), R.sectionPoly(el, ppm));
        if (el.type === 'junction') for (const c of el.corners || []) addTo(toneList(P.colors.asphalt), c);
        if (el.type === 'buslane') addTo(toneList(P.colors.asphalt), R.bikeBand(el, ppm)); // a bus lane is road: it paves itself
        if (el.type === 'roundabout') { addTo(rbPave, R.rbOutline(el, ppm)); for (const pv of R.cornerPaving(el, ppm)) addTo(rbPave, pv); }
      }
      ctx.save(); ctx.globalAlpha = o.roadOpacity;
      const asphalt = P.colors.asphalt;
      for (const [c, list] of byTone) { if (c === asphalt) continue; ctx.save(); for (const q of rbPave) clipOutside(q); fillUnion(c, list); ctx.restore(); }
      fillUnion(asphalt, (byTone.get(asphalt) || []).concat(rbPave));
      ctx.restore();
    };

    // ---- one element's own drawing (its pavement is done by pave()) ----
    const lineCuts = () => { cutJunctions(); for (const c of crossCuts) clipOutside(c); for (const b of bikeMasks) clipOutside(b); };
    const drawSectionParts = (el) => {
      const g = R.sectionGeom(el, ppm); if (!g) return;
      for (const { b, pts: bp } of g.bands) if (b.kind === 'bike') { // a road's bike lane stops at junctions, crosswalks, bus stops
        ctx.save(); clipRoad(); cutJunctions(); for (const c of crossCuts) clipOutside(c);
        for (const st of busStops) if (st.g.host === el) clipOutside(st.g.mask);
        ctx.strokeStyle = P.colors.bike; ctx.lineWidth = b.width * ppm; ctx.lineCap = 'butt'; ctx.setLineDash([]);
        path(ctx, bp); ctx.stroke(); ctx.restore();
      }
      // Where two roads overlap outside an intersection (a ramp or slip road joining a bigger road), the road with
      // fewer lanes gives way: its lines stop at the bigger road's edge, and the bigger road's edge line turns into a
      // dashed lane line across the mouth.
      ctx.save(); clipRoad(); lineCuts();
      const lanesOf = (e) => (e.lanesF | 0) + (e.lanesB | 0);
      const others = els.filter((e) => e.type === 'section' && e !== el);
      const major = others.filter((e) => lanesOf(e) > lanesOf(el)).map((e) => R.sectionPoly(e, ppm)).filter(Boolean);
      const minor = others.filter((e) => lanesOf(e) < lanesOf(el)).map((e) => R.sectionPoly(e, ppm)).filter(Boolean);
      for (const q of major) clipOutside(q);
      for (const st of busStops) if (st.g.host === el) clipOutside(st.g.mask);
      for (const { l, pts: line } of g.lines) {
        const sty = P.lineStyles[l.style];
        if ((l.style !== 'edge' && l.style !== 'bikeSep') || !minor.length) { R.drawStyled(ctx, line, sty, ppm); continue; }
        ctx.save(); for (const q of minor) clipOutside(q); R.drawStyled(ctx, line, sty, ppm); ctx.restore();
        for (const q of minor) { ctx.save(); path(ctx, q, true); ctx.clip(); R.drawStyled(ctx, line, P.lineStyles.lane, ppm); ctx.restore(); }
      }
      ctx.restore();
      // medians: opened wherever a crosswalk crosses them (0.3 m clear each side), stopped at junctions / roundabouts
      for (const { b, pts: mp } of g.bands) if (b.kind === 'median') {
        const poly = G.offset(mp, -b.width / 2 * ppm).concat(G.offset(mp, b.width / 2 * ppm).reverse());
        const cuts = medianCuts.concat(crossCuts);
        const cutAll = () => { for (const c of cuts) clipOutside(c); };
        ctx.save(); cutAll(); drawSidewalk(ctx, { pts: poly, style: 'island' }, ppm, P); ctx.restore();
        if (cuts.length) {
          ctx.save(); path(ctx, poly, true); ctx.clip(); cutAll();
          ctx.strokeStyle = '#b9b5ab'; ctx.lineWidth = 0.5 * ppm; ctx.lineJoin = 'round'; ctx.setLineDash([]);
          for (const c of cuts) { path(ctx, c, true); ctx.stroke(); }
          ctx.restore();
        }
      }
    };
    const drawEl = (el) => {
      ctx.save();
      switch (el.type) {
        case 'section': ctx.restore(); drawSectionParts(el); return;
        case 'roundabout':
          ctx.save(); clipRoad(); drawRoundaboutLines(ctx, el, ppm, P); drawRoundaboutKerbs(ctx, el, ppm, P);
          for (const c of el.curves || []) R.drawStyled(ctx, c.pts, c.style, ppm, c.dashOffset);
          ctx.restore();
          drawRoundaboutIsland(ctx, el, ppm, P);
          for (const sp of el.splits || []) { ctx.save(); for (const c of crossCuts) clipOutside(c); drawSidewalk(ctx, { pts: sp, style: 'island' }, ppm, P); ctx.restore(); }
          break;
        case 'surface': clipRoad(); yieldToRoundabouts(el); drawSurface(ctx, el, ppm, P); break;
        case 'buslane': clipRoad(); for (const c of crossCuts) clipOutside(c); cutJunctions(); drawBikeSurface(ctx, el, ppm, P); markLane(el); break;
        case 'sidewalk':
          yieldToRoundabouts(el);
          for (const j of els) if (j.type === 'junction') for (const c of j.pocketCuts || []) clipOutside(c); // a left-turn pocket widens into islands
          // a junction's corner sidewalk opens wherever another road (ramp, slip road, driveway) crosses it
          if (el.yieldTo) for (const sec of els) if (sec.type === 'section' && !el.yieldTo.includes(sec.id)) clipOutside(R.sectionPoly(sec, ppm));
          drawSidewalk(ctx, el, ppm, P); break;
        case 'busstop': {
          const b = busStops.find((x) => x.el === el); if (!b) break;
          drawBusStop(ctx, el, b.g, ppm, P, b.g.through || null, stopTaken.has(el.id));
          if (!stopTaken.has(el.id)) drawStopCrossing(ctx, b.g, ppm, P);
          break;
        }
        case 'bikelane': {
          if (consumed.has(el)) break;
          yieldToRoundabouts(el); for (const c of crossCuts) clipOutside(c);
          for (const b of busStops) if (b.g.through === el) clipOutside(b.g.mask); // detoured behind the bus stop
          const d = merged.has(el) ? Object.assign({}, el, { pts: merged.get(el), smooth: false, tanS: null, tanE: null }) : el;
          drawBikeSurface(ctx, d, ppm, P); markLane(d);
          ctx.restore(); ctx.save();
          for (const [sid, owner] of stopTaken) if (owner === el) drawStopCrossing(ctx, stopById.get(sid).g, ppm, P); // passengers' crossing on top
          break;
        }
        default: {
          if (!MARK.has(el.type)) break;
          clipRoad();
          if (el.type === 'line' && el.style !== 'guide' && !el.jline) lineCuts(); // junction-made / guide lines aren't cut
          else yieldToRoundabouts(el);
          switch (el.type) {
            case 'line': R.drawStyled(ctx, R.basePts(el, ppm), P.lineStyles[el.style], ppm); break;
            case 'crosswalk': drawCrosswalk(ctx, el, ppm, P); break;
            case 'stopline': drawStopLine(ctx, el, ppm, P); break;
            case 'scooterbox': drawScooterBox(ctx, el, ppm, P); break;
            case 'arrow': drawArrow(ctx, el, ppm, P); break;
            case 'symbol': drawIcon(ctx, el, ppm, P); break;
            case 'yield': drawYield(ctx, el, ppm, P); break;
            case 'text': drawText(ctx, P, el.p, el.dir, el.text, el.charLen * ppm, el.charWid * ppm, colorOf(P, el.color), el.order, charGap(el) * ppm); break;
            // §171 槽化線 border 15 / stripe 20 / gap 30 cm; §173 網狀線 border 20 / lines 10 cm, spacing user (1–5 m)
            case 'chevron': drawHatched(ctx, Object.assign({}, el, { border: 0.15, stripe: 0.20, gap: 0.30 }), ppm, P, false); break;
            case 'yellowbox': drawHatched(ctx, Object.assign({}, el, { border: 0.20, stripe: 0.10, gap: Math.max(0, el.gap - 0.10) }), ppm, P, true); break;
          }
        }
      }
      ctx.restore();
    };

    // ---- walk the list: pave each run of road pieces together, then draw its elements in order ----
    for (let i = 0; i < els.length;) {
      if (PAVER.has(els[i].type)) {
        let j = i; while (j < els.length && PAVER.has(els[j].type)) j++;
        const run = els.slice(i, j);
        pave(run);
        for (const el of run) drawEl(el);
        i = j;
      } else {
        if (els[i].type === 'buslane') pave([els[i]]);
        drawEl(els[i]); i++;
      }
    }
  };

  // ---------- shapes for hit-testing & selection outline ----------
  R.shape = function (el, ppm, P) {
    switch (el.type) {
      case 'road': case 'sidewalk': case 'surface': case 'chevron': case 'yellowbox': case 'junction': return { poly: R.areaPts(el) };
      case 'bikelane': case 'buslane': { const b = R.bikeBand(el, ppm); return b ? { poly: b } : { line: el.pts, w: 4 }; }
      case 'line': { const st = P.lineStyles[el.style]; return { line: R.basePts(el, ppm), w: ((st ? st.width + (st.sep || 0) * 2 : 0.2) * ppm) }; }
      case 'section': { const p = R.sectionPoly(el, ppm); return p ? { poly: p } : { line: el.pts, w: 4 }; }
      case 'busstop': { const g = R.busStopGeom(el, R._els || [], ppm); return g ? { poly: g.mask } : { line: [el.a, el.b], w: 4 }; }
      case 'crosswalk': return { poly: R.crosswalkQuad(el, ppm) };
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
