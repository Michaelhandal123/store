#pragma once
#include <fstream>
#include <json.hpp>
#include <sqlite3.h>
#include <sstream>
#include <stdexcept>
using Json = nlohmann::json;
struct Statement {
    sqlite3_stmt *p = nullptr;
    Statement(sqlite3 *db, const std::string &sql) {
        if (sqlite3_prepare_v2(db, sql.c_str(), -1, &p, nullptr) != SQLITE_OK)
            throw std::runtime_error(sqlite3_errmsg(db));
    }
    ~Statement() {
        sqlite3_finalize(p);
    }
    Statement(const Statement &) = delete;
    void bind(int i, const Json &v) {
        int rc;
        if (v.is_null())
            rc = sqlite3_bind_null(p, i);
        else if (v.is_boolean())
            rc = sqlite3_bind_int(p, i, v.get<bool>());
        else if (v.is_number_integer())
            rc = sqlite3_bind_int64(p, i, v.get<int64_t>());
        else if (v.is_number())
            rc = sqlite3_bind_double(p, i, v.get<double>());
        else {
            auto s = v.get<std::string>();
            rc = sqlite3_bind_text(p, i, s.c_str(), int(s.size()), SQLITE_TRANSIENT);
        }
        if (rc != SQLITE_OK)
            throw std::runtime_error("bind failure");
    }
    Json rows() {
        Json a = Json::array();
        int rc;
        while ((rc = sqlite3_step(p)) == SQLITE_ROW) {
            Json r = Json::object();
            for (int i = 0; i < sqlite3_column_count(p); ++i) {
                std::string k = sqlite3_column_name(p, i);
                int t = sqlite3_column_type(p, i);
                if (t == SQLITE_NULL)
                    r[k] = nullptr;
                else if (t == SQLITE_INTEGER)
                    r[k] = sqlite3_column_int64(p, i);
                else if (t == SQLITE_FLOAT)
                    r[k] = sqlite3_column_double(p, i);
                else
                    r[k] = reinterpret_cast<const char *>(sqlite3_column_text(p, i));
            }
            a.push_back(r);
        }
        if (rc != SQLITE_DONE)
            throw std::runtime_error(sqlite3_errmsg(sqlite3_db_handle(p)));
        return a;
    }
};
struct Database {
    sqlite3 *p = nullptr;
    explicit Database(const std::string &path) {
        if (sqlite3_open(path.c_str(), &p) != SQLITE_OK)
            throw std::runtime_error("Cannot open database");
        sqlite3_busy_timeout(p, 5000);
        exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;");
    }
    ~Database() {
        sqlite3_close(p);
    }
    void exec(const std::string &sql) {
        char *err = nullptr;
        if (sqlite3_exec(p, sql.c_str(), nullptr, nullptr, &err) != SQLITE_OK) {
            std::string e = err ? err : "SQL error";
            sqlite3_free(err);
            throw std::runtime_error(e);
        }
    }
    Json query(const std::string &sql, const Json &args = Json::array()) {
        Statement s(p, sql);
        int i = 1;
        for (auto &v : args)
            s.bind(i++, v);
        return s.rows();
    }
    int64_t id() {
        return sqlite3_last_insert_rowid(p);
    }
};
struct Transaction {
    Database &d;
    bool done = false;
    explicit Transaction(Database &d) : d(d) {
        d.exec("BEGIN IMMEDIATE");
    }
    void commit() {
        d.exec("COMMIT");
        done = true;
    }
    ~Transaction() {
        if (!done)
            try {
                d.exec("ROLLBACK");
            } catch (...) {
            }
    }
};
inline std::string read_file(const std::string &p) {
    std::ifstream f(p, std::ios::binary);
    if (!f)
        throw std::runtime_error("Missing required file: " + p);
    return {std::istreambuf_iterator<char>(f), {}};
}
