#pragma once
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <stdexcept>
#include <string>
inline std::string random_hex(int bytes = 32) {
    std::string raw(bytes, '\0'), out;
    if (RAND_bytes(reinterpret_cast<unsigned char *>(raw.data()), bytes) != 1)
        throw std::runtime_error("Random generator failed");
    const char *h = "0123456789abcdef";
    for (unsigned char c : raw) {
        out += h[c >> 4];
        out += h[c & 15];
    }
    return out;
}
inline std::string password_hash(const std::string &password, const std::string &salt) {
    unsigned char out[64];
    if (EVP_PBE_scrypt(password.data(), password.size(),
                       reinterpret_cast<const unsigned char *>(salt.data()), salt.size(), 32768, 8,
                       1, 64 * 1024 * 1024, out, sizeof(out)) != 1)
        throw std::runtime_error("Password hashing failed");
    std::string s;
    const char *h = "0123456789abcdef";
    for (auto c : out) {
        s += h[c >> 4];
        s += h[c & 15];
    }
    return s;
}
inline bool constant_equal(const std::string &a, const std::string &b) {
    return a.size() == b.size() && CRYPTO_memcmp(a.data(), b.data(), a.size()) == 0;
}
inline std::string getenv_or(const char *key, const std::string &fallback = "") {
    const char *v = std::getenv(key);
    return v ? v : fallback;
}
