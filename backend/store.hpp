#pragma once
#include "database.hpp"
#include "security.hpp"
#include <regex>
#include <set>
struct ApiError : std::runtime_error {
    int status;
    ApiError(int code, const std::string &m) : runtime_error(m), status(code) {}
};
inline void require(bool ok, const std::string &message, int code = 400) {
    if (!ok)
        throw ApiError(code, message);
}
inline std::string text_field(const Json &j, const char *key, size_t lo = 0, size_t hi = 500) {
    require(j.contains(key) && j[key].is_string(), std::string("حقل نصي مطلوب: ") + key);
    auto s = j[key].get<std::string>();
    require(s.size() >= lo && s.size() <= hi && s.find('\0') == std::string::npos &&
                (lo == 0 || s.find_first_not_of(" \t\r\n") != std::string::npos),
            std::string("قيمة غير صالحة: ") + key);
    return s;
}
inline int integer(const Json &j, const char *key, int lo, int hi) {
    require(j.contains(key) && j[key].is_number_integer(),
            std::string("قيمة رقمية مطلوبة: ") + key);
    auto n = j[key].get<int64_t>();
    require(n >= lo && n <= hi, std::string("قيمة خارج النطاق: ") + key);
    return int(n);
}
inline bool flag(const Json &j, const char *key) {
    require(j.contains(key) && j[key].is_boolean(), std::string("قيمة منطقية مطلوبة: ") + key);
    return j[key].get<bool>();
}
inline Json settings(Database &d) {
    return Json::parse(
        d.query("SELECT value FROM settings WHERE id=1")[0]["value"].get<std::string>());
}
inline Json product(Database &d, int id, bool admin = false) {
    auto a = d.query("SELECT p.*,c.name category FROM products p JOIN categories c ON "
                     "c.id=p.category_id WHERE p.id=?" +
                         std::string(admin ? "" : " AND p.active=1"),
                     {id});
    require(!a.empty(), "المنتج غير موجود", 404);
    auto p = a[0];
    p["images"] =
        d.query("SELECT path FROM product_images WHERE product_id=? ORDER BY position,id", {id});
    p["variants"] = d.query("SELECT * FROM variants WHERE product_id=?" +
                                std::string(admin ? "" : " AND active=1") + " ORDER BY id",
                            {id});
    return p;
}
inline bool image_path(const std::string &p) {
    return std::regex_match(p, std::regex("/assets/[a-zA-Z0-9_-]+\\.svg")) ||
           std::regex_match(p, std::regex("/uploads/[a-f0-9]{32}\\.png"));
}
inline int save_product(Database &d, const Json &j, int id = 0) {
    auto name = text_field(j, "name", 2, 200), desc = text_field(j, "description", 2, 6000);
    int cat = integer(j, "category_id", 1, 100000), price = integer(j, "price", 1, 10000000);
    bool featured = flag(j, "featured"), isnew = flag(j, "is_new"), active = flag(j, "active");
    require(!d.query("SELECT id FROM categories WHERE id=?", {cat}).empty(), "الفئة غير موجودة");
    Json original = nullptr;
    if (j.contains("original_price") && !j["original_price"].is_null())
        original = integer(j, "original_price", price, 10000000);
    require(j.contains("images") && j["images"].is_array() && j["images"].size() <= 8,
            "صور غير صالحة");
    for (auto &i : j["images"]) {
        require(i.is_string() && image_path(i.get<std::string>()), "مسار الصورة غير صالح");
    }
    require(j.contains("variants") && j["variants"].is_array() && !j["variants"].empty() &&
                j["variants"].size() <= 100,
            "خيارات المنتج مطلوبة");
    Transaction tx(d);
    if (id) {
        product(d, id, true);
        d.query("UPDATE products SET "
                "name=?,description=?,category_id=?,price=?,original_price=?,featured=?,is_new=?,"
                "active=? WHERE id=?",
                {name, desc, cat, price, original, featured, isnew, active, id});
    } else {
        d.query("INSERT INTO "
                "products(name,description,category_id,price,original_price,featured,is_new,active)"
                " VALUES(?,?,?,?,?,?,?,?)",
                {name, desc, cat, price, original, featured, isnew, active});
        id = int(d.id());
    }
    d.query("DELETE FROM product_images WHERE product_id=?", {id});
    int pos = 0;
    for (auto &i : j["images"])
        d.query("INSERT INTO product_images(product_id,path,position) VALUES(?,?,?)",
                {id, i, pos++});
    d.query("UPDATE variants SET active=0 WHERE product_id=?", {id});
    std::set<std::string> keys;
    for (auto &v : j["variants"]) {
        auto size = text_field(v, "size", 1, 20), color = text_field(v, "color", 1, 80),
             sku = text_field(v, "sku", 1, 80);
        int stock = integer(v, "stock", 0, 1000000);
        require(keys.insert(size + "|" + color).second, "خيار مكرر");
        auto old = d.query("SELECT id FROM variants WHERE product_id=? AND size=? AND color=?",
                           {id, size, color});
        if (old.empty())
            d.query("INSERT INTO variants(product_id,sku,size,color,stock) VALUES(?,?,?,?,?)",
                    {id, sku, size, color, stock});
        else
            d.query("UPDATE variants SET sku=?,stock=?,active=1 WHERE id=?",
                    {sku, stock, old[0]["id"]});
    }
    tx.commit();
    return id;
}
// All amounts use integer agorot. Payments are provider-separated; no card data is accepted.
struct PaymentProvider {
    virtual ~PaymentProvider() = default;
    virtual bool eligible(const Json &s, const Json &r) const = 0;
    virtual std::string name() const = 0;
};
struct CashOnDelivery : PaymentProvider {
    bool eligible(const Json &s, const Json &r) const override {
        return s.value("cod_enabled", false) && r["cod_enabled"] == 1;
    }
    std::string name() const override {
        return "cod";
    }
};
inline Json quote(Database &d, const Json &j, bool checkout = false) {
    require(j.contains("items") && j["items"].is_array() && !j["items"].empty() &&
                j["items"].size() <= 50,
            "السلة فارغة أو كبيرة جداً");
    Json result = {
        {"items", Json::array()}, {"subtotal", 0}, {"shipping_fee", nullptr}, {"total", nullptr}};
    int64_t subtotal = 0;
    std::set<int> seen;
    for (auto &i : j["items"]) {
        int vid = integer(i, "variant_id", 1, 2000000000), qty = integer(i, "quantity", 1, 20);
        require(seen.insert(vid).second, "خيار مكرر في السلة");
        auto a = d.query("SELECT v.*,p.name,p.price FROM variants v JOIN products p ON "
                         "p.id=v.product_id WHERE v.id=? AND v.active=1 AND p.active=1",
                         {vid});
        require(!a.empty(), "خيار المنتج غير متاح", 409);
        auto v = a[0];
        require(v["stock"].get<int>() >= qty, "الكمية المطلوبة غير متوفرة", 409);
        int line = v["price"].get<int>() * qty;
        subtotal += line;
        result["items"].push_back({{"variant_id", vid},
                                   {"product_id", v["product_id"]},
                                   {"name", v["name"]},
                                   {"size", v["size"]},
                                   {"color", v["color"]},
                                   {"sku", v["sku"]},
                                   {"quantity", qty},
                                   {"unit_price", v["price"]},
                                   {"line_total", line}});
    }
    result["subtotal"] = subtotal;
    if (j.contains("shipping_region_id") && !j["shipping_region_id"].is_null()) {
        int rid = integer(j, "shipping_region_id", 1, 2000000000);
        auto regions = d.query("SELECT * FROM shipping_regions WHERE id=? AND enabled=1", {rid});
        require(!regions.empty(), "التوصيل غير متاح إلى هذه الوجهة", 409);
        auto r = regions[0];
        if (checkout) {
            CashOnDelivery cod;
            require(cod.eligible(settings(d), r), "الدفع عند الاستلام غير متاح لهذه الوجهة", 409);
        }
        result["shipping_fee"] = r["fee"];
        result["total"] = subtotal + r["fee"].get<int64_t>();
        result["destination"] = r;
    } else
        require(!checkout, "اختاري وجهة التوصيل");
    return result;
}
inline Json create_order(Database &d, const Json &j) {
    auto key = text_field(j, "idempotency_key", 16, 100);
    require(std::regex_match(key, std::regex("[a-zA-Z0-9_-]+")), "معرف طلب غير صالح");
    auto encoded = j.dump();
    unsigned char digest[32];
    unsigned int len;
    EVP_Digest(encoded.data(), encoded.size(), digest, &len, EVP_sha256(), nullptr);
    std::string hash;
    const char *hex = "0123456789abcdef";
    for (unsigned int i = 0; i < len; ++i) {
        hash += hex[digest[i] >> 4];
        hash += hex[digest[i] & 15];
    }
    Transaction tx(d);
    auto previous =
        d.query("SELECT number,total,request_hash FROM orders WHERE idempotency_key=?", {key});
    if (!previous.empty()) {
        require(constant_equal(previous[0]["request_hash"].get<std::string>(), hash),
                "معرف الطلب مستخدم لطلب مختلف", 409);
        tx.commit();
        return {{"number", previous[0]["number"]}, {"total", previous[0]["total"]}};
    }
    require(getenv_or("LAMSA_ALLOW_ORDERS") == "1" && settings(d).value("orders_enabled", false),
            "استقبال الطلبات متوقف حالياً؛ المتجر تجريبي", 409);
    require(j.value("payment_method", "") == "cod", "طريقة الدفع غير مدعومة");
    require(j.contains("customer") && j["customer"].is_object(), "بيانات العميل مطلوبة");
    auto c = j["customer"];
    for (auto it = c.begin(); it != c.end();) {
        static const std::set<std::string> allowed = {
            "name",         "phone",  "email",    "region",  "city",
            "neighborhood", "street", "building", "details", "notes"};
        if (!allowed.count(it.key()))
            it = c.erase(it);
        else
            ++it;
    }
    text_field(c, "name", 3, 200);
    auto phone = text_field(c, "phone", 7, 30);
    require(std::regex_match(phone, std::regex("\\+?[0-9 ()-]{7,25}")), "رقم الهاتف غير صالح");
    std::string digits;
    for (char ch : phone)
        if (ch >= '0' && ch <= '9')
            digits += ch;
    require(digits.size() >= 9 && digits.size() <= 15, "رقم الهاتف غير صالح");
    auto email = text_field(c, "email", 0, 254);
    require(email.empty() || std::regex_match(email, std::regex("[^ @]+@[^ @]+\\.[^ @]+")),
            "البريد الإلكتروني غير صالح");
    for (auto k : {"region", "city", "neighborhood", "street"})
        text_field(c, k, 1, 200);
    text_field(c, "building", 1, 40);
    text_field(c, "details", 0, 1000);
    text_field(c, "notes", 0, 2000);
    auto q = quote(d, j, true);
    require(c["region"] == q["destination"]["region"] && c["city"] == q["destination"]["city"],
            "الوجهة لا تطابق العنوان المختار");
    std::string number = "LAM-" + random_hex(8);
    d.query("INSERT INTO "
            "orders(number,idempotency_key,request_hash,customer,shipping_region_id,subtotal,"
            "shipping_fee,total,payment_method) VALUES(?,?,?,?,?,?,?,?,?)",
            {number, key, hash, c.dump(), j["shipping_region_id"], q["subtotal"], q["shipping_fee"],
             q["total"], "cod"});
    auto oid = d.id();
    for (auto &i : q["items"]) {
        d.query("UPDATE variants SET stock=stock-? WHERE id=? AND stock>=?",
                {i["quantity"], i["variant_id"], i["quantity"]});
        require(sqlite3_changes(d.p) == 1, "تغير المخزون، يرجى إعادة المحاولة", 409);
        d.query(
            "INSERT INTO order_items(order_id,variant_id,name,size,color,sku,quantity,unit_price) "
            "VALUES(?,?,?,?,?,?,?,?)",
            {oid, i["variant_id"], i["name"], i["size"], i["color"], i["sku"], i["quantity"],
             i["unit_price"]});
    }
    tx.commit();
    return {{"number", number},
            {"subtotal", q["subtotal"]},
            {"shipping_fee", q["shipping_fee"]},
            {"total", q["total"]},
            {"payment_method", "cod"}};
}
inline void order_status(Database &d, int id, const std::string &status) {
    Transaction tx(d);
    auto a = d.query("SELECT status FROM orders WHERE id=?", {id});
    require(!a.empty(), "الطلب غير موجود", 404);
    std::string from = a[0]["status"];
    if (from == status) {
        tx.commit();
        return;
    }
    bool allowed = (from == "new" && (status == "preparing" || status == "cancelled")) ||
                   (from == "preparing" && (status == "shipped" || status == "cancelled")) ||
                   (from == "shipped" && status == "delivered");
    require(allowed, "انتقال حالة غير مسموح؛ الطلب المشحون يحتاج معالجة إرجاع منفصلة", 409);
    if (status == "cancelled") {
        for (auto &i :
             d.query("SELECT variant_id,quantity FROM order_items WHERE order_id=?", {id}))
            d.query("UPDATE variants SET stock=stock+? WHERE id=?",
                    {i["quantity"], i["variant_id"]});
    }
    d.query("UPDATE orders SET status=? WHERE id=?", {status, id});
    tx.commit();
}
