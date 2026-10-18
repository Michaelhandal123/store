# لمسة | LAMSA

متجر أزياء نسائية عربي بواجهة RTL، وخادم C++17 حقيقي وقاعدة SQLite. المشروع يبدأ بوضع **تجريبي مغلق للطلبات**: لا توجد كلمات مرور افتراضية، ولا دفع إلكتروني، ولا وعود بتوفر التوصيل.

An Arabic boutique storefront with a C++ backend, transactional inventory and an authenticated merchant dashboard. No Node.js/Python application server or frontend framework is used. Python is only a test runner.

## What works

- Responsive Arabic homepage, original local fashion illustrations, local Tajawal font, category navigation, new arrivals, sales-backed bestsellers (with a clearly labeled featured fallback) and configured discounts.
- Database-backed catalog, Arabic substring search, category/price/size/color/new/discount/availability filters, sorting and pagination.
- Product pages with galleries, enlargement, stock-aware size/color selection, related products and a local wishlist.
- Guest cart persisted in localStorage, quantities/removal and server-calculated item prices and shipping fees.
- COD checkout with customer validation, enabled-region checks, transactional stock deduction, immutable item/price snapshots, random order numbers and idempotent retries.
- Admin authentication with OpenSSL scrypt password hashing, expiring HttpOnly sessions, CSRF tokens, product/variant editing, category creation, image uploads, safe product deactivation, order details and controlled status transitions, cancellation stock restoration, settings and delivery management.
- 24 explicitly labeled demonstration products. No fabricated reviews, sales counts or delivery promises.

## Windows + VS Code (MSYS2 UCRT64)

### 1. Install the tools

