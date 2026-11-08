// Geometry helpers. World coordinates = image pixels (y points down).
window.G = (function () {
  const G = {};
  G.add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  G.sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  G.mul = (a, k) => ({ x: a.x * k, y: a.y * k });
  G.dot = (a, b) => a.x * b.x + a.y * b.y;
  G.cross = (a, b) => a.x * b.y - a.y * b.x;
  G.len = (a) => Math.hypot(a.x, a.y);
  G.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  G.norm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
  G.mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // Right / left normal relative to direction of travel (screen coords, y down)
  G.rightN = (t) => ({ x: -t.y, y: t.x });
  G.leftN = (t) => ({ x: t.y, y: -t.x });
  G.fromAngle = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
  G.angle = (v) => Math.atan2(v.y, v.x);
  G.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  G.copy = (p) => ({ x: p.x, y: p.y });

  // Offset a polyline by d (positive = right side of drawing direction), mitered joints.
  G.offset = function (pts, d) {
    if (!d) return pts.map(G.copy);
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const nPrev = i > 0 ? G.rightN(G.norm(G.sub(pts[i], pts[i - 1]))) : null;
      const nNext = i < n - 1 ? G.rightN(G.norm(G.sub(pts[i + 1], pts[i]))) : null;
      let m;
      if (!nPrev) m = nNext;
      else if (!nNext) m = nPrev;
      else {
        const s = G.add(nPrev, nNext), l = G.len(s);
        if (l < 1e-6) m = nNext;
        else { m = G.mul(s, 1 / l); m = G.mul(m, 1 / Math.max(G.dot(m, nNext), 0.25)); }
      }
      out.push({ x: pts[i].x + m.x * d, y: pts[i].y + m.y * d });
    }
    return G.trimLoops(out);
  };

  // On the inside of a bend tighter than the offset distance an offset line folds back over itself (spikes /
  // swallowtails). Cut each fold out at the point where the line crosses itself (checked within a local window).
  const segX = (a, b, c, d) => {
    const r = G.sub(b, a), s2 = G.sub(d, c), den = G.cross(r, s2);
    if (Math.abs(den) < 1e-12) return null;
    const t = G.cross(G.sub(c, a), s2) / den, u = G.cross(G.sub(c, a), r) / den;
    return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + r.x * t, y: a.y + r.y * t } : null;
  };
  G.trimLoops = function (pts, win = 120) {
    const n = pts.length;
    if (n < 4) return pts;
    const res = [pts[0]];
    let i = 0, cur = pts[0];
    while (i < n - 1) {
      const b = pts[i + 1];
      const minx = Math.min(cur.x, b.x), maxx = Math.max(cur.x, b.x), miny = Math.min(cur.y, b.y), maxy = Math.max(cur.y, b.y);
      let hit = null, hj = -1;
      for (let j = Math.min(n - 2, i + win); j >= i + 2; j--) { // farthest crossing first: removes the whole fold
        const c = pts[j], d = pts[j + 1];
        if (Math.max(c.x, d.x) < minx || Math.min(c.x, d.x) > maxx || Math.max(c.y, d.y) < miny || Math.min(c.y, d.y) > maxy) continue;
        const X = segX(cur, b, c, d);
        if (X) { hit = X; hj = j; break; }
      }
      if (hit) { res.push(hit); cur = hit; i = hj; continue; }
      res.push(b); cur = b; i++;
    }
    return res;
  };

  // Centripetal Catmull–Rom through the clicked points: unlike the uniform version it never loops or
  // overshoots when neighbouring points are spaced very unevenly (e.g. a point added near another).
  G.crPoint = function (pts, i, u) {
    const n = pts.length, P1 = pts[i], P2 = pts[i + 1];
    const P0 = i > 0 ? pts[i - 1] : { x: 2 * P1.x - P2.x, y: 2 * P1.y - P2.y };
    const P3 = i + 2 < n ? pts[i + 2] : { x: 2 * P2.x - P1.x, y: 2 * P2.y - P1.y };
    const dt = (a, b) => Math.max(Math.sqrt(G.dist(a, b)), 1e-4);
    const t0 = 0, t1 = t0 + dt(P0, P1), t2 = t1 + dt(P1, P2), t3 = t2 + dt(P2, P3), t = t1 + (t2 - t1) * u;
    const L = (A, B, ta, tb) => ({ x: ((tb - t) * A.x + (t - ta) * B.x) / (tb - ta), y: ((tb - t) * A.y + (t - ta) * B.y) / (tb - ta) });
    const A1 = L(P0, P1, t0, t1), A2 = L(P1, P2, t1, t2), A3 = L(P2, P3, t2, t3);
    const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
    return L(B1, B2, t1, t2);
  };
  G.smooth = function (pts, step) {
    if (pts.length < 3) return pts.map(G.copy);
    const out = [G.copy(pts[0])];
    for (let i = 0; i < pts.length - 1; i++) {
      const segs = Math.min(160, Math.max(2, Math.ceil(G.dist(pts[i], pts[i + 1]) / step)));
      for (let k = 1; k <= segs; k++) out.push(k === segs ? G.copy(pts[i + 1]) : G.crPoint(pts, i, k / segs));
    }
    return out;
  };

  G.distToSeg = function (p, a, b) {
    const ab = G.sub(b, a), l2 = G.dot(ab, ab);
    const t = l2 ? G.clamp(G.dot(G.sub(p, a), ab) / l2, 0, 1) : 0;
    const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    return { d: G.dist(p, proj), t, proj };
  };

  G.nearestOnPolyline = function (p, pts, closed) {
    let best = null;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a.x === b.x && a.y === b.y) continue;
      const r = G.distToSeg(p, a, b);
      if (!best || r.d < best.d) best = { d: r.d, proj: r.proj, i, t: r.t, tangent: G.norm(G.sub(b, a)) };
    }
    return best;
  };

  G.pointInPoly = function (p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };

  G.area = function (poly) {
    let s = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
    return s / 2;
  };

  G.centroid = function (pts) {
    let x = 0, y = 0;
    pts.forEach((p) => { x += p.x; y += p.y; });
    return { x: x / pts.length, y: y / pts.length };
  };

  return G;
})();
