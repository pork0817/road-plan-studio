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
    return out;
  };

  // Catmull-Rom resampling for smooth curves through the clicked points.
  G.smooth = function (pts, step) {
    if (pts.length < 3) return pts.map(G.copy);
    const out = [G.copy(pts[0])];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      const segs = Math.min(120, Math.max(2, Math.ceil(G.dist(p1, p2) / step)));
      for (let k = 1; k <= segs; k++) {
        const t = k / segs, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
      }
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
