const $ = id => document.getElementById(id);
let latest = {outer:null, inner:null};
let selected = "outer";
let plotMeta = {};

function options(arr, suffix=" mm") {
  return arr.map(v => `<option value="${v}">${v}${suffix}</option>`).join("");
}

function liteFields(p) {
  return `
    <div class="grid2">
      <label>Construction
        <select id="${p}kind">
          <option value="mono">Monolithic</option>
          <option value="lam">Laminated PVB</option>
        </select>
      </label>
      <label id="${p}monoBox">Nominal thickness
        <select id="${p}th">${options([2,2.5,2.7,3,4,5,6,8,10,12,16,19,22,25])}</select>
      </label>
    </div>
    <div id="${p}lamBox" class="hidden">
      <div class="grid3">
        <label>Ply 1<select id="${p}p1">${options([2.5,3,4,5,6,8,10,12])}</select></label>
        <label>PVB<select id="${p}pvb">${options([.38,.76,1.14,1.52,2.28])}</select></label>
        <label>Ply 2<select id="${p}p2">${options([2.5,3,4,5,6,8,10,12])}</select></label>
      </div>
      <div class="derived">ASTM designation: <b id="${p}des">—</b></div>
    </div>`;
}

async function init() {
  $("outerFields").innerHTML = liteFields("o");
  $("innerFields").innerHTML = liteFields("i");

  for (const p of ["o","i"]) {
    $(`${p}th`).value = 6;
    $(`${p}p1`).value = 6;
    $(`${p}p2`).value = 6;
    $(`${p}pvb`).value = .76;

    [`${p}kind`,`${p}th`,`${p}p1`,`${p}p2`,`${p}pvb`]
      .forEach(id => $(id).addEventListener("change", () => liteUI(p)));

    liteUI(p);
  }

  $("assembly").addEventListener("change", assemblyUI);
  $("support").addEventListener("change", supportUI);
  $("supportedEdges").addEventListener("change", () => {
    if (!$("results").classList.contains("hidden")) calculateAll();
  });

  $("calc").addEventListener("click", calculateAll);
  $("showOuter").addEventListener("click", () => selectLite("outer"));
  $("showInner").addEventListener("click", () => selectLite("inner"));

  $("example1").addEventListener("click", () => {
    $("assembly").value = "single";
    $("width").value = 1200;
    $("height").value = 1500;
    $("support").value = "4";
    $("ikind").value = "mono";
    $("ith").value = 6;
    assemblyUI(); supportUI(); liteUI("i");
    calculateAll(); selectLite("inner");
  });

  $("example2").addEventListener("click", () => {
    $("assembly").value = "igu";
    $("width").value = 2000;
    $("height").value = 2800;
    $("support").value = "4";
    for (const p of ["o","i"]) {
      $(`${p}kind`).value = "mono";
      $(`${p}th`).value = 6;
      liteUI(p);
    }
    assemblyUI(); supportUI();
    calculateAll(); selectLite("outer");
  });

  try {
    plotMeta = await fetch("plot-meta.json").then(r => r.json());
  } catch (e) {
    console.warn("plot-meta.json not loaded", e);
  }

  assemblyUI();
  supportUI();
}

function liteUI(p) {
  const lam = $(`${p}kind`).value === "lam";
  $(`${p}monoBox`).classList.toggle("hidden", lam);
  $(`${p}lamBox`).classList.toggle("hidden", !lam);

  if (lam) {
    const d = NFLEngine.lamDesignation(
      $(`${p}p1`).value,
      $(`${p}pvb`).value,
      $(`${p}p2`).value
    );
    $(`${p}des`).textContent = d ? `${d} mm` : "Not covered";
  }
}

function supportUI() {
  $("edgeBox").classList.toggle("hidden", $("support").value !== "2");
}

function assemblyUI() {
  const single = $("assembly").value === "single";
  $("outerCard").classList.toggle("hidden", single);
  $("showOuter").classList.toggle("hidden", single);
  if (single) selected = "inner";
}

