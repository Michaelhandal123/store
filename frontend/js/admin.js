import { $, $$, esc, money, api, post, toast, errorBox } from "./common.js";
let csrf = "",
  categories = [],
  current = "overview";
const call = (path, data, method = "POST") =>
  post("/api/admin/" + path, data, method, { "X-CSRF-Token": csrf });
const labels = {
  new: "جديد",
  preparing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};
const input = (name, label, value = "", type = "text", extra = "") =>
  `<label class="field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const checkbox = (name, label, value) =>
  `<label class="check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${esc(label)}</label>`;
const textarea = (name, label, value) =>
  `<label class="field">${esc(label)}<textarea name="${name}" maxlength="6000">${esc(value)}</textarea></label>`;
function failure(e) {
  if (e.status === 401) {
    $("#admin-area").hidden = true;
    $("#admin-login").hidden = false;
    csrf = "";
  }
  $("#admin-message").innerHTML = `<p class="error">${esc(e.message)}</p>`;
}
async function load(tab = current) {
  current = tab;
  $("#admin-message").textContent = "";
  $("#admin-content").innerHTML = '<p role="status">جارٍ التحميل…</p>';
  try {
    await { overview, products, orders, shipping, settings }[tab]();
  } catch (e) {
    failure(e);
    errorBox($("#admin-content"), e);
  }
}
async function enter(token) {
  csrf = token;
  categories = await api("/api/categories");
  $("#admin-login").hidden = true;
  $("#admin-area").hidden = false;
  await load();
}
$("#login").onsubmit = async (e) => {
  e.preventDefault();
  const b = $("button", e.target);
  b.disabled = true;
  try {
    const result = await post(
      "/api/admin/login",
      Object.fromEntries(new FormData(e.target)),
    );
    e.target.reset();
    await enter(result.csrf);
  } catch (err) {
    $("#login-error").textContent = err.message;
  } finally {
    b.disabled = false;
  }
};
$("#logout").onclick = async () => {
  try {
    await call("logout", {});
    csrf = "";
    $("#admin-area").hidden = true;
    $("#admin-login").hidden = false;
  } catch (e) {
    failure(e);
  }
};
$$("[data-tab]").forEach((b) => (b.onclick = () => load(b.dataset.tab)));
async function overview() {
  const d = await api("/api/admin/overview");
  $("#admin-content").innerHTML =
    `<h2>نبض المتجر</h2><div class="stats"><div class="stat">إجمالي الطلبات<strong>${d.orders.total}</strong></div><div class="stat">طلبات جديدة<strong>${d.orders.pending}</strong></div><div class="stat">تم التوصيل<strong>${d.orders.completed}</strong></div><div class="stat">مبيعات الطلبات المُسلّمة<strong>${money(d.orders.sales)}</strong></div></div><div class="admin-card"><h3>${d.products} منتج · خيارات منخفضة المخزون (أقل من 5)</h3><div class="table-wrap"><table><thead><tr><th>المنتج</th><th>المقاس</th><th>اللون</th><th>المخزون</th></tr></thead><tbody>${d.low_stock.map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.size)}</td><td>${esc(v.color)}</td><td>${v.stock}</td></tr>`).join("") || '<tr><td colspan="4">لا توجد خيارات منخفضة المخزون.</td></tr>'}</tbody></table></div></div><p class="notice">المبيعات محسوبة من الطلبات المُسلّمة فقط، وتتضمن رسوم التوصيل. هذا تقرير تشغيلي وليس تقريراً ضريبياً.</p>`;
}
async function products() {
  const items = await api("/api/admin/products");
  $("#admin-content").innerHTML =
    `<div class="section-head"><h2>المنتجات (${items.length})</h2><button class="btn" id="new-product">إضافة منتج</button></div><form id="new-category" class="admin-actions"><label class="field">فئة جديدة<input name="name" required maxlength="100"></label><button class="btn light small">إضافة الفئة</button></form><div class="admin-card table-wrap"><table><thead><tr><th>الاسم</th><th>الفئة</th><th>السعر</th><th>الظهور</th><th>إدارة</th></tr></thead><tbody>${items.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.active ? "نشط" : "مخفي"}</td><td><button class="btn light small" data-edit="${p.id}">تعديل</button> <button class="btn light small" data-deactivate="${p.id}">إخفاء</button></td></tr>`).join("") || '<tr><td colspan="5">لا توجد منتجات بعد.</td></tr>'}</tbody></table></div>`;
  $("#new-product").onclick = () => editor();
  $$("[data-edit]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await editor(await api("/api/admin/products/" + b.dataset.edit));
        } catch (e) {
          failure(e);
        }
      }),
  );
  $$("[data-deactivate]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("إخفاء المنتج من المتجر مع الحفاظ على سجلات الطلبات؟"))
          return;
        try {
          await call("products/" + b.dataset.deactivate, {}, "DELETE");
          toast("تم إخفاء المنتج");
          await products();
        } catch (e) {
          failure(e);
        }
      }),
  );
  $("#new-category").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await call("categories", Object.fromEntries(new FormData(e.target)));
      categories = await api("/api/categories");
      toast("أُضيفت الفئة");
      await products();
    } catch (err) {
      failure(err);
    }
  };
}
async function editor(
  p = {
    name: "",
    description: "",
    price: 10000,
    original_price: null,
    category_id: categories[0]?.id,
    active: 1,
    featured: 0,
    is_new: 0,
    images: [],
    variants: [],
  },
) {
  $("#admin-content").innerHTML =
    `<h2>${p.id ? "تعديل المنتج" : "إضافة منتج"}</h2><form id="product-editor" class="admin-card"><div class="form-grid">${input("name", "الاسم العربي", p.name, "text", 'required maxlength="200"')}<label class="field">الفئة<select name="category_id" required>${categories.map((c) => `<option value="${c.id}" ${p.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>${input("price", "السعر بالشيكل", p.price / 100, "number", 'min="0.01" max="100000" step="0.01" required')}${input("original_price", "السعر قبل الخصم (اختياري)", p.original_price ? p.original_price / 100 : "", "number", 'min="0.01" max="100000" step="0.01"')}<div class="span-2">${textarea("description", "وصف المنتج", p.description)}</div>${checkbox("active", "نشط في المتجر", p.active)}${checkbox("featured", "ضمن اختيارات لمسة", p.featured)}${checkbox("is_new", "وصل حديثاً", p.is_new)}</div><h3>صور المنتج</h3><p class="muted">مسار محلي لكل سطر؛ ارفعي PNG أو JPEG (حتى 5MB). تُعاد معالجة الصور لتخزين PNG آمن.</p>${textarea("images", "مسارات الصور (حتى 8)", p.images.map((i) => i.path).join("\n"))}<label class="field">رفع صورة<input type="file" id="image-upload" accept="image/png,image/jpeg"></label><p id="upload-status" role="status"></p><h3>خيارات المقاس واللون والمخزون</h3><p class="muted">لكل خيار SKU فريد. إزالة خيار تخفيه وتحافظ على الطلبات السابقة.</p><div id="variants"></div><button type="button" class="btn light small" id="add-variant">إضافة خيار</button><div class="admin-actions section"><button class="btn" id="save-product">حفظ المنتج</button><button type="button" class="btn light" id="cancel-edit">رجوع</button></div></form>`;
  function row(v = { size: "M", color: "بيج", sku: "", stock: 0 }) {
    const node = document.createElement("div");
    node.className = "variant-row";
    node.innerHTML = `<input class="control" data-v="size" aria-label="المقاس" value="${esc(v.size)}" required maxlength="20"><input class="control" data-v="color" aria-label="اللون" value="${esc(v.color)}" required maxlength="80"><input class="control" data-v="sku" aria-label="SKU" value="${esc(v.sku)}" required maxlength="80"><input class="control" data-v="stock" aria-label="المخزون" type="number" min="0" max="1000000" value="${v.stock}" required><button type="button" class="btn light small" aria-label="إزالة الخيار">×</button>`;
    $("button", node).onclick = () => node.remove();
    $("#variants").append(node);
  }
  p.variants.filter((v) => v.active !== 0).forEach(row);
  if (!p.variants.length) row();
  $("#add-variant").onclick = () => row();
  $("#cancel-edit").onclick = () => load("products");
  $("#image-upload").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("الحد الأقصى 5MB");
      return;
    }
    const save = $("#save-product");
    save.disabled = true;
    $("#upload-status").textContent = "جارٍ رفع الصورة…";
    try {
      const r = await api("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": file.type, "X-CSRF-Token": csrf },
        body: file,
      });
      const el = $("[name=images]");
      el.value += (el.value.trim() ? "\n" : "") + r.path;
      $("#upload-status").textContent = "تم رفع الصورة";
    } catch (err) {
      $("#upload-status").textContent = err.message;
    } finally {
      save.disabled = false;
    }
  };
  $("#product-editor").onsubmit = async (e) => {
    e.preventDefault();
    $("#save-product").disabled = true;
    try {
      const data = Object.fromEntries(new FormData(e.target));
      for (const key of ["active", "featured", "is_new"])
        data[key] = e.target.elements[key].checked;
      data.category_id = Number(data.category_id);
      data.price = Math.round(Number(data.price) * 100);
      data.original_price = data.original_price
        ? Math.round(Number(data.original_price) * 100)
        : null;
      data.images = data.images
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      data.variants = $$(".variant-row").map((r) =>
        Object.fromEntries(
          $$("[data-v]", r).map((el) => [
            el.dataset.v,
            el.dataset.v === "stock" ? Number(el.value) : el.value,
          ]),
        ),
      );
      await call(
        "products" + (p.id ? "/" + p.id : ""),
        data,
        p.id ? "PUT" : "POST",
      );
      toast("تم حفظ المنتج");
      await load("products");
    } catch (err) {
      failure(err);
      const b = $("#save-product");
      if (b) b.disabled = false;
    }
  };
}
async function orders() {
  const items = await api("/api/admin/orders");
  $("#admin-content").innerHTML =
    `<h2>الطلبات</h2><p class="muted">آخر 500 طلب · بيانات العملاء متاحة للإدارة فقط.</p><div class="admin-card table-wrap"><table><thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>${items.map((o) => `<tr><td dir="ltr">${esc(o.number)}</td><td>${esc(o.created_at)}</td><td>${money(o.total)}</td><td>${labels[o.status]}</td><td><button class="btn light small" data-order="${o.id}">فتح</button></td></tr>`).join("") || '<tr><td colspan="5">لا توجد طلبات بعد.</td></tr>'}</tbody></table></div>`;
  $$("[data-order]").forEach(
    (b) => (b.onclick = () => orderDetail(b.dataset.order)),
  );
}
async function orderDetail(id) {
  try {
    const o = await api("/api/admin/orders/" + id),
      c = o.customer;
    const allowed = {
      new: ["preparing", "cancelled"],
      preparing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };
    $("#admin-content").innerHTML =
      `<div class="admin-card"><h2 dir="ltr">${esc(o.number)}</h2><p>الحالة: ${labels[o.status]}</p><h3>بيانات التوصيل</h3><p>${esc(c.name)} · <bdi>${esc(c.phone)}</bdi> · <bdi>${esc(c.email)}</bdi></p><p>${[c.region, c.city, c.neighborhood, c.street, c.building].map(esc).join(" / ")}</p><p>${esc(c.details)}</p><p>ملاحظات: ${esc(c.notes)}</p><div class="table-wrap"><table><thead><tr><th>المنتج</th><th>الخيار</th><th>الكمية</th><th>سعر الوحدة</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${esc(i.name)}<br>${esc(i.sku)}</td><td>${esc(i.size)} / ${esc(i.color)}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td></tr>`).join("")}</tbody></table></div><p>قيمة المنتجات: ${money(o.subtotal)} · التوصيل: ${money(o.shipping_fee)} · الإجمالي: ${money(o.total)}</p><div class="admin-actions">${allowed[o.status].map((s) => `<button class="btn light" data-status="${s}">${labels[s]}</button>`).join("")}<button class="btn light" id="back-orders">رجوع للطلبات</button></div><p class="muted">إلغاء الطلب قبل الشحن يعيد المخزون مرة واحدة. إرجاع الطلب بعد الشحن يحتاج إجراء تشغيلي منفصل.</p></div>`;
    $("#back-orders").onclick = () => load("orders");
    $$("[data-status]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (
            !confirm("تأكيد تغيير الحالة إلى " + labels[b.dataset.status] + "؟")
          )
            return;
          try {
            await call(
              "orders/" + id + "/status",
              { status: b.dataset.status },
              "PUT",
            );
            toast("تم تحديث الطلب");
            await orderDetail(id);
          } catch (e) {
            failure(e);
          }
        }),
    );
  } catch (e) {
    failure(e);
  }
}
async function settings() {
  const s = await api("/api/admin/settings");
  const fields = {
    name: "اسم المتجر (عربي | English)",
    tagline: "عنوان الصفحة الرئيسية",
    hero_text: "نص المقدمة",
    phone: "هاتف خدمة العملاء",
    whatsapp: "رابط واتساب https://wa.me/…",
    instagram: "رابط Instagram",
    about: "عن المتجر",
    shipping_policy: "سياسة الشحن",
    returns_policy: "سياسة الاستبدال والإرجاع",
    privacy_policy: "سياسة الخصوصية",
    terms: "الشروط والأحكام",
  };
  $("#admin-content").innerHTML =
    `<h2>هوية المتجر وسياساته</h2><form id="settings-form" class="admin-card"><div class="form-grid">${Object.entries(
      fields,
    )
      .map(([k, l]) =>
        k.includes("policy") || ["about", "terms", "hero_text"].includes(k)
          ? `<div class="span-2">${textarea(k, l, s[k])}</div>`
          : input(k, l, s[k]),
      )
      .join(
        "",
      )}</div>${checkbox("cod_enabled", "تفعيل طريقة الدفع عند الاستلام", s.cod_enabled)}${checkbox("orders_enabled", "السماح باستقبال الطلبات", s.orders_enabled)}<p class="notice">الطلبـات مُعطّلة افتراضياً. التشغيل يتطلب موافقة صاحب المتجر وضبط LAMSA_ALLOW_ORDERS=1 في الخادم، وتفعيل وجهات التوصيل والدفع لكل مدينة. لا تفعّلي هذه الخيارات قبل اعتماد التشغيل الفعلي.</p><button class="btn">حفظ الإعدادات</button></form>`;
  $("#settings-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const d = Object.fromEntries(new FormData(e.target));
      d.orders_enabled = e.target.elements.orders_enabled.checked;
      d.cod_enabled = e.target.elements.cod_enabled.checked;
      await call("settings", d, "PUT");
      toast("تم حفظ الإعدادات");
    } catch (err) {
      failure(err);
    }
  };
}
async function shipping() {
  const rows = await api("/api/admin/shipping");
  $("#admin-content").innerHTML =
    `<h2>وجهات التوصيل</h2><p class="notice">المدن المذكورة أمثلة عناوين فقط. تفعيل وجهة يعني تأكيدك توفر خدمة توصيل فعلية إليها. الرسوم بالشيكل.</p><div class="admin-card table-wrap"><table><thead><tr><th>المنطقة</th><th>المدينة</th><th>الرسوم ₪</th><th>التوصيل</th><th>عند الاستلام</th><th>حفظ</th></tr></thead><tbody>${rows.map((r) => `<tr data-region="${r.id}"><td><input class="control" data-f="region" value="${esc(r.region)}" aria-label="المنطقة"></td><td><input class="control" data-f="city" value="${esc(r.city)}" aria-label="المدينة"></td><td><input class="control" data-f="fee" type="number" min="0" step="0.01" value="${r.fee / 100}" aria-label="الرسوم"></td><td><input type="checkbox" data-f="enabled" ${r.enabled ? "checked" : ""} aria-label="تفعيل التوصيل إلى ${esc(r.city)}"></td><td><input type="checkbox" data-f="cod_enabled" ${r.cod_enabled ? "checked" : ""} aria-label="تفعيل الدفع عند الاستلام في ${esc(r.city)}"></td><td><button class="btn light small" data-save-region="${r.id}">حفظ</button></td></tr>`).join("")}</tbody></table></div><form id="add-region" class="admin-card"><h3>وجهة جديدة</h3><div class="form-grid">${input("region", "المنطقة", "", "text", 'required maxlength="100"')}${input("city", "المدينة", "", "text", 'required maxlength="100"')}${input("fee", "رسوم التوصيل بالشيكل", 0, "number", 'min="0" max="1000" step="0.01" required')}</div>${checkbox("enabled", "تفعيل التوصيل", false)}${checkbox("cod_enabled", "تفعيل الدفع عند الاستلام", false)}<button class="btn">إضافة الوجهة</button></form>`;
  $$("[data-save-region]").forEach(
    (b) =>
      (b.onclick = async () => {
        const row = b.closest("tr"),
          data = Object.fromEntries(
            $$("[data-f]", row).map((el) => [
              el.dataset.f,
              el.type === "checkbox"
                ? el.checked
                : el.dataset.f === "fee"
                  ? Math.round(Number(el.value) * 100)
                  : el.value,
            ]),
          );
        try {
          await call("shipping/" + b.dataset.saveRegion, data, "PUT");
          toast("تم حفظ الوجهة");
        } catch (e) {
          failure(e);
        }
      }),
  );
  $("#add-region").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.fee = Math.round(Number(data.fee) * 100);
    data.enabled = e.target.elements.enabled.checked;
    data.cod_enabled = e.target.elements.cod_enabled.checked;
    try {
      await call("shipping", data);
      toast("أُضيفت الوجهة");
      await shipping();
    } catch (err) {
      failure(err);
    }
  };
}
api("/api/admin/session")
  .then((s) => enter(s.csrf))
  .catch(() => {});