Install [MSYS2](https://www.msys2.org/) at `C:\msys64`. Open the **MSYS2 UCRT64** terminal (not the MSYS terminal), then:

```sh
pacman -Syu
# If asked to close the terminal, reopen UCRT64 and run pacman -Syu again.
pacman -S --needed git mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-cmake mingw-w64-ucrt-x86_64-ninja mingw-w64-ucrt-x86_64-openssl mingw-w64-ucrt-x86_64-gdb mingw-w64-ucrt-x86_64-python
```

Install VS Code extensions **C/C++** (`ms-vscode.cpptools`) and **CMake Tools** (`ms-vscode.cmake-tools`). Open this repository's root folder (the folder containing `CMakeLists.txt`) in VS Code. The compiler and all binary libraries must come from the same UCRT64 toolchain; do not mix MSVC, MINGW64 or MSYS libraries.

In a VS Code **PowerShell** terminal, add UCRT64 to this session's PATH:

```powershell
$env:Path = "C:\msys64\ucrt64\bin;C:\msys64\usr\bin;" + $env:Path
g++ --version
cmake --version
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug -DOPENSSL_ROOT_DIR=C:/msys64/ucrt64
cmake --build build --parallel 2
.\build\lamsa.exe --init
.\build\lamsa.exe --seed
.\build\lamsa.exe
```

Open `http://localhost:8080` in your browser. The server binds only to your own machine by default. Stop it with **Ctrl+C**. Run commands from the repository root; running the executable from `build/` without setting `LAMSA_ROOT` will not find the frontend and migration.

The separate `--seed` command is optional, runs only against an empty product table, and never resets existing products or orders. Normal startup only performs idempotent schema initialization. You can start with an empty database and add real products through admin instead.

### 2. Create your administrator

Stop the server, then use PowerShell's hidden password prompt; do not paste a real password into source files or shell history:

```powershell
$env:LAMSA_ADMIN_USER = "owner"
$secret = Read-Host "Choose an admin password (at least 14 characters)" -AsSecureString
$env:LAMSA_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
.\build\lamsa.exe --create-admin
Remove-Item Env:LAMSA_ADMIN_PASSWORD
.\build\lamsa.exe
```

Open `http://localhost:8080/admin/`. Use your new credentials. Re-running `--create-admin` with an existing username resets its password; restart the server afterward to revoke sessions. No password is shipped with this project. The static admin page is public, but every administration API requires authorization.

### 3. Edit your store

- **المنتجات**: add/edit Arabic descriptions, prices in shekels, category, image paths, size/color/SKU/stock, featured/new flags and active status. Removing a variant hides it while retaining historical order references. “إخفاء” deactivates a product safely.
- Upload PNG/JPEG images up to 5 MB and 4096 pixels per dimension, at most 12 million pixels. The server decodes and re-encodes them as PNG, assigns a random filename, and stores them in `data/uploads`. Remove unused files only after checking product references and keeping a backup.
- **التوصيل**: explicitly enable each city/region and its fee and COD eligibility only after verifying real coverage. The sample cities begin disabled. Add new destinations through this screen.
- **الإعدادات**: change the brand name (`العربية | ENGLISH`), contact links, hero content, featured products and draft policies. To replace the simple text logo or hero illustration, edit the frontend HTML/CSS/assets; contact details and promotional copy are database settings.
- **الطلبات**: view private customer information and move orders through جديد → قيد التجهيز → تم الشحن → تم التوصيل. Cancellation is allowed before shipping and restores stock exactly once. Returns after shipping require a separate operational workflow; automatic refunds/returns are not implemented.

### 4. Debug and test

Use **Terminal → Run Build Task** to build, or press **F5** to run under GDB. The included tasks configure Ninja and the UCRT64 compiler path. Breakpoints in `backend/main.cpp` and `backend/store.hpp` work with the Debug build. Ensure another server is not already using port 8080.

```powershell
ctest --test-dir build --output-on-failure
# Detailed names of the 14 HTTP/SQLite tests:
python tests/integration.py build/lamsa.exe .
```

Integration tests create their own temporary database and random admin password; they do not clear your real store data. They enable orders only in that temporary test instance.

Optional browser tests require Python Playwright and a Chromium browser:

```powershell
python -m pip install playwright
python -m playwright install chromium
# Use your installed Chrome/Chromium executable:
$env:CHROMIUM_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
python tests/browser.py build/lamsa.exe .
```

Browser tests exercise actual shopping/checkout/admin flows, image upload, mobile/tablet overflow, RTL, missing images and empty catalog behavior. Screenshots are written to ignored `test-results/`. Automated browser tests are not a substitute for device/accessibility testing before launch.

## Linux / cloud development

With a writable system package manager:

```sh
sudo apt-get update
sudo apt-get install -y g++ cmake make libssl-dev python3
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build --parallel 2
./build/lamsa --seed  # optional; once, for an empty development database
./build/lamsa
ctest --test-dir build --output-on-failure
```

For admin setup in Bash, avoid putting passwords in command history:

```sh
export LAMSA_ADMIN_USER=owner
read -rsp 'Admin password (14+ characters): ' LAMSA_ADMIN_PASSWORD; printf '\n'
export LAMSA_ADMIN_PASSWORD
./build/lamsa --create-admin
unset LAMSA_ADMIN_PASSWORD
./build/lamsa
```

The onboarding machine uses workspace-local CMake at `/workspace/tools/python/cmake/data/bin/cmake`; its system package filesystem is read-only. Standard installations can use `cmake` from PATH.

## Project layout

```text
backend/
  main.cpp          HTTP endpoints, authorization, security headers, rate limits
  database.hpp      Prepared statements, SQLite connections and transactions
  store.hpp         Validation, products, cart pricing, orders and COD interface
  security.hpp      Random tokens, scrypt password hashing, constant-time checks
  seed.hpp          Explicit development-only seed operation
  images.cpp        Bounded image decoding and PNG re-encoding
frontend/           HTML pages, local CSS/JavaScript/fonts and original illustrations
  admin/            Arabic administration page
  js/common.js      Shared API, formatting, cart, wishlist and escaped rendering
  js/storefront.js  Customer shopping interactions
  js/admin.js       Authenticated administration interactions
database/migrations/001_initial.sql
  Tables, constraints, indexes and initial closed store configuration
database/seed/      Seed documentation (implementation: backend/seed.hpp)
tests/              HTTP/SQLite integration tests and browser acceptance script
docs/               Architecture, API, deployment and launch configuration
.vscode/            GCC/GDB build and debugging configuration
vendor/             Pinned C/C++ dependencies, licenses and integrity manifest
```

## Configuration and launch boundaries

See [.env.example](.env.example) for variable names. The application reads the **process environment**; it does not silently load `.env`. SQLite stores prices/fees as integer **agorot** (100 = ₪1), variant inventory, order snapshots and editable settings. Do not expose or commit `data/` or real credentials.

Orders remain closed unless both `LAMSA_ALLOW_ORDERS=1` in the server environment and the admin **orders_enabled** setting are enabled. COD must also be enabled globally and for the selected delivery destination. This is a deliberate launch gate, not fake checkout. Do not enable live orders or publicly deploy without the owner's approval.

**Not connected:** online card payments, courier dispatch, SMS/email notifications, tax invoices, customer accounts, returns/refunds automation, advanced reporting or an external product photography service. COD does not automatically notify or dispatch anyone. Product illustrations and placeholder policies must be replaced/approved before real trading. The brand text is editable; the illustrated collection is explicitly demonstration content.

See [architecture and API](docs/ARCHITECTURE.md), [production deployment and security](docs/DEPLOYMENT.md) and [dependency provenance](vendor/README.md). Linux GCC builds and automated browser flows are validated in the cloud workspace. MSYS2 configuration is provided for Windows but must be verified on your own Windows machine; this Linux environment cannot run Windows binaries.
