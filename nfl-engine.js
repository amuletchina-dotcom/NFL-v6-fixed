const NFLEngine = (() => {
  const A = 0.6948385402685583;
  const B = 1.126483835582976;
  const LAM_CF = 0.7798467672342461;

  function geom(w, h) {
    w = Number(w); h = Number(h);
    if (!(w > 0 && h > 0)) return null;
    return {
      long: Math.max(w, h),
      short: Math.min(w, h),
      area: w * h / 1e6,
      ar: Math.max(w, h) / Math.min(w, h)
    };
  }

  function lamDesignation(p1, pvb, p2) {
    p1 = Number(p1); p2 = Number(p2); pvb = Number(pvb);
    if (p1 === 6 && p2 === 6 && (Math.abs(pvb - .38) < .02 || Math.abs(pvb - .76) < .02)) return 12;
    if (p1 === 2.5 && p2 === 2.5 && Math.abs(pvb - 1.52) < .02) return 5;
    if (p1 === 4 && p2 === 4) return 8;

    const total = (ASTM.min[p1] || p1) + (ASTM.min[p2] || p2) + Math.min(pvb, 1.52);
    let d = null;
    for (const x of [5, 6, 8, 10, 12, 16, 19]) {
      if (ASTM.min[x] <= total) d = x;
    }
    return d;
  }

  function fig(kind, support, d) {
    if (kind === "mono") {
      if (support === "4") return ASTM.mono4[d];
      if (support === "3") return ASTM.mono3[d];
      if (support === "2") return 27;
      if (support === "1") return 28;
    } else {
      if (support === "4") return ASTM.lam4[d];
      if (support === "3") return ASTM.lam3[d];
      if (support === "2") return 43;
      if (support === "1") return 44;
    }
    return null;
  }

  function base6(g) {
    return Math.pow(5.6 / g.area, A) * Math.pow(1.4 / g.ar, B);
  }

  function tf(kind, d) {
    const t = ASTM.min[d];
    if (!t) return null;
    if (kind === "mono") return Math.pow(t / ASTM.min[6], 2.20);
    return LAM_CF * Math.pow(t / ASTM.min[6], 2.00);
  }

  // A1.27 / A1.43 digitized as q = C / L^4 on log-log axes.
  // L = unsupported-edge length in mm.
  function twoSideNFL(kind, d, L) {
    const monoAnchorAt1_30 = {
      6: 1000, 8: 1190, 10: 1370, 12: 1530, 16: 1780, 19: 1940, 22: 2090
    };
    const lamAnchorAt3_00 = {
      5: 650, 6: 760, 8: 900, 10: 1030, 12: 1150, 16: 1330, 19: 1450
    };

    const anchor = (kind === "mono" ? monoAnchorAt1_30 : lamAnchorAt3_00)[d];
    if (!anchor || !(L > 0)) return null;

    const qa = kind === "mono" ? 1.30 : 3.00;
    const C = qa * Math.pow(anchor, 4);
    return { raw: C / Math.pow(L, 4), C };
  }

  function calculate({kind, support, designation, width, height, supportedEdges}) {
    const g = geom(width, height);
    const f = fig(kind, support, designation);
    if (!g || !f) return {ok:false, error:"Input not covered."};

    if (support === "2") {
      // Left/Right supported => top/bottom unsupported edge length = width.
      // Top/Bottom supported => left/right unsupported edge length = height.
      const unsupported = supportedEdges === "tb" ? Number(height) : Number(width);
      const result = twoSideNFL(kind, designation, unsupported);

      if (!result) {
        return {
          ok:false,
          figure:f,
          geom:g,
          error:"Selected thickness/designation is not available on the digitized two-side ASTM chart."
        };
      }

      return {
        ok:true,
        figure:f,
        geom:g,
        raw:result.raw,
        nfl:Math.round(result.raw * 20) / 20,
        designation,
        kind,
        twoSide:true,
        unsupported,
        supportedEdges,
        C:result.C
      };
    }

    if (support !== "4") {
      return {
        ok:false,
        manual:true,
        figure:f,
        geom:g,
        error:`ASTM Fig. A1.${f} applies. Automatic NFL is not enabled for this support condition yet.`
      };
    }

    const raw = base6(g) * tf(kind, designation);
    return {
      ok:true,
      figure:f,
      geom:g,
      raw,
      nfl:Math.round(raw * 20) / 20,
      designation,
      kind
    };
  }

  function contourY(kind, designation, q, x) {
    const T = tf(kind, designation);
    if (!(T > 0 && q > 0 && x > 0)) return NaN;
    const C = T * Math.pow(5.6e6, A) * Math.pow(1.4, B);
    const expo = B - A;
    const val = q * Math.pow(x, A + B) / C;
    if (!(val > 0)) return NaN;
    return Math.pow(val, 1 / expo);
  }

  return {geom, lamDesignation, fig, calculate, contourY};
})();
