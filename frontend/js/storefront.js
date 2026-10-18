import {
  $,
  $$,
  esc,
  money,
  icon,
  api,
  post,
  toast,
  saveLocal,
  cart,
  wishes,
  updateCounters,
  errorBox,
  skeleton,
  card,
  empty,
} from "./common.js";
let settings, categories;
async function shell() {
  [settings, categories] = await Promise.all([
    api("/api/settings"),
    api("/api/categories"),
  ]);
  $("#site-header").innerHTML =
    `<div class="announcement">متجر تجريبي · المنتجات والصور أمثلة توضيحية · التوصيل حسب المناطق المُفعّلة فقط</div><header class="header"><div class="header-main wrap"><a class="brand" href="/" aria-label="${esc(settings.name)}"><span class="brand-ar">${esc(settings.name.split("|")[0].trim())}</span><span class="brand-en" dir="ltr">${esc(settings.name.split("|")[1]?.trim() || "LAMSA")}<small>EVERYDAY ELEGANCE</small></span></a><form action="/products.html" class="header-search" role="search"><label for="site-search" class="sr-only">البحث في المنتجات</label><input id="site-search" name="q" placeholder="عن أي أناقة تبحثين؟"><button class="icon" aria-label="بحث">${icon("search")}</button></form><div class="actions"><a class="icon" href="/wishlist.html" aria-label="المفضلة">${icon("heart")}</a><a class="icon" href="/cart.html" aria-label="حقيبة التسوق">${icon("bag")}<span class="count" id="cart-count">0</span></a><button class="icon menu-btn" id="menu" aria-label="فتح القائمة" aria-controls="main-nav" aria-expanded="false">${icon("menu")}</button></div></div><nav class="nav" id="main-nav" aria-label="القائمة الرئيسية"><a href="/products.html">جميع المنتجات</a><a href="/products.html?new=1">وصل حديثاً</a>${categories
      .slice(0, 6)
      .map(
        (c) => `<a href="/products.html?category=${c.id}">${esc(c.name)}</a>`,
      )
      .join("")}<a href="/products.html?sale=1">التخفيضات</a></nav></header>`;
  $("#site-footer").innerHTML =
    `<footer class="footer"><div class="wrap"><div class="footer-grid"><div><h2>${esc(settings.name)}</h2><p>أناقة هادئة. تفاصيل مدروسة. لمسة تُشبهكِ.</p><p>هذا متجر تجريبي قيد التجهيز.</p></div><div><h3>عن لمسة</h3><a href="/info.html?page=about">حكايتنا</a><a href="/info.html?page=contact">تواصلي معنا</a><a href="/products.html">اكتشفي المجموعة</a></div><div><h3>هنا لمساعدتكِ</h3><a href="/info.html?page=shipping_policy">معلومات التوصيل</a><a href="/info.html?page=returns_policy">الاستبدال والإرجاع</a><a href="/info.html?page=privacy_policy">سياسة الخصوصية</a><a href="/info.html?page=terms">الشروط والأحكام</a></div><div><h3>لنبقَ على تواصل</h3>${settings.instagram ? `<a href="${esc(settings.instagram)}" rel="noopener" target="_blank">Instagram ↗</a>` : "<p>Instagram: يُضاف قريباً</p>"}${settings.whatsapp ? `<a href="${esc(settings.whatsapp)}" target="_blank" rel="noopener">واتساب ↗</a>` : "<p>واتساب: يُضاف قريباً</p>"}<p dir="auto">${esc(settings.phone || "بيانات خدمة العملاء تُضاف قبل الإطلاق")}</p></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} ${esc(settings.name)}</span><span>الأسعار بالشيكل الإسرائيلي · ₪ ILS · الدفع عند الاستلام عند تفعيله</span></div></div></footer>`;
  $("#menu").onclick = () => {
    const open = $("#main-nav").classList.toggle("open");
    $("#menu").setAttribute("aria-expanded", open);
  };
  updateCounters();
}
async function collection(id, query) {
  const el = $(id);
  skeleton(el);
  try {
    const data = await api("/api/products?" + query);
    el.innerHTML = data.items.length ? data.items.map(card).join("") : empty();
  } catch (e) {
    errorBox(el, e);
  }
}
async function home() {
  $("#home-categories").innerHTML = categories
    .slice(0, 7)
    .map(
      (c, i) =>
        `<a class="category" href="/products.html?category=${c.id}"><div class="image"><img src="/assets/look-${i + 1}.svg" alt="${esc(c.name)} — رسم توضيحي" loading="lazy" width="600" height="800"></div><h3>${esc(c.name)} ←</h3></a>`,
    )
    .join("");
  if (settings.tagline !== "أناقتك تبدأ من هنا")
    $("#hero-title").textContent = settings.tagline;
  $("#hero-text").textContent = settings.hero_text;
  $("#brand-about").textContent = settings.about;
  const merchandising = await api("/api/merchandising");
  if (merchandising.bestsellers_available) {
    const section = $("#featured-products").closest("section");
    $("h2", section).textContent = "الأكثر مبيعاً";
    $(".kicker", section).textContent =
      "من اختيارات عميلاتنا · بناءً على الطلبات المُسلّمة";
    $(".text-link", section).href =
      "/products.html?bestsellers=1&sort=bestsellers";
  }
  await Promise.all([
    collection("#new-products", "new=1&available=1&sort=newest&limit=4"),
    collection(
      "#featured-products",
      merchandising.bestsellers_available
        ? "bestsellers=1&sort=bestsellers&limit=4"
        : "featured=1&limit=4",
    ),
    collection("#sale-products", "sale=1&limit=4"),
  ]);
}
async function catalog() {
  const form = $("#filters"),
    params = new URLSearchParams(location.search);
  $("#category-filter").insertAdjacentHTML(
    "beforeend",
    categories
      .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
      .join(""),
  );
  const options = await api("/api/options");
  for (const key of ["size", "color"]) {
    const select = form.elements[key];
    select.innerHTML =
      '<option value="">الكل</option>' +
      options[key].map((v) => `<option>${esc(v)}</option>`).join("");
  }
  for (const [k, v] of params) {
    const el = form.elements[k];
    if (el) {
      if (el.type === "checkbox") el.checked = v === "1";
      else el.value = ["min", "max"].includes(k) ? Number(v) / 100 : v;
    }
  }
  if (params.get("sort") === "bestsellers")
    $("#sort").insertAdjacentHTML(
      "beforeend",
      '<option value="bestsellers">الأكثر مبيعاً</option>',
    );
  if (params.has("sort")) $("#sort").value = params.get("sort");
  let page = Number(params.get("page")) || 1;
  let run = 0;
  async function load() {
    const seq = ++run;
    const q = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      if (v !== "")
        q.set(k, ["min", "max"].includes(k) ? Math.round(Number(v) * 100) : v);
    }
    if (params.get("bestsellers") === "1") q.set("bestsellers", "1");
    q.set("sort", $("#sort").value || "featured");
    q.set("page", page);
    history.replaceState(null, "", "?" + q);
    skeleton($("#catalog"), 6);
    try {
      const d = await api("/api/products?" + q);
      if (seq !== run) return;
      $("#result-count").textContent = `${d.total} قطعة في المجموعة`;
      $("#catalog").innerHTML = d.items.length
        ? d.items.map(card).join("")
        : empty();
      const pages = Math.ceil(d.total / d.limit);
      $("#pagination").innerHTML =
        pages > 1
          ? `<button class="btn light small" id="prev" ${page <= 1 ? "disabled" : ""}>السابق</button><span>${page} / ${pages}</span><button class="btn light small" id="next" ${page >= pages ? "disabled" : ""}>التالي</button>`
          : "";
      if ($("#prev"))
        $("#prev").onclick = () => {
          page--;
          load();
        };
      if ($("#next"))
        $("#next").onclick = () => {
          page++;
          load();
        };
    } catch (e) {
      errorBox($("#catalog"), e);
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    page = 1;
    load();
  };
  form.onreset = () => {
    setTimeout(() => {
      page = 1;
      load();
    }, 0);
  };
  $("#sort").onchange = () => {
    page = 1;
    load();
  };
  await load();
}
async function productPage() {
  const el = $("#product-detail");
  skeleton(el, 1);
  try {
    const p = await api(
      "/api/products/" +
        encodeURIComponent(new URLSearchParams(location.search).get("id")),
    );
    document.title = p.name + " | لمسة";
    const sizes = [...new Set(p.variants.map((v) => v.size))],
      colors = [...new Set(p.variants.map((v) => v.color))];
    let size = "",
      color = "";
    el.classList.add("detail-layout");
    el.innerHTML = `<div><button class="gallery-main" id="enlarge" aria-label="تكبير صورة المنتج"><img id="main-image" src="${esc(p.images[0]?.path || "/assets/placeholder.svg")}" alt="${esc(p.name)} — صورة توضيحية"></button><div class="thumbnails">${p.images.map((i, n) => `<button data-image="${esc(i.path)}" aria-label="عرض الصورة ${n + 1}"><img src="${esc(i.path)}" alt="صورة ${n + 1}"></button>`).join("")}</div></div><div class="detail-info"><p class="kicker">${esc(p.category)}</p><h1>${esc(p.name)}</h1><div class="price"><b>${money(p.price)}</b>${p.original_price ? `<del>${money(p.original_price)}</del><span class="badge-inline">خصم ${Math.round((1 - p.price / p.original_price) * 100)}٪</span>` : ""}</div><p class="notice">عينة تطوير · الرسم توضيحي وليس صورة منتج حقيقي.</p><p id="size-label">المقاس</p><div class="option-row" role="group" aria-labelledby="size-label">${sizes.map((s) => `<button class="option" data-size="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join("")}</div><p id="color-label">اللون</p><div class="option-row" role="group" aria-labelledby="color-label">${colors.map((c) => `<button class="option" data-color="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("")}</div><label class="field">الكمية<input class="quantity" id="quantity" type="number" value="1" min="1" max="20"></label><p class="stock" id="stock" aria-live="polite">اختاري المقاس واللون لعرض التوفر</p><div class="purchase"><button class="btn" id="add-cart" disabled>أضيفي إلى السلة</button><button class="icon wish ${wishes().includes(p.id) ? "selected" : ""}" data-wish="${p.id}" aria-label="إضافة إلى المفضلة" aria-pressed="${wishes().includes(p.id)}">${icon("heart")}</button></div><details open><summary>عن القطعة</summary><p>${esc(p.description)}</p></details><details><summary>دليل المقاسات</summary><p>المقاسات المعروضة أمثلة للتطوير. تُضاف قياسات كل قطعة بالسنتيمتر بعد تجهيز المنتجات الفعلية؛ يرجى التواصل مع المتجر قبل الشراء.</p></details><details><summary>التوصيل والاستبدال</summary><p>${esc(settings.shipping_policy)}\n${esc(settings.returns_policy)}</p></details></div>`;
    const variant = () =>
      p.variants.find((v) => v.size === size && v.color === color);
    function update() {
      const v = variant(),
        q = Number($("#quantity").value);
      $$("[data-size]").forEach((b) => {
        b.setAttribute("aria-pressed", b.dataset.size === size);
        b.disabled = !p.variants.some(
          (v) =>
            v.size === b.dataset.size &&
            (!color || v.color === color) &&
            v.stock > 0,
        );
      });
      $$("[data-color]").forEach((b) => {
        b.setAttribute("aria-pressed", b.dataset.color === color);
        b.disabled = !p.variants.some(
          (v) =>
            v.color === b.dataset.color &&
            (!size || v.size === size) &&
            v.stock > 0,
        );
      });
      $("#stock").textContent = v
        ? v.stock > 0
          ? `متوفر: ${v.stock} قطعة · ${v.sku}`
          : "هذا الخيار غير متوفر"
        : "اختاري المقاس واللون لعرض التوفر";
      $("#add-cart").disabled =
        !v || v.stock < q || !Number.isInteger(q) || q < 1 || q > 20;
    }
    $$("[data-size]").forEach(
      (b) =>
        (b.onclick = () => {
          size = b.dataset.size === size ? "" : b.dataset.size;
          update();
        }),
    );
    $$("[data-color]").forEach(
      (b) =>
        (b.onclick = () => {
          color = b.dataset.color === color ? "" : b.dataset.color;
          update();
        }),
    );
    $("#quantity").oninput = update;
    update();
    $("#add-cart").onclick = async () => {
      const b = $("#add-cart");
      b.disabled = true;
      try {
        const v = variant(),
          items = cart(),
          existing = items.find((i) => i.variant_id === v.id),
          q = Number($("#quantity").value);
        if (existing) existing.quantity += q;
        else items.push({ variant_id: v.id, quantity: q });
        await post("/api/cart/quote", { items });
        saveLocal("lamsa-cart", items);
        updateCounters();
        toast("أُضيفت القطعة إلى حقيبتكِ");
      } catch (e) {
        toast(e.message);
      } finally {
        update();
      }
    };
    $$("[data-image]").forEach(
      (b) => (b.onclick = () => ($("#main-image").src = b.dataset.image)),
    );
    const modal = $("#image-modal");
    $("#enlarge").onclick = () => {
      $("img", modal).src = $("#main-image").src;
      modal.showModal();
    };
    $(".modal-close", modal).onclick = () => modal.close();
    modal.onclick = (e) => {
      if (e.target === modal) modal.close();
    };
    await collection("#related", `category=${p.category_id}&limit=4`);
  } catch (e) {
    el.classList.remove("detail-layout");
    errorBox(el, e);
  }
}
function summary(q, link = false) {
  return `<h2>ملخّص الحقيبة</h2><div class="summary-line"><span>قيمة المنتجات</span><b>${money(q.subtotal)}</b></div><div class="summary-line"><span>التوصيل</span><span>${q.shipping_fee === null ? "حسب الوجهة" : money(q.shipping_fee)}</span></div><div class="summary-line total"><span>${q.total === null ? "المجموع قبل التوصيل" : "الإجمالي"}</span><b>${money(q.total ?? q.subtotal)}</b></div>${link ? '<a class="btn" href="/checkout.html">إتمام الطلب ←</a>' : ""}<small>يُعاد التحقق من الأسعار والمخزون عند تأكيد الطلب.</small>`;
}
async function cartPage() {
  const el = $("#cart-content"),
    items = cart();
  if (!items.length) {
    el.innerHTML = empty("حقيبتكِ بانتظار أول قطعة تحبّينها.");
    return;
  }
  try {
    const q = await post("/api/cart/quote", { items });
    el.innerHTML = `<div class="cart-layout"><div>${q.items.map((i) => `<article class="cart-line"><a href="/product.html?id=${i.product_id}"><img data-product-image="${i.product_id}" src="/assets/placeholder.svg" alt="${esc(i.name)}"></a><div><h3><a href="/product.html?id=${i.product_id}">${esc(i.name)}</a></h3><p class="muted">${esc(i.size)} / ${esc(i.color)}</p><p>${money(i.unit_price)}</p><button class="btn light small" data-remove="${i.variant_id}">إزالة</button></div><div><label><span class="sr-only">كمية ${esc(i.name)}</span><input class="quantity" data-qty="${i.variant_id}" type="number" min="1" max="20" value="${i.quantity}"></label><p>${money(i.line_total)}</p></div></article>`).join("")}</div><aside class="summary">${summary(q, true)}<label class="field">احسبي التوصيل<select id="cart-region"><option value="">اختاري الوجهة</option></select></label><p class="muted" id="shipping-note"></p><div id="cart-quote"></div></aside></div>`;
    $$("[data-product-image]").forEach(async (img) => {
      try {
        const p = await api("/api/products/" + img.dataset.productImage);
        img.src = p.images[0]?.path || "/assets/placeholder.svg";
      } catch {}
    });
    $$("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          saveLocal(
            "lamsa-cart",
            cart().filter((i) => i.variant_id !== Number(b.dataset.remove)),
          );
          updateCounters();
          cartPage();
        }),
    );
    $$("[data-qty]").forEach(
      (input) =>
        (input.onchange = async () => {
          const next = cart().map((i) =>
            i.variant_id === Number(input.dataset.qty)
              ? { ...i, quantity: Number(input.value) }
              : i,
          );
          try {
            await post("/api/cart/quote", { items: next });
            saveLocal("lamsa-cart", next);
            updateCounters();
            cartPage();
          } catch (e) {
            toast(e.message);
            cartPage();
          }
        }),
    );
    const regions = await api("/api/shipping");
    $("#cart-region").insertAdjacentHTML(
      "beforeend",
      regions
        .map(
          (r) =>
            `<option value="${r.id}">${esc(r.region)} / ${esc(r.city)} — ${money(r.fee)}</option>`,
        )
        .join(""),
    );
    if (!regions.length)
      $("#shipping-note").textContent = "لم يُفعّل المتجر أي وجهة توصيل بعد.";
    $("#cart-region").onchange = async (e) => {
      try {
        const q = await post("/api/cart/quote", {
          items: cart(),
          shipping_region_id: e.target.value ? Number(e.target.value) : null,
        });
        $("#cart-quote").innerHTML =
          q.total === null
            ? ""
            : `<div class="summary-line total"><span>الإجمالي بالتوصيل</span><b>${money(q.total)}</b></div>`;
      } catch (err) {
        toast(err.message);
      }
    };
  } catch (e) {
    el.innerHTML = `<div class="error">${esc(e.message)} — راجعي المنتجات أو أزيلي الخيارات غير المتوفرة.</div><div>${items.map((i) => `<p>الخيار #${i.variant_id} · الكمية ${i.quantity} <button class="btn light small" data-remove="${i.variant_id}">إزالة</button></p>`).join("")}</div>`;
    $$("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          saveLocal(
            "lamsa-cart",
            cart().filter((i) => i.variant_id !== Number(b.dataset.remove)),
          );
          updateCounters();
          cartPage();
        }),
    );
  }
}
async function checkout() {
  const form = $("#checkout-form"),
    button = $("#place-order");
  button.disabled = true;
  const regions = (await api("/api/shipping")).filter((r) => r.cod_enabled);
  $("#checkout-region").insertAdjacentHTML(
    "beforeend",
    regions
      .map(
        (r) =>
          `<option value="${r.id}">${esc(r.region)} / ${esc(r.city)}</option>`,
      )
      .join(""),
  );
  if (!settings.orders_enabled || !settings.cod_enabled || !regions.length)
    $("#checkout-message").innerHTML =
      '<p class="notice">استقبال الطلبات غير متاح حالياً. المتجر تجريبي؛ لا توجد وجهات دفع عند الاستلام مُفعّلة أو تم إيقاف الطلبات.</p>';
  let refreshVersion = 0;
  async function refresh() {
    const version = ++refreshVersion;
    button.disabled = true;
    try {
      const rid = Number($("#checkout-region").value) || null,
        q = await post("/api/cart/quote", {
          items: cart(),
          shipping_region_id: rid,
        });
      if (version !== refreshVersion) return;
      $("#checkout-summary").innerHTML =
        summary(q) +
        q.items
          .map(
            (i) =>
              `<div class="summary-line"><span>${esc(i.name)} × ${i.quantity}</span><span>${money(i.line_total)}</span></div>`,
          )
          .join("");
      button.disabled =
        !rid || !settings.orders_enabled || !settings.cod_enabled;
    } catch (e) {
      if (version !== refreshVersion) return;
      errorBox($("#checkout-summary"), e);
      button.disabled = true;
    }
  }
  $("#checkout-region").onchange = refresh;
  await refresh();
  form.onsubmit = async (e) => {
    e.preventDefault();
    button.disabled = true;
    $("#checkout-error").textContent = "";
    try {
      const fields = Object.fromEntries(new FormData(form)),
        region = regions.find(
          (r) => r.id === Number(fields.shipping_region_id),
        );
      if (!region) throw Error("اختاري وجهة توصيل متاحة");
      delete fields.shipping_region_id;
      fields.region = region.region;
      fields.city = region.city;
      const payload = {
        items: cart(),
        shipping_region_id: region.id,
        customer: fields,
        payment_method: "cod",
      };
      const fingerprint = JSON.stringify(payload);
      let saved;
      try {
        saved = JSON.parse(sessionStorage.getItem("lamsa-checkout-key"));
      } catch {}
      if (!saved || saved.fingerprint !== fingerprint) {
        saved = { fingerprint, key: crypto.randomUUID() };
        sessionStorage.setItem("lamsa-checkout-key", JSON.stringify(saved));
      }
      payload.idempotency_key = saved.key;
      const result = await post("/api/orders", payload);
      sessionStorage.setItem("lamsa-confirmation", JSON.stringify(result));
      saveLocal("lamsa-cart", []);
      sessionStorage.removeItem("lamsa-checkout-key");
      location.assign("/order-confirmation.html");
    } catch (err) {
      $("#checkout-error").innerHTML =
        `<p class="error">${esc(err.message)}</p>`;
      button.disabled = false;
    }
  };
}
function confirmation() {
  let result;
  try {
    result = JSON.parse(sessionStorage.getItem("lamsa-confirmation"));
  } catch {}
  $("#confirmation").innerHTML = result
    ? `<p class="kicker">شكراً لاختياركِ لمسة</p><h1>تم استلام طلبكِ</h1><p>رقم الطلب: <b dir="ltr">${esc(result.number)}</b></p><p>الإجمالي المؤكد: <b>${money(result.total)}</b></p><p>الدفع عند الاستلام. سيؤكد المتجر تفاصيل التنفيذ.</p><a class="btn" href="/products.html">واصلي اكتشاف المجموعة</a>`
    : empty("لا يوجد تأكيد طلب محفوظ في هذه الجلسة.");
}
async function wishlist() {
  const el = $("#wishlist-products");
  skeleton(el);
  const results = await Promise.allSettled(
      wishes().map((id) => api("/api/products/" + id)),
    ),
    products = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);
  el.innerHTML = products.length
    ? products.map(card).join("")
    : empty("لم تختاري أي قطعة بعد. اضغطي على القلب لحفظ ما تحبّين.");
}
function info() {
  const key = new URLSearchParams(location.search).get("page") || "about",
    labels = {
      about: "حكاية لمسة",
      contact: "تواصلي معنا",
      shipping_policy: "معلومات التوصيل",
      returns_policy: "الاستبدال والإرجاع",
      privacy_policy: "سياسة الخصوصية",
      terms: "الشروط والأحكام",
    };
  $("#info-title").textContent = labels[key] || "عن لمسة";
  if (key === "contact")
    $("#info-content").innerHTML =
      `<p>${esc(settings.phone || "لم تُضَف بيانات التواصل بعد.")}</p>${settings.whatsapp ? `<a class="btn" href="${esc(settings.whatsapp)}" target="_blank" rel="noopener">تواصلي عبر واتساب</a>` : ""}`;
  else $("#info-content").textContent = settings[key] || settings.about;
}
(async () => {
  try {
    await shell();
    const page = location.pathname.split("/").pop() || "index.html";
    await (
      {
        "index.html": home,
        "products.html": catalog,
        "product.html": productPage,
        "cart.html": cartPage,
        "checkout.html": checkout,
        "order-confirmation.html": confirmation,
        "wishlist.html": wishlist,
        "info.html": info,
      }[page] || home
    )();
  } catch (e) {
    errorBox($("#main"), e);
  }
})();
window.addEventListener("storage", updateCounters);
