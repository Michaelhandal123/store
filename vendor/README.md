# Vendored dependencies

Dependencies are pinned and checked in so standard builds do not fetch executable code. System OpenSSL supplies vetted scrypt and cryptographic randomness. Preserve TLS verification when refreshing dependencies; never bypass certificate or artifact verification to make an installation pass. Review updates, rebuild and rerun tests.

| Files | Version / upstream source | License |
|---|---|---|
| `httplib.h` | cpp-httplib v0.18.3, https://github.com/yhirose/cpp-httplib | MIT (`httplib.LICENSE`) |
| `json.hpp` | nlohmann/json v3.11.3, https://github.com/nlohmann/json | MIT (`json.LICENSE.MIT`) |
| `sqlite3.c`, `sqlite3.h` | SQLite 3.50.4 generated from official https://github.com/sqlite/sqlite tag `version-3.50.4`, commit `8ed5e7365e6f12f427910188bbf6b254daad2ef6` | Public domain; embedded notice |
| `stb_image.h`, `stb_image_write.h` | https://github.com/nothings/stb commit `2c980bb59875b0d32144a71867fbdebb2f77cd20` | MIT / public domain dual license; embedded notices |

SQLite amalgamation generation used the official source tree's `./configure --disable-shared` followed by `make -j2 sqlite3.c`. Generated source identifies SQLite 3.50.4. No unofficial SQLite fork is used.

`SHA256SUMS` records the checked-in files for subsequent integrity checks (`sha256sum -c vendor/SHA256SUMS` from the repository root). This manifest detects subsequent changes; it is not a claim of an independent upstream signature.

The Tajawal font is vendored under `frontend/assets/` from the Google Fonts `ofl/tajawal` directory with its SIL Open Font License (`Tajawal-OFL.txt`). The fashion SVG illustrations were created specifically for this project; they are local labeled demonstration artwork, not photographs or copied brand imagery. Product images and fonts are served locally; the website makes no third-party font/image requests.
