// 沖縄 事故多発マップ の画面の動き。ビルド不要、このファイルを書き換えるだけ。

// 端末内保存(ユーザーのデータはサーバーに送らない)
const store = {
  key: "jiko-map:v1",
  load() { try { return JSON.parse(localStorage.getItem(this.key)) ?? {}; } catch { return {}; } },
  save(obj) { try { localStorage.setItem(this.key, JSON.stringify(obj)); } catch {} },
};

// 固定データは docs/data/*.json に置き、ここで読む
async function loadData(name) {
  const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
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

async function render() {
  const app = document.getElementById("app");
  app.replaceChildren();
  const state = store.load();
  const data = await loadData("sample");
  app.append(
    el("p", {}, `サンプルデータ: ${data.items.length} 件`),
    el("ul", { class: "list" }, ...data.items.map((it) => el("li", {}, it.name))),
    el("button", { onclick: () => { state.clicks = (state.clicks ?? 0) + 1; store.save(state); render(); } },
      `保存のテスト(${state.clicks ?? 0} 回)`),
  );
}

document.getElementById("updated").textContent = "更新: 2026-10-22";
render().catch((e) => {
  document.getElementById("app").textContent = `読み込みに失敗しました: ${e.message}`;
});
