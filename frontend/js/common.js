export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (n) =>
  new Intl.NumberFormat("ar-IL", { style: "currency", currency: "ILS" }).format(
    n / 100,
  );
export const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  heart:
    '<path d="M20.8 4.8a5.5 5.5 0 00-7.8 0L12 6l-1-1.2a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 000-7.8Z"/>',
  bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 018 0v2"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
};
export const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n] || ""}</svg>`;
export async function api(path, options = {}) {
  const headers = {
    ...(options.body && typeof options.body === "string"
      ? { "Content-Type": "application/json" }
      : {}),
    ...options.headers,
  };
  const r = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("تعذر قراءة استجابة الخادم");
  }
  if (!r.ok) {
    const e = Error(data.error || "تعذر إكمال الطلب");
    e.status = r.status;
    throw e;
  }
  return data;
}
export const post = (path, data, method = "POST", headers = {}) =>
  api(path, { method, headers, body: JSON.stringify(data) });
let toastTimer;
export function toast(text) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}
export function readLocal(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw Error("تعذر حفظ البيانات في المتصفح. تحققي من إعدادات التخزين.");
  }
}
export function cart() {
  const a = readLocal("lamsa-cart");
  return Array.isArray(a)
    ? a
        .filter(
          (i) =>
            Number.isInteger(i.variant_id) &&
            Number.isInteger(i.quantity) &&
            i.quantity > 0 &&
            i.quantity <= 20,
        )
        .slice(0, 50)
    : [];
}
export function wishes() {
  const a = readLocal("lamsa-wishlist");
  return Array.isArray(a) ? a.filter(Number.isInteger).slice(0, 100) : [];
}
export function updateCounters() {
  const n = $("#cart-count");
  if (n) n.textContent = cart().reduce((s, i) => s + i.quantity, 0);
}
export function errorBox(el, e) {
  el.innerHTML = `<div class="error" role="alert">${esc(e.message)} <button class="btn light small" data-reload>إعادة المحاولة</button></div>`;
}
export function skeleton(el, n = 4) {
  el.innerHTML = Array.from(
    { length: n },
    () => '<div class="skeleton" aria-label="جارٍ التحميل"></div>',
  ).join("");
}
export function card(p) {
  const selected = wishes().includes(p.id);
  return `<article class="product-card"><div class="product-image"><a href="/product.html?id=${p.id}"><img src="${esc(p.images[0]?.path || "/assets/placeholder.svg")}" alt="${esc(p.name)} — صورة توضيحية" loading="lazy" width="600" height="800"></a><button class="icon wish ${selected ? "selected" : ""}" data-wish="${p.id}" aria-label="${selected ? "إزالة من" : "إضافة إلى"} المفضلة" aria-pressed="${selected}">${icon("heart")}</button>${p.original_price > p.price ? `<span class="badge">خصم ${Math.round((1 - p.price / p.original_price) * 100)}٪</span>` : p.is_new ? '<span class="badge">وصل حديثاً</span>' : ""}</div><p class="product-category">${esc(p.category)}</p><h3><a href="/product.html?id=${p.id}">${esc(p.name)}</a></h3><div class="price"><b>${money(p.price)}</b>${p.original_price ? `<del>${money(p.original_price)}</del>` : ""}</div><p class="swatches">${esc([...new Set(p.variants.map((v) => v.color))].join(" · "))}</p></article>`;
}
export const empty = (text = "لا توجد منتجات مطابقة لاختياركِ.") =>
  `<div class="empty"><p>${esc(text)}</p><a class="btn light" href="/products.html">اكتشفي المجموعة</a></div>`;
document.addEventListener(
  "error",
  (e) => {
    if (
      e.target instanceof HTMLImageElement &&
      !e.target.src.endsWith("/assets/placeholder.svg")
    )
      e.target.src = "/assets/placeholder.svg";
  },
  true,
);
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-reload]")) location.reload();
  const b = e.target.closest("[data-wish]");
  if (!b) return;
  try {
    const id = Number(b.dataset.wish),
      a = wishes();
    const next = a.includes(id) ? a.filter((x) => x !== id) : [...a, id];
    saveLocal("lamsa-wishlist", next);
    $$(`[data-wish="${id}"]`).forEach((x) => {
      x.classList.toggle("selected", next.includes(id));
      x.setAttribute("aria-pressed", next.includes(id));
      x.setAttribute(
        "aria-label",
        next.includes(id) ? "إزالة من المفضلة" : "إضافة إلى المفضلة",
      );
    });
    toast(next.includes(id) ? "أُضيفت إلى المفضلة" : "أُزيلت من المفضلة");
  } catch (err) {
    toast(err.message);
  }
});
