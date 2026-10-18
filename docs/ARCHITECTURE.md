# Architecture and HTTP API

C++17 + cpp-httplib serves same-origin HTML/CSS/JavaScript and REST JSON. cpp-httplib is used instead of Crow to avoid a separate Asio installation and keep the MSYS2 build small. SQLite 3.50.4, nlohmann/json 3.11.3, cpp-httplib 0.18.3 and image codecs are vendored; OpenSSL is supplied by the system/UCRT64 package manager. No frontend build or npm dependencies are required.

A four-worker HTTP pool handles connections. A process mutex serializes database/service operations. SQLite WAL, busy timeout, foreign keys and `BEGIN IMMEDIATE` transactions protect writes, including other SQLite connections. This is a deliberate small-store design, not a multi-node deployment architecture. A maximum of 50 distinct variants and 20 units per line is accepted per cart. Prices, quantities and totals are recomputed from active database records; client-submitted price/total values have no authority. Money uses integer agorot with 64-bit order sums.

Order creation validates customer fields, enabled delivery destination, COD eligibility, current stock and prices, inserts immutable item snapshots, decrements stock and commits together. A random client idempotency key plus canonical request hash prevents duplicate orders after network retries and rejects reuse with a different payload. Existing successful responses can be retried after closure. Addresses are stored as submitted; checkout selects the merchant-configured region/city without normalizing their names. No public order-details endpoint exposes customer data. Confirmation shows the successful response saved in that browser tab; admin can retrieve the complete order.

Inventory is on each `variants` row (no redundant inventory table); discounts are `original_price` relative to `price`; shipping fees live on each destination; customer snapshots live on orders. No unnecessary customer account tables are created. Statistics use delivered orders only. The homepage uses quantities from delivered order items for bestsellers once qualifying sales exist. Before then it shows the merchant-configured featured collection with an explicit featured label; sales are never fabricated. Arabic search is a parameterized Unicode substring match with `instr`; it does not normalize Arabic diacritics or provide fuzzy search. Name sorting uses SQLite Unicode codepoint order, not locale-aware collation.

Schema initialization is idempotent and records version 1. Future changes need a new numbered migration plus an explicit version runner; never edit a live schema in place or reset a database. `--seed` is a separate transaction and refuses a populated product table. Product deletion deactivates rather than destroys historical references. Removing variants preserves their IDs and order references.

## Public JSON endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Database/schema readiness |
| GET | `/api/settings` | Public merchant copy and effective order availability |
| GET | `/api/categories` | Product categories |
| GET | `/api/options` | Current distinct sizes and colors |
| GET | `/api/merchandising` | Whether sales-backed bestsellers are available |
| GET | `/api/shipping` | Only enabled delivery destinations/fees |
| GET | `/api/products` | Paginated catalog |
| GET | `/api/products/:id` | Active product, images and active variants |
| POST | `/api/cart/quote` | Authoritative cart pricing and inventory checks |
| POST | `/api/orders` | Transactional COD order creation |

Catalog query keys: `q`, `category`, `min`, `max` (agorot), `size`, `color`, `new=1`, `featured=1`, `sale=1`, `available=1`, `bestsellers=1`, `page` (1-based), `limit` (1–48), `sort` (`featured`, `newest`, `name`, `price_asc`, `price_desc`, `bestsellers`). Size/color/availability conditions must match the same active variant.

Quote example:

```json
{"items":[{"variant_id":1,"quantity":2}],"shipping_region_id":1}
```

Without a destination, shipping and total are `null`, not a fabricated free-shipping value. Checkout adds `idempotency_key` (16–100 URL-safe characters), `payment_method:"cod"`, and `customer` with `name`, `phone`, `email`, `region`, `city`, `neighborhood`, `street`, `building`, `details`, `notes`. Email/details/notes may be empty. Unexpected customer properties are not stored. Supported phone syntax includes +970, +972 and reasonable local formatting; this checks format, not ownership.

## Administration

`POST /api/admin/login` accepts username/password. Successful login sets an 8-hour absolute-lifetime HttpOnly SameSite=Strict cookie scoped to `/api/admin`, returns a CSRF token, and uses Secure when `LAMSA_SECURE_COOKIE=1`. Sessions are in memory and are invalidated by restart. `GET /api/admin/session` restores the CSRF token after a page reload. `POST /api/admin/logout` revokes the current session. All other admin APIs require a session; every mutation requires `X-CSRF-Token`. Role is explicitly constrained to admin in the database; there are no customer sessions with admin capabilities.

| Method | Admin path prefix `/api/admin` | Purpose |
|---|---|---|
| GET | `/overview` | Stored counts and low-stock variants |
| GET, POST | `/products` | List (including hidden) / create |
| GET, PUT, DELETE | `/products/:id` | Full product / update / deactivate |
| POST | `/categories` | Add category |
| POST | `/images` | Raw PNG/JPEG body, validated and re-encoded |
| GET | `/orders` | Latest 500 order summaries |
| GET | `/orders/:id` | Private customer and item snapshots |
| PUT | `/orders/:id/status` | Validated state transition |
| GET, PUT | `/settings` | Store identity, policies, payment/order flags |
| GET, POST | `/shipping` | List / create destinations |
| PUT | `/shipping/:id` | Edit destination/eligibility/fee |

Admin product payloads include `name`, `description`, `category_id`, `price`, nullable `original_price`, boolean `featured/is_new/active`, `images` (up to 8 trusted local asset paths), and `variants` (size/color/SKU/nonnegative stock). The editor handles this without requiring raw JSON editing. Changing a price cannot rewrite past orders. Editing stock sets absolute available quantity; merchants must reconcile outstanding orders before manual stock corrections.

`CashOnDelivery` implements the `PaymentProvider` eligibility interface. Online payment implementation must add a real processor's hosted/tokenized flow, verified webhooks, pending payment states and refund handling before adding another accepted payment method. The current API rejects card payments and never requests card details.