function liteInput(p) {
  const kind = $(`${p}kind`).value;
  const designation = kind === "mono"
    ? Number($(`${p}th`).value)
    : NFLEngine.lamDesignation($(`${p}p1`).value, $(`${p}pvb`).value, $(`${p}p2`).value);

  return {kind, designation};
}

function calculateOne(p, name) {
  const x = liteInput(p);

  const r = NFLEngine.calculate({
    kind:x.kind,
    support:$("support").value,
    designation:x.designation,
    width:Number($("width").value),
    height:Number($("height").value),
    supportedEdges:$("supportedEdges").value
  });

  r.name = name;
  r.desc = x.kind === "mono"
    ? `${x.designation} mm monolithic`
    : `${x.designation} mm laminated designation`;

  return r;
}

function calculateAll() {
  latest.inner = calculateOne("i", "Inner");
  latest.outer = $("assembly").value === "single" ? null : calculateOne("o", "Outer");

  const arr = [latest.outer, latest.inner].filter(Boolean);

  $("resultCards").innerHTML = arr.map(r => `
    <div class="resultCard" data-name="${r.name.toLowerCase()}">
      <b>${r.name} Lite</b>
      <div class="kpi">${r.ok ? r.nfl.toFixed(2) + " kPa" : "MANUAL"}</div>
      <div class="row"><span>Glass</span><b>${r.desc}</b></div>
      <div class="row"><span>ASTM chart</span><b>Fig. A1.${r.figure}</b></div>
      <div class="row"><span>Long × Short</span><b>${Math.round(r.geom.long)} × ${Math.round(r.geom.short)} mm</b></div>
      <div class="row"><span>AR</span><b>${r.geom.ar.toFixed(2)}</b></div>
      ${r.twoSide ? `<div class="row"><span>Unsupported edge</span><b>${Math.round(r.unsupported)} mm</b></div>` : ""}
    </div>`).join("");

  $("results").classList.remove("hidden");
  $("viewer").classList.remove("hidden");

  if ($("assembly").value === "single") selected = "inner";
  showChart();
}

function selectLite(v) {
  selected = v;
  showChart();
}

function showChart() {
  const r = latest[selected];
  if (!r) return;

  document.querySelectorAll(".resultCard")
    .forEach(x => x.classList.toggle("active", x.dataset.name === selected));

  const img = $("chartImg");
  img.onload = () => drawOverlay(r, img);
  img.src = `A1_${String(r.figure).padStart(2, "0")}.png`;

  $("chartSubtitle").textContent =
    `${r.name} · ${r.desc} · ASTM Fig. A1.${r.figure}`;

  if (!r.ok) {
    $("chartNote").innerHTML =
      `<b>${r.error}</b> Original ASTM figure shown for manual review.`;
  } else if (r.twoSide) {
    const edgeText = r.supportedEdges === "tb"
      ? "Top / Bottom supported"
      : "Left / Right supported";
    $("chartNote").innerHTML =
      `<b>NFL = ${r.nfl.toFixed(2)} kPa</b>. ${edgeText}; unsupported-edge length = ${Math.round(r.unsupported)} mm. ` +
      `Green = selected thickness line; blue = dimension/load guide; red = NFL intersection.`;
  } else {
    $("chartNote").innerHTML =
      `<b>NFL = ${r.nfl.toFixed(2)} kPa</b>. Red = panel point; blue = AR line; green = highlighted NFL contour.`;
  }
}

