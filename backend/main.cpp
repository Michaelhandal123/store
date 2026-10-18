#include "seed.hpp"
#include "store.hpp"
#include <chrono>
#include <filesystem>
#include <httplib.h>
#include <iostream>
#include <map>
#include <mutex>
namespace fs = std::filesystem;
using Clock = std::chrono::steady_clock;
std::string normalize_image(const std::string &);
struct Session {
    std::string csrf;
    Clock::time_point expires;
};
struct Limit {
    int count = 0;
    Clock::time_point since = Clock::now();
};
int main(int argc, char **argv) {
    try {
        fs::current_path(getenv_or("LAMSA_ROOT", "."));
        std::string path = getenv_or("LAMSA_DB", "data/store.sqlite");
        if (fs::path(path).has_parent_path())
            fs::create_directories(fs::path(path).parent_path());
        Database db(path);
        db.exec(read_file("database/migrations/001_initial.sql"));
        if (argc > 1) {
            std::string cmd = argv[1];
            if (cmd == "--init") {
                std::cout << "Database initialized\n";
                return 0;
            }
            if (cmd == "--seed") {
                seed(db);
                std::cout << "24 demonstration products inserted. All delivery regions disabled.\n";
                return 0;
            }
            if (cmd == "--create-admin") {
                auto username = getenv_or("LAMSA_ADMIN_USER", "admin"),
                     password = getenv_or("LAMSA_ADMIN_PASSWORD");
                require(username.size() >= 3 && username.size() <= 80 && password.size() >= 14 &&
                            password.size() <= 200,
                        "Set LAMSA_ADMIN_USER and LAMSA_ADMIN_PASSWORD (14-200 characters). No "
                        "default password.");
                auto salt = random_hex();
                db.query("INSERT INTO administrators(username,salt,password_hash) VALUES(?,?,?) ON "
                         "CONFLICT(username) DO UPDATE SET "
                         "salt=excluded.salt,password_hash=excluded.password_hash",
                         {username, salt, password_hash(password, salt)});
                std::cout << "Administrator created/updated. Restart server to revoke existing "
                             "sessions.\n";
                return 0;
            }
            throw std::runtime_error("Unknown command");
        }
        int port = std::stoi(getenv_or("LAMSA_PORT", "8080"));
        std::string host = getenv_or("LAMSA_HOST", "127.0.0.1"),
                    origin = getenv_or("LAMSA_ORIGIN", "http://localhost:" + std::to_string(port));
        bool secure = getenv_or("LAMSA_SECURE_COOKIE", "0") == "1";
        fs::create_directories("data/uploads");
        std::mutex mutex;
        std::map<std::string, Session> sessions;
        std::map<std::string, Limit> limits;
        httplib::Server server;
        server.new_task_queue = []() { return new httplib::ThreadPool(4); };
        server.set_payload_max_length(5 * 1024 * 1024);
        server.set_read_timeout(10, 0);
        server.set_write_timeout(10, 0);
        server.set_keep_alive_max_count(50);
        auto json = [](httplib::Response &r, const Json &j, int status = 200) {
            r.status = status;
            r.set_content(j.dump(), "application/json; charset=utf-8");
        };
        auto body = [](const httplib::Request &r) {
            require(r.get_header_value("Content-Type").find("application/json") == 0,
                    "يلزم إرسال JSON", 415);
            auto j = Json::parse(r.body);
            require(j.is_object(), "صيغة الطلب غير صالحة");
            return j;
        };
        auto sid = [](const httplib::Request &r) {
            std::string cookies = r.get_header_value("Cookie");
            std::smatch m;
            if (std::regex_search(cookies, m,
                                  std::regex("(?:^|; *)lamsa_session=([a-f0-9]{64})(?:;|$)")))
                return m[1].str();
            return std::string();
        };
        auto auth = [&](const httplib::Request &r) {
            auto i = sessions.find(sid(r));
            require(i != sessions.end() && i->second.expires > Clock::now(), "يرجى تسجيل الدخول",
                    401);
            if (r.method != "GET")
                require(constant_equal(i->second.csrf, r.get_header_value("X-CSRF-Token")),
                        "رمز الحماية غير صالح", 403);
            return i->second.csrf;
        };
        auto rate = [&](const std::string &key, int max) {
            auto now = Clock::now();
            for (auto i = limits.begin(); i != limits.end();)
                if (now - i->second.since > std::chrono::minutes(10))
                    i = limits.erase(i);
                else
                    ++i;
            require(limits.size() < 10000 || limits.count(key), "حاولي لاحقاً", 429);
            auto &l = limits[key];
            if (now - l.since > std::chrono::minutes(1)) {
                l.count = 0;
                l.since = now;
            }
            require(++l.count <= max, "محاولات كثيرة، حاولي بعد دقيقة", 429);
        };
        using Handler = std::function<void(const httplib::Request &, httplib::Response &)>;
        auto wrap = [&](Handler handler, bool admin = false) {
            return [&, handler, admin](const httplib::Request &r, httplib::Response &res) {
                std::lock_guard<std::mutex> lock(mutex);
                try {
                    if (r.method != "GET") {
                        auto o = r.get_header_value("Origin");
                        require(o.empty() || o == origin, "مصدر الطلب غير مسموح", 403);
                    }
                    if (admin) {
                        auth(r);
                    }
                    handler(r, res);
                } catch (const ApiError &e) {
                    json(res, {{"error", e.what()}}, e.status);
                } catch (const Json::exception &) {
                    json(res, {{"error", "صيغة البيانات غير صالحة"}}, 400);
                } catch (const std::invalid_argument &) {
                    json(res, {{"error", "قيمة غير صالحة"}}, 400);
                } catch (const std::exception &) {
                    json(res, {{"error", "تعذر إكمال العملية؛ راجعي البيانات أو حاولي لاحقاً"}},
                         500);
                }
            };
        };
        server.set_post_routing_handler([](const httplib::Request &req, httplib::Response &res) {
            res.set_header("X-Content-Type-Options", "nosniff");
            res.set_header("Referrer-Policy", "same-origin");
            res.set_header("X-Frame-Options", "DENY");
            res.set_header(
                "Content-Security-Policy",
                "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
                "connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
            res.set_header("Cache-Control",
                           req.path.find("/assets/") == 0 ? "public, max-age=86400" : "no-store");
        });
        server.set_error_handler([&](const httplib::Request &, httplib::Response &res) {
            if (res.body.empty())
                json(res, {{"error", "الصفحة أو المسار غير موجود"}}, res.status);
        });
        server.Get("/api/health", wrap([&](const httplib::Request &, httplib::Response &res) {
                       json(res, {{"status", "ok"},
                                  {"database",
                                   db.query("SELECT version FROM schema_version")[0]["version"]}});
                   }));
        server.Get("/api/settings", wrap([&](const httplib::Request &, httplib::Response &res) {
                       auto s = settings(db);
                       s["orders_enabled"] = s.value("orders_enabled", false) &&
                                             getenv_or("LAMSA_ALLOW_ORDERS") == "1";
                       json(res, s);
                   }));
        server.Get(
            "/api/merchandising", wrap([&](const httplib::Request &, httplib::Response &res) {
                bool has_sales =
                    !db.query("SELECT 1 FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN "
                              "variants v ON v.id=oi.variant_id JOIN products p ON "
                              "p.id=v.product_id WHERE o.status='delivered' AND p.active=1 LIMIT 1")
                         .empty();
                json(res, {{"bestsellers_available", has_sales}});
            }));
        server.Get("/api/categories", wrap([&](const httplib::Request &, httplib::Response &res) {
                       json(res, db.query("SELECT * FROM categories ORDER BY id"));
                   }));
        server.Get("/api/options", wrap([&](const httplib::Request &, httplib::Response &res) {
                       Json result;
                       for (auto key : {"size", "color"}) {
                           result[key] = Json::array();
                           for (auto &r : db.query(
                                    std::string("SELECT DISTINCT v.") + key +
                                    " value FROM variants v JOIN products p ON p.id=v.product_id "
                                    "WHERE v.active=1 AND p.active=1 ORDER BY value"))
                               result[key].push_back(r["value"]);
                       }
                       json(res, result);
                   }));
        server.Get(
            "/api/shipping", wrap([&](const httplib::Request &, httplib::Response &res) {
                json(res,
                     db.query(
                         "SELECT * FROM shipping_regions WHERE enabled=1 ORDER BY region,city"));
            }));
        server.Get(
            "/api/products", wrap([&](const httplib::Request &r, httplib::Response &res) {
                std::string sql =
                    " FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1";
                Json args = Json::array();
                auto add = [&](const std::string &clause, const Json &value) {
                    sql += clause;
                    args.push_back(value);
                };
                auto param = [&](const char *k) { return r.get_param_value(k); };
                auto numeric = [&](const char *k, int lo, int hi) {
                    auto s = param(k);
                    require(s.size() < 12 && std::regex_match(s, std::regex("[0-9]+")),
                            "مرشح رقمي غير صالح");
                    long long n = std::stoll(s);
                    require(n >= lo && n <= hi, "مرشح خارج النطاق");
                    return int(n);
                };
                if (r.has_param("q")) {
                    auto q = param("q");
                    require(q.size() <= 200, "بحث طويل جداً");
                    add(" AND (instr(p.name,?)>0 OR instr(p.description,?)>0)", q);
                    args.push_back(q);
                }
                if (r.has_param("category"))
                    add(" AND p.category_id=?", numeric("category", 1, 100000));
                if (r.has_param("min"))
                    add(" AND p.price>=?", numeric("min", 0, 10000000));
                if (r.has_param("max"))
                    add(" AND p.price<=?", numeric("max", 0, 10000000));
                for (auto pair : {std::make_pair("new", " AND p.is_new=1"),
                                  {"featured", " AND p.featured=1"},
                                  {"sale", " AND p.original_price>p.price"}})
                    if (param(pair.first) == "1")
                        sql += pair.second;
                if (param("bestsellers") == "1")
                    sql += " AND EXISTS(SELECT 1 FROM order_items oi JOIN orders o ON "
                           "o.id=oi.order_id JOIN variants bv ON bv.id=oi.variant_id WHERE "
                           "bv.product_id=p.id AND o.status='delivered')";
                std::string v =
                    " AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.active=1";
                bool filter = false;
                if (r.has_param("size")) {
                    v += " AND v.size=?";
                    args.push_back(param("size"));
                    filter = true;
                }
                if (r.has_param("color")) {
                    v += " AND v.color=?";
                    args.push_back(param("color"));
                    filter = true;
                }
                if (param("available") == "1") {
                    v += " AND v.stock>0";
                    filter = true;
                }
                if (filter)
                    sql += v + ")";
                int total = db.query("SELECT COUNT(*) n" + sql, args)[0]["n"],
                    page = r.has_param("page") ? numeric("page", 1, 100000) : 1,
                    limit = r.has_param("limit") ? numeric("limit", 1, 48) : 12;
                std::map<std::string, std::string> sorts = {
                    {"price_asc", "p.price ASC,p.id"},
                    {"price_desc", "p.price DESC,p.id"},
                    {"newest", "p.id DESC"},
                    {"name", "p.name COLLATE BINARY,p.id"},
                    {"featured", "p.featured DESC,p.id DESC"},
                    {"bestsellers",
                     "COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON "
                     "o.id=oi.order_id JOIN variants bv ON bv.id=oi.variant_id WHERE "
                     "bv.product_id=p.id AND o.status='delivered'),0) DESC,p.id DESC"}};
                auto sort = param("sort");
                if (sort.empty())
                    sort = "featured";
                require(sorts.count(sort), "ترتيب غير صالح");
                args.push_back(limit);
                args.push_back((page - 1) * limit);
                auto rows = db.query(
                    "SELECT p.id" + sql + " ORDER BY " + sorts[sort] + " LIMIT ? OFFSET ?", args);
                Json items = Json::array();
                for (auto &row : rows)
                    items.push_back(product(db, row["id"]));
                json(res, {{"items", items}, {"total", total}, {"page", page}, {"limit", limit}});
            }));
        server.Get(R"(/api/products/(\d+))",
                   wrap([&](const httplib::Request &r, httplib::Response &res) {
                       json(res, product(db, std::stoi(r.matches[1])));
                   }));
        server.Post("/api/cart/quote", wrap([&](const httplib::Request &r, httplib::Response &res) {
                        rate("quote:" + r.remote_addr, 120);
                        json(res, quote(db, body(r)));
                    }));
        server.Post("/api/orders", wrap([&](const httplib::Request &r, httplib::Response &res) {
                        rate("order:" + r.remote_addr,
                             std::stoi(getenv_or("LAMSA_ORDER_LIMIT", "10")));
                        json(res, create_order(db, body(r)), 201);
                    }));
        server.Post(
            "/api/admin/login", wrap([&](const httplib::Request &r, httplib::Response &res) {
                rate("login:" + r.remote_addr, 5);
                auto j = body(r);
                auto username = text_field(j, "username", 1, 80),
                     password = text_field(j, "password", 1, 200);
                auto a = db.query("SELECT * FROM administrators WHERE username=?", {username});
                std::string salt =
                    a.empty() ? "nonexistent-user-timing-salt" : a[0]["salt"].get<std::string>();
                auto hash = password_hash(password, salt);
                require(!a.empty() && constant_equal(hash, a[0]["password_hash"]),
                        "اسم المستخدم أو كلمة المرور غير صحيحة", 401);
                auto now = Clock::now();
                for (auto i = sessions.begin(); i != sessions.end();)
                    if (i->second.expires < now)
                        i = sessions.erase(i);
                    else
                        ++i;
                require(sessions.size() < 1000, "جلسات كثيرة", 429);
                auto token = random_hex(), csrf = random_hex();
                sessions[token] = {csrf, now + std::chrono::hours(8)};
                res.set_header("Set-Cookie",
                               "lamsa_session=" + token +
                                   "; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800" +
                                   (secure ? "; Secure" : ""));
                json(res, {{"csrf", csrf}});
            }));
        server.Get("/api/admin/session",
                   wrap([&](const httplib::Request &r,
                            httplib::Response &res) { json(res, {{"csrf", auth(r)}}); },
                        true));
        server.Post(
            "/api/admin/logout",
            wrap(
                [&](const httplib::Request &r, httplib::Response &res) {
                    sessions.erase(sid(r));
                    res.set_header(
                        "Set-Cookie",
                        "lamsa_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0" +
                            (secure ? std::string("; Secure") : ""));
                    json(res, {{"ok", true}});
                },
                true));
        server.Get(
            "/api/admin/overview",
            wrap(
                [&](const httplib::Request &, httplib::Response &res) {
                    json(res,
                         {{"orders", db.query("SELECT COUNT(*) total,COALESCE(SUM(status='new'),0) "
                                              "pending,COALESCE(SUM(status='delivered'),0) "
                                              "completed,COALESCE(SUM(CASE WHEN status='delivered' "
                                              "THEN total ELSE 0 END),0) sales FROM orders")[0]},
                          {"products", db.query("SELECT COUNT(*) total FROM products")[0]["total"]},
                          {"low_stock",
                           db.query("SELECT v.id,p.name,v.size,v.color,v.stock FROM variants v "
                                    "JOIN products p ON p.id=v.product_id WHERE v.active=1 AND "
                                    "p.active=1 AND v.stock<5 ORDER BY v.stock LIMIT 100")}});
                },
                true));
        server.Get("/api/admin/products",
                   wrap(
                       [&](const httplib::Request &, httplib::Response &res) {
                           json(res,
                                db.query("SELECT p.*,c.name category FROM products p JOIN "
                                         "categories c ON c.id=p.category_id ORDER BY p.id DESC"));
                       },
                       true));
        server.Get(R"(/api/admin/products/(\d+))",
                   wrap(
                       [&](const httplib::Request &r, httplib::Response &res) {
                           json(res, product(db, std::stoi(r.matches[1]), true));
                       },
                       true));
        server.Post("/api/admin/products",
                    wrap(
                        [&](const httplib::Request &r, httplib::Response &res) {
                            int id = save_product(db, body(r));
                            json(res, product(db, id, true), 201);
                        },
                        true));
        server.Put(R"(/api/admin/products/(\d+))",
                   wrap(
                       [&](const httplib::Request &r, httplib::Response &res) {
                           int id = save_product(db, body(r), std::stoi(r.matches[1]));
                           json(res, product(db, id, true));
                       },
                       true));
        server.Delete(R"(/api/admin/products/(\d+))",
                      wrap(
                          [&](const httplib::Request &r, httplib::Response &res) {
                              int id = std::stoi(r.matches[1]);
                              product(db, id, true);
                              db.query("UPDATE products SET active=0 WHERE id=?", {id});
                              json(res, {{"ok", true}});
                          },
                          true));
        server.Post("/api/admin/categories",
                    wrap(
                        [&](const httplib::Request &r, httplib::Response &res) {
                            db.query("INSERT INTO categories(name) VALUES(?)",
                                     {text_field(body(r), "name", 2, 100)});
                            json(res, {{"id", db.id()}}, 201);
                        },
                        true));
        server.Get("/api/admin/orders",
                   wrap(
                       [&](const httplib::Request &, httplib::Response &res) {
                           json(res, db.query("SELECT id,number,total,status,created_at FROM "
                                              "orders ORDER BY id DESC LIMIT 500"));
                       },
                       true));
        server.Get(R"(/api/admin/orders/(\d+))",
                   wrap(
                       [&](const httplib::Request &r, httplib::Response &res) {
                           int id = std::stoi(r.matches[1]);
                           auto rows = db.query("SELECT * FROM orders WHERE id=?", {id});
                           require(!rows.empty(), "الطلب غير موجود", 404);
                           auto order = rows[0];
                           order.erase("request_hash");
                           order.erase("idempotency_key");
                           order["customer"] = Json::parse(order["customer"].get<std::string>());
                           order["items"] =
                               db.query("SELECT * FROM order_items WHERE order_id=?", {id});
                           json(res, order);
                       },
                       true));
        server.Put(R"(/api/admin/orders/(\d+)/status)",
                   wrap(
                       [&](const httplib::Request &r, httplib::Response &res) {
                           order_status(db, std::stoi(r.matches[1]),
                                        text_field(body(r), "status", 1, 30));
                           json(res, {{"ok", true}});
                       },
                       true));
        server.Get(
            "/api/admin/settings",
            wrap([&](const httplib::Request &, httplib::Response &res) { json(res, settings(db)); },
                 true));
        server.Put(
            "/api/admin/settings",
            wrap(
                [&](const httplib::Request &r, httplib::Response &res) {
                    auto j = body(r);
                    Json s;
                    for (auto key :
                         {"name", "tagline", "hero_text", "phone", "whatsapp", "instagram", "about",
                          "shipping_policy", "returns_policy", "privacy_policy", "terms"})
                        s[key] = text_field(j, key, 0, 6000);
                    require(!s["name"].get<std::string>().empty(), "اسم المتجر مطلوب");
                    for (auto key : {"whatsapp", "instagram"}) {
                        auto u = s[key].get<std::string>();
                        require(
                            u.empty() ||
                                std::regex_match(
                                    u,
                                    std::regex(
                                        key == std::string("whatsapp")
                                            ? "https://wa\\.me/[0-9]+"
                                            : "https://(www\\.)?instagram\\.com/[A-Za-z0-9_.]+/?")),
                            "رابط التواصل غير صالح");
                    }
                    s["orders_enabled"] = flag(j, "orders_enabled");
                    s["cod_enabled"] = flag(j, "cod_enabled");
                    require(!s["orders_enabled"].get<bool>() ||
                                getenv_or("LAMSA_ALLOW_ORDERS") == "1",
                            "تشغيل الطلبات يحتاج أيضاً LAMSA_ALLOW_ORDERS=1 بعد موافقة صاحب المتجر",
                            409);
                    db.query("UPDATE settings SET value=? WHERE id=1", {s.dump()});
                    json(res, s);
                },
                true));
        server.Get("/api/admin/shipping",
                   wrap(
                       [&](const httplib::Request &, httplib::Response &res) {
                           json(res, db.query("SELECT * FROM shipping_regions ORDER BY id"));
                       },
                       true));
        server.Post("/api/admin/shipping",
                    wrap(
                        [&](const httplib::Request &r, httplib::Response &res) {
                            auto j = body(r);
                            db.query(
                                "INSERT INTO shipping_regions(region,city,enabled,cod_enabled,fee) "
                                "VALUES(?,?,?,?,?)",
                                {text_field(j, "region", 1, 200), text_field(j, "city", 1, 200),
                                 flag(j, "enabled"), flag(j, "cod_enabled"),
                                 integer(j, "fee", 0, 100000)});
                            json(res, {{"id", db.id()}}, 201);
                        },
                        true));
        server.Put(
            R"(/api/admin/shipping/(\d+))",
            wrap(
                [&](const httplib::Request &r, httplib::Response &res) {
                    int id = std::stoi(r.matches[1]);
                    require(!db.query("SELECT id FROM shipping_regions WHERE id=?", {id}).empty(),
                            "الوجهة غير موجودة", 404);
                    auto j = body(r);
                    db.query("UPDATE shipping_regions SET "
                             "region=?,city=?,enabled=?,cod_enabled=?,fee=? WHERE id=?",
                             {text_field(j, "region", 1, 200), text_field(j, "city", 1, 200),
                              flag(j, "enabled"), flag(j, "cod_enabled"),
                              integer(j, "fee", 0, 100000), id});
                    json(res, {{"ok", true}});
                },
                true));
        server.Post("/api/admin/images",
                    wrap(
                        [&](const httplib::Request &r, httplib::Response &res) {
                            require(r.get_header_value("Content-Type") == "image/png" ||
                                        r.get_header_value("Content-Type") == "image/jpeg",
                                    "تُقبل صور PNG و JPEG فقط", 415);
                            std::string normalized;
                            try {
                                normalized = normalize_image(r.body);
                            } catch (...) {
                                throw ApiError(
                                    400,
                                    "الصورة تالفة أو أبعادها كبيرة؛ الحد 4096 بكسل و12 مليون بكسل");
                            }
                            std::string name = random_hex(16) + ".png";
                            std::ofstream f("data/uploads/" + name, std::ios::binary);
                            f.write(normalized.data(), normalized.size());
                            require(bool(f), "تعذر حفظ الصورة", 500);
                            json(res, {{"path", "/uploads/" + name}}, 201);
                        },
                        true));
        server.set_mount_point("/uploads", "data/uploads");
        server.set_mount_point("/", "frontend");
        std::cout << "LAMSA: " << origin << " (bound to " << host << ":" << port << ")\n"
                  << std::flush;
        return server.listen(host, port) ? 0 : 1;
    } catch (const std::exception &e) {
        std::cerr << "Startup failed: " << e.what() << "\n";
        return 1;
    }
}
