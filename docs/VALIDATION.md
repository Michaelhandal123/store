# Validation performed

Validated in the Linux cloud workspace with GCC 14.2, CMake 4.4.4, SQLite 3.50.4, OpenSSL 3.5.7 and Chromium 154. The exact commands are repeatable from the repository root; each test suite creates a separate temporary database.

- Debug CMake configure and build: passed.
- `ctest --test-dir build --output-on-failure`: passed; its integration runner executed 14 named tests (not a zero-test run).
- `python3 tests/integration.py ./build/lamsa .`: all 14 HTTP/SQLite tests passed. Coverage includes catalog/pagination, Arabic search, filters/sorts, authoritative cart pricing/shipping, inventory rejection, persisted order creation, idempotency, invalid customer/delivery/payment rejection, atomic stock contention, admin authorization/CSRF/Origin checks, cancellation and delivered-sales statistics, product CRUD, order/COD closure, image/settings validation, empty catalogs and non-destructive initialization.
- `python3 tests/browser.py ./build/lamsa .`: passed. Exercised favorites, variant selection, gallery enlargement, cart persistence and quantities, a real temporary COD order, confirmation/cart clearing, admin login, product creation and actual image upload, order details, settings, shipping and logout. Confirmed Arabic RTL, no horizontal overflow at tested 360/390/768/1440 viewport widths, missing-image fallback and empty product display. No JavaScript page errors were recorded. Screenshots are generated in ignored `test-results/`.
- The saved install script was executed against the prepared instance and preserved existing development data. Its build and integration checks passed.
- The development server was restarted and responded to health and catalog requests with 24 demonstration products. Default effective order intake and COD remained disabled.
- Dependency SHA-256 manifest check: passed. Original vendored/license files are retained byte-for-byte, including upstream whitespace.

The Windows/MSYS2 instructions and VS Code configuration have not been executed on Windows. Physical device testing, a production security assessment, HTTPS/domain setup, real courier/payment-provider integration and merchant/legal approval are separate launch requirements. No public deployment or live-order activation was performed.