function drawOverlay(r, img) {
  const c = $("overlay");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;

  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);

  if (!r.ok) return;

  if (r.twoSide) {
    const b = r.figure === 27 ? [78,654,61,463] : [87,657,69,469];
    const qmin = r.figure === 27 ? .25 : .20;
    const qmax = r.figure === 27 ? 10 : 8;
    const Lmin = r.figure === 27 ? 260 : 200;
    const Lmax = r.figure === 27 ? 3500 : 3000;

    const [x0,x1,y0,y1] = b;

    const X = q => x0 +
      (Math.log10(q)-Math.log10(qmin)) /
      (Math.log10(qmax)-Math.log10(qmin)) * (x1-x0);

    const Y = L => y1 -
      (Math.log10(L)-Math.log10(Lmin)) /
      (Math.log10(Lmax)-Math.log10(Lmin)) * (y1-y0);

    // Green: selected thickness line
    ctx.save();
    ctx.strokeStyle = "#067647";
    ctx.lineWidth = 7;
    ctx.shadowColor = "rgba(6,118,71,.25)";
    ctx.shadowBlur = 5;
    ctx.beginPath();

    let started = false;
    for (let L=Lmin; L<=Lmax; L*=1.01) {
      const q = r.C / Math.pow(L,4);
      if (q >= qmin && q <= qmax) {
        if (!started) {
          ctx.moveTo(X(q),Y(L));
          started = true;
        } else {
          ctx.lineTo(X(q),Y(L));
        }
      }
    }
    if (started) ctx.stroke();
    ctx.restore();

    // Blue guides
    ctx.save();
    ctx.strokeStyle = "#175cd3";
    ctx.lineWidth = 3;
    ctx.setLineDash([10,7]);

    ctx.beginPath();
    ctx.moveTo(x0,Y(r.unsupported));
    ctx.lineTo(X(r.raw),Y(r.unsupported));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(X(r.raw),y1);
    ctx.lineTo(X(r.raw),Y(r.unsupported));
    ctx.stroke();
    ctx.restore();

    // Red intersection
    ctx.beginPath();
    ctx.arc(X(r.raw),Y(r.unsupported),10,0,Math.PI*2);
    ctx.fillStyle = "#d92d20";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    // Label
    const label = `${r.nfl.toFixed(2)} kPa`;
    ctx.font = "bold 22px system-ui";
    const tw = ctx.measureText(label).width;

    const xx = Math.min(c.width - tw - 24, X(r.raw) + 12);
    const yy = Math.max(30, Y(r.unsupported) - 12);

    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.fillRect(xx-7,yy-23,tw+14,31);
    ctx.strokeStyle = "#d92d20";
    ctx.lineWidth = 2;
    ctx.strokeRect(xx-7,yy-23,tw+14,31);
    ctx.fillStyle = "#d92d20";
    ctx.fillText(label,xx,yy);
    return;
  }

  const meta = plotMeta[`A1.${r.figure}`];
  if (!meta || !meta.bounds || !meta.xmax || !meta.ymax) return;

  const [x0,x1,y0,y1] = meta.bounds;
  const W=x1-x0, H=y1-y0;
  const sx=x=>x0+x/meta.xmax*W;
  const sy=y=>y1-y/meta.ymax*H;

  const long=r.geom.long, short=r.geom.short;

  ctx.save();
  ctx.strokeStyle="#175cd3";
  ctx.lineWidth=4;
  ctx.setLineDash([12,8]);
  ctx.beginPath();
  const maxx=Math.min(meta.xmax,r.geom.ar*meta.ymax);
  ctx.moveTo(sx(0),sy(0));
  ctx.lineTo(sx(maxx),sy(maxx/r.geom.ar));
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle="#067647";
  ctx.lineWidth=6;
  ctx.beginPath();
  let started=false;

  for(let x=Math.max(50,meta.xmax*.015);x<=meta.xmax;x+=meta.xmax/260){
    const y=NFLEngine.contourY(r.kind,r.designation,r.nfl,x);
    if(isFinite(y)&&y>=0&&y<=meta.ymax&&y<=x){
      if(!started){ctx.moveTo(sx(x),sy(y));started=true}
      else ctx.lineTo(sx(x),sy(y));
    }
  }

  if(started)ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(sx(long),sy(short),10,0,Math.PI*2);
  ctx.fillStyle="#d92d20";
  ctx.fill();
  ctx.lineWidth=4;
  ctx.strokeStyle="#fff";
  ctx.stroke();
}

init();
