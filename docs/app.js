// 沖縄 事故多発マップ の画面の動き。ビルド不要、このファイルを書き換えるだけ。
// データは scripts/build_data.py が docs/data/ に書き出す。

const store = {
  key: "jiko-map:v1",
  load() { try { return JSON.parse(localStorage.getItem(this.key)) ?? {}; } catch { return {}; } },
  save(obj) { try { localStorage.setItem(this.key, JSON.stringify(obj)); } catch {} },
};

async function loadData(name) {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json を読めません (${res.status})`);
  return res.json();
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

const VIEWS = {
  main: [[26.07, 127.62], [26.75, 128.1]],
  miyako: [[24.68, 125.22], [24.94, 125.47]],
  yaeyama: [[24.30, 124.08], [24.56, 124.33]],
};
const KIND = ["不明", "乗用車", "貨物車", "特殊車", "バイク", "自転車", "歩行者", "物件", "相手なし", "その他"];
const TYPE = ["", "人対車両", "車両どうし", "車両単独", "列車"];
const WEATHER = ["", "晴れ", "くもり", "雨", "霧", "雪"];
const ROAD = ["", "交差点", "交差点付近", "カーブ", "単路"];
const WD = ["", "日", "月", "火", "水", "木", "金", "土"];

function routeName(c) {
  if (!c) return "";
  if (c < 1000) return `国道${c}号`;
  if (c < 1500) return `県道${c - 1000}号`;
  if (c < 2000) return "主要市道";
  if (c < 3000) return "県道";
  if (c < 4000) return "市町村道";
  if (c === 4741 || c === 4742) return "沖縄自動車道";
  if (c === 5001 || c === 5002) return "那覇空港自動車道";
  if (c < 6000) return "自動車専用道";
  if (c < 7000) return "道路運送法上の道路";
  if (c < 8000) return "農道";
  if (c < 8500) return "林道";
  if (c < 9000) return "港湾道路";
  if (c < 9500) return "私道";
  return "その他の道";
}

function nowJST() { return new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000); }

(async function main() {
  const [acc, places] = await Promise.all([loadData("accidents"), loadData("places")]);
  const F = Object.fromEntries(acc.fields.map((k, i) => [k, i]));
  const R = acc.rows;
  const meta = acc.meta;
  const GRID = places.grid;

  // 画面の初期化
  const yearSel = document.getElementById("f-year");
  meta.years.slice().reverse().forEach((y) => yearSel.append(el("option", { value: y }, `${y}年`)));
  document.getElementById("lead").textContent =
    `${meta.years[0]}〜${meta.years.at(-1)}年に沖縄で起きた人身事故 ${meta.count.toLocaleString()}件を、場所と時間帯で見る`;
  document.getElementById("foot").innerHTML =
    `出典: <a href="${meta.sourceUrl}" target="_blank" rel="noopener">${meta.source}</a>(${meta.files.join("・")})を加工して作成。` +
    `人身事故だけで、物損事故は含みません。地点は警察が記録した座標です。` +
    `町名は国土地理院の逆ジオコーダで付けた目安です。データ作成 ${meta.built}。`;

  const ids = ["f-time", "f-kind", "f-sev", "f-weather", "f-year"];
  const saved = store.load();
  ids.forEach((id) => { const s = document.getElementById(id); if (saved[id] && [...s.options].some((o) => o.value === saved[id])) s.value = saved[id]; });

  // 地図(レイアウトが決まってから作る。高さ0のまま作ると濃淡レイヤーが描けない)
  if (document.readyState !== "complete") await new Promise((r) => window.addEventListener("load", r, { once: true }));
  const map = L.map("map", { preferCanvas: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  map.fitBounds(VIEWS.main);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  // 件数の多い所だけが濃くなるよう、max を件数に合わせて上げる(ズームに応じて調整)
  const heat = L.heatLayer([], { radius: 10, blur: 12, maxZoom: 1, max: 8, minOpacity: 0.12,
    gradient: { 0.2: "#ffe08a", 0.45: "#ffb347", 0.7: "#f2622e", 1.0: "#b3001b" } }).addTo(map);
  const dots = L.layerGroup();
  const DOT_ZOOM = 14;

  function matches(r, f) {
    if (f.year !== "all" && r[F.y] !== +f.year) return false;
    if (f.sev === "fatal" && !r[F.fatal]) return false;
    if (f.weather === "rain" && r[F.weather] !== 3) return false;
    const a = r[F.kindA], b = r[F.kindB];
    if (f.kind === "ped" && a !== 6 && b !== 6) return false;
    if (f.kind === "cycle" && a !== 5 && b !== 5) return false;
    if (f.kind === "moto" && a !== 4 && b !== 4) return false;
    if (f.kind === "single" && r[F.type] !== 3) return false;
    const h = r[F.h];
    switch (f.time) {
      case "now": { const n = nowJST().getHours(); const d = (h - n + 24) % 24; if (!(d <= 1 || d >= 23)) return false; break; }
      case "morning": if (h < 6 || h >= 10) return false; break;
      case "day": if (h < 10 || h >= 16) return false; break;
      case "evening": if (h < 16 || h >= 20) return false; break;
      case "night": if (!(h >= 20 || h < 6)) return false; break;
    }
    return true;
  }

  function popup(r) {
    const date = `${r[F.y]}年${r[F.m]}月${r[F.d]}日(${WD[r[F.wd]] || "?"}) ${r[F.h]}時台`;
    const who = r[F.type] === 3 ? `${KIND[r[F.kindA]]}の単独事故` : `${KIND[r[F.kindA]]} と ${KIND[r[F.kindB]]}`;
    const hurt = [r[F.dead] ? `死者${r[F.dead]}人` : "", r[F.injured] ? `負傷者${r[F.injured]}人` : ""].filter(Boolean).join("・");
    const where = [routeName(r[F.route]), ROAD[r[F.road]]].filter(Boolean).join(" ");
    return `<b>${r[F.fatal] ? "死亡事故" : "負傷事故"}</b><br>${date}<br>${TYPE[r[F.type]] || ""}: ${who}<br>${hurt}<br>${where}${WEATHER[r[F.weather]] ? "・" + WEATHER[r[F.weather]] : ""}`;
  }

  let current = [];
  function drawDots() {
    dots.clearLayers();
    if (map.getZoom() < DOT_ZOOM) { map.removeLayer(dots); return; }
    const b = map.getBounds().pad(0.2);
    const cDot = css("--dot"), cFatal = css("--fatal");
    for (const r of current) {
      if (!b.contains([r[F.lat], r[F.lng]])) continue;
      L.circleMarker([r[F.lat], r[F.lng]], {
        radius: r[F.fatal] ? 7 : 5, weight: 1, color: "#fff", fillColor: r[F.fatal] ? cFatal : cDot, fillOpacity: 0.9,
      }).bindPopup(() => popup(r)).addTo(dots);
    }
    dots.addTo(map);
  }

  function update() {
    const f = { time: val("f-time"), kind: val("f-kind"), sev: val("f-sev"), weather: val("f-weather"), year: val("f-year") };
    store.save(Object.fromEntries(ids.map((id) => [id, val(id)])));
    current = R.filter((r) => matches(r, f));
    heat.setLatLngs(current.map((r) => [r[F.lat], r[F.lng], r[F.fatal] ? 1 : 0.5]));
    drawDots();

    // 件数
    const dead = current.reduce((s, r) => s + r[F.dead], 0), inj = current.reduce((s, r) => s + r[F.injured], 0);
    const years = f.year === "all" ? meta.years.length : 1;
    document.getElementById("stats").replaceChildren(
      el("div", { class: "stat" }, el("b", {}, current.length.toLocaleString()), el("span", {}, years > 1 ? `件(年平均 ${Math.round(current.length / years).toLocaleString()})` : "件")),
      el("div", { class: "stat fatal" }, el("b", {}, dead.toLocaleString()), el("span", {}, "人が亡くなった")),
      el("div", { class: "stat" }, el("b", {}, inj.toLocaleString()), el("span", {}, "人がけが")),
    );

    // 時間帯グラフ(時間帯フィルタだけ外して数える)
    const fh = { ...f, time: "all" };
    const byHour = Array(24).fill(0);
    for (const r of R) if (matches(r, fh)) byHour[r[F.h]]++;
    const max = Math.max(1, ...byHour), nh = nowJST().getHours();
    const hours = document.getElementById("hours");
    hours.replaceChildren(...byHour.map((n, h) => el("div", { class: h === nh ? "now" : "", style: `height:${(n / max) * 100}%`, title: `${h}時台 ${n}件` })));
    let axis = hours.nextElementSibling;
    if (!axis || !axis.classList.contains("hours-axis")) { axis = el("div", { class: "hours-axis" }); hours.after(axis); }
    axis.replaceChildren(...byHour.map((_, h) => el("span", {}, h % 6 === 0 ? String(h) : "")));
    const peak = byHour.indexOf(Math.max(...byHour));
    document.getElementById("hours-note").textContent = `いちばん多いのは ${peak}時台。濃い棒がいまの時刻(${nh}時台)です。`;

    // ランキング
    const cells = new Map();
    for (const r of current) {
      const key = `${Math.floor(r[F.lat] / GRID)},${Math.floor(r[F.lng] / GRID)}`;
      let c = cells.get(key);
      if (!c) { c = { key, n: 0, dead: 0, rows: [] }; cells.set(key, c); }
      c.n++; c.dead += r[F.dead]; c.rows.push(r);
    }
    const top = [...cells.values()].sort((a, b) => b.n - a.n || b.dead - a.dead).slice(0, 15).filter((c) => c.n >= 2);
    const rank = document.getElementById("rank");
    if (!top.length) { rank.replaceChildren(el("li", { class: "muted" }, "この条件では、同じ場所で2件以上起きた所はありません。")); return; }
    rank.replaceChildren(...top.map((c) => {
      const mode = (arr) => { const m = new Map(); arr.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0]; };
      const muni = meta.muni[String(mode(c.rows.map((r) => r[F.muni])))] || "";
      const town = (places.names[c.key] || "").replace(/^字/, "");
      const road = routeName(mode(c.rows.map((r) => r[F.route])));
      const type = TYPE[mode(c.rows.map((r) => r[F.type]))] || "";
      const hrs = c.rows.map((r) => r[F.h]);
      const band = (() => { const b = mode(hrs.map((h) => (h >= 6 && h < 10) ? "朝" : (h >= 10 && h < 16) ? "昼" : (h >= 16 && h < 20) ? "夕方" : "夜")); return b; })();
      const lat = c.rows.reduce((s, r) => s + r[F.lat], 0) / c.n, lng = c.rows.reduce((s, r) => s + r[F.lng], 0) / c.n;
      return el("li", { tabindex: "0", onclick: () => map.setView([lat, lng], 17), onkeydown: (e) => { if (e.key === "Enter") map.setView([lat, lng], 17); } },
        el("div", {},
          el("div", { class: "name" }, `${muni}${town ? " " + town : ""} 付近`),
          el("div", { class: "sub" }, [road, `${type}が多い`, `${band}に多い`].filter(Boolean).join("・"))),
        el("div", { class: "n" }, `${c.n}件`, c.dead ? el("small", {}, `死者${c.dead}人`) : ""));
    }));
  }

  const val = (id) => document.getElementById(id).value;
  ids.forEach((id) => document.getElementById(id).addEventListener("change", update));
  const heatMax = () => { const z = map.getZoom(); heat.setOptions({ max: ({ 8: 200, 9: 120, 10: 40, 11: 30, 12: 20, 13: 12, 14: 7, 15: 4 })[z] ?? (z < 8 ? 300 : 2) }); };
  map.on("zoomend", heatMax);
  map.on("moveend zoomend", drawDots);
  heatMax();
  document.querySelectorAll("[data-jump]").forEach((b) => b.addEventListener("click", () => map.fitBounds(VIEWS[b.dataset.jump])));
  window.addEventListener("resize", () => map.invalidateSize());
  update();
  setInterval(() => { if (val("f-time") === "now") update(); }, 5 * 60 * 1000);
})().catch((e) => {
  document.getElementById("foot").textContent = `読み込みに失敗しました: ${e.message}`;
});
