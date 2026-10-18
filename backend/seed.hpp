#pragma once
#include "store.hpp"
inline void seed(Database &d) {
    require(d.query("SELECT id FROM products LIMIT 1").empty(),
            "Seeding refused: products already exist");
    Transaction tx(d);
    std::vector<std::string> categories = {"فساتين",      "بلايز",       "بناطيل",
                                           "تنانير",      "أطقم نسائية", "جاكيتات ومعاطف",
                                           "الإكسسوارات", "ملابس صيفية"};
    for (size_t i = 0; i < categories.size(); ++i)
        d.query("INSERT OR IGNORE INTO categories(id,name) VALUES(?,?)", {i + 1, categories[i]});
    std::vector<std::string> names = {
        "فستان رِقّة الكتان", "بلوزة ضوء الصباح",   "بنطال الخط الهادئ", "تنورة نسيم الورد",
        "طقم سكون",         "معطف خريف دافئ",     "حقيبة التفاصيل",    "قميص صيف ناعم",
        "فستان مساء العاج", "بلوزة أكمام منسدلة", "بنطال واسع أنيق",   "تنورة ثنيات",
        "طقم يوم جديد",     "جاكيت قصير",         "وشاح لمسة",         "بلوزة شاطئ",
        "فستان ورد الصباح", "قميص قطن كلاسيكي",   "بنطال كتان طبيعي",  "تنورة قصة مستقيمة",
        "طقم استراحة",      "معطف طويل",          "حقيبة قمر",         "تونيك صيفي"};
    std::vector<std::string> colors = {"بيج", "وردي", "أسود"};
    for (int i = 0; i < 24; ++i) {
        int price = (89 + (i * 17) % 210) * 100;
        d.query("INSERT INTO "
                "products(name,description,category_id,price,original_price,featured,is_new) "
                "VALUES(?,?,?,?,?,?,?)",
                {names[i] + " · عيّنة",
                 "منتج تجريبي لتجربة المتجر، وليس عرضاً للبيع. صورة توضيحية أصلية وليست صورة قطعة "
                 "حقيقية. تُضاف معلومات الخامة والعناية والقياسات الفعلية عند تجهيز المنتج.",
                 i % 8 + 1, price, i % 4 == 0 ? Json(price + 4500) : Json(nullptr), i % 3 == 0,
                 i >= 16});
        auto id = d.id();
        for (int k = 0; k < 2; ++k)
            d.query("INSERT INTO product_images(product_id,path,position) VALUES(?,?,?)",
                    {id,
                     "/assets/look-" + std::to_string(i % 8 + 1) + (k ? "-detail" : "") + ".svg",
                     k});
        for (auto size : {"S", "M", "L", "XL"})
            for (int c = 0; c < 3; ++c)
                d.query("INSERT INTO variants(product_id,sku,size,color,stock) VALUES(?,?,?,?,?)",
                        {id, "DEMO-" + std::to_string(i + 1) + "-" + size + "-" + std::to_string(c),
                         size, colors[c], i == 23 ? 0 : ((i + c) % 5 == 0 ? 0 : 8 + i % 7)});
    }
    for (auto city : {"رام الله", "نابلس", "الخليل", "بيت لحم", "جنين", "طولكرم", "قلقيلية",
                      "أريحا", "غزة", "القدس الشرقية", "مدينة أخرى"})
        d.query("INSERT OR IGNORE INTO shipping_regions(region,city,fee) VALUES(?,?,?)",
                {"فلسطين", city, 2500});
    for (auto city : {"حيفا", "الناصرة", "تل أبيب", "القدس", "عكا", "يافا", "مدينة أخرى"})
        d.query("INSERT OR IGNORE INTO shipping_regions(region,city,fee) VALUES(?,?,?)",
                {"إسرائيل", city, 3500});
    tx.commit();
}
