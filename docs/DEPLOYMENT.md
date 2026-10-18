# Deployment, operation and launch preparation

The project has **not** been publicly deployed and live order intake is disabled. Obtain the owner's explicit approval before deploying publicly or opening orders. This is a functional development foundation, not a claim of legal compliance or a substitute for a security review.

## Prepare a private production instance

1. Build Release on the target platform: `cmake -S . -B build-release -DCMAKE_BUILD_TYPE=Release`, then `cmake --build build-release --parallel 2`. Keep compiler, crypto library and vendored dependencies patched. Verify `vendor/SHA256SUMS` against the checked-in files when preparing releases.
2. Run as a dedicated unprivileged service account in a private application directory. Keep `data/` outside public document roots; restrict its access to that account. Copy only `frontend/`, migrations and the executable plus required runtime libraries. Never mount the whole checkout as a public static directory.
3. Set absolute `LAMSA_ROOT`, absolute `LAMSA_DB`, `LAMSA_HOST=127.0.0.1`, `LAMSA_PORT=8080`, your exact `LAMSA_ORIGIN=https://your-owned-domain.example`, `LAMSA_SECURE_COOKIE=1`, `LAMSA_ALLOW_ORDERS=0`. Set the service working directory to the repository/deployment root. The upload directory is `LAMSA_ROOT/data/uploads` even when the database is elsewhere.
4. Run `--init`. Do not seed a real store. Create the first admin with `--create-admin` using a securely injected one-time environment value; remove that value afterward. A reset updates the password and requires a server restart to revoke old sessions. Protect administrative access with VPN/IP restrictions where feasible; MFA and password recovery are not implemented.
5. Configure a systemd/Windows service to start the executable after boot and restart on failure. Processes from a development shell do not survive snapshots/reboots. This repository does not automatically configure your host's service manager.
6. Point DNS A/AAAA records at your approved host. Put Nginx/Caddy or another maintained reverse proxy in front. Obtain a valid TLS certificate for the owned domain and enable HTTPS before entering real customer information. Never expose the raw development port. Add HSTS only after HTTPS is consistently operational.

Illustrative Nginx directives (replace domain/certificates and merge into a reviewed full server configuration):

```nginx
# http context
limit_req_zone $binary_remote_addr zone=lamsa_login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=lamsa_orders:10m rate=10r/m;

# HTTPS server context; also configure listen, server_name and valid certificates
client_max_body_size 5m;
location = /api/admin/login {
    limit_req zone=lamsa_login burst=3 nodelay;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
}
location = /api/orders {
    limit_req zone=lamsa_orders burst=5 nodelay;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
}
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
}
```

The server deliberately does not trust arbitrary forwarded IP headers. Behind a proxy, its in-process limits see the proxy IP; enforce per-client limits at the proxy, then tune `LAMSA_ORDER_LIMIT` if necessary. Direct limits are 5 login attempts/minute, 120 cart quotes/minute and 10 order attempts/minute per peer, with bounded in-memory buckets. Limits reset on restart and do not replace perimeter abuse controls. No permissive CORS is enabled. Same-origin JSON requests, session CSRF tokens, strict cookies and Origin validation protect browser mutations; keep the configured origin exact (scheme, host and port).

## Before approving real sales

- Replace all demonstration products and original illustrative images with accurate, licensed product content. Confirm variant sizes, fabric/care instructions, prices, tax treatment and inventory. There is no automatic tax computation or invoicing in this version.
- Configure actual legal/business identity and customer support contacts. Replace every draft policy. Independently verify business registration, privacy/data retention, consumer protection, returns, tax, invoicing and payment obligations for the specific territories served with qualified local advisers. This document does not assert any particular legal rule or compliance.
- Obtain and test a legitimate courier/delivery service for each enabled destination. The system supports merchant-entered coverage and fees; it does not book shipments or track a provider. Gaza, East Jerusalem and all other sample locations are examples, not promises of availability. Keep unavailable destinations disabled.
- Review the final checkout, total fees, COD cash collection process and handling of failed delivery. Configure real notification/dispatch operations; the application does not send email, SMS or WhatsApp messages automatically.
- For online payments, choose a legitimate processor supporting the merchant, currencies and served locations. Use its hosted checkout/tokenization and authenticated webhooks. Implement reconciliation, payment status transitions and refunds. Never collect or store card numbers/CVV in this application. The current COD interface alone is not a completed online payment integration.
- Review security, accessibility, authentic devices, backup restoration and performance with expected traffic. This version has one admin role, no MFA or audit-event history, no automatic returns/refunds and no multi-node/session-sharing system. Add these as operating needs grow.
- Only after explicit approval, set `LAMSA_ALLOW_ORDERS=1`, restart, enable global COD and order intake in admin, then enable only confirmed delivery destinations with correct fees/COD settings. Both environment and database gates are checked at order time. Test a private order before inviting customers.

## Backups and customer information

Use SQLite's online backup API/CLI while the service is running, not a blind copy of only the `.sqlite` file in WAL mode:

```sh
sqlite3 /private/data/store.sqlite ".backup '/private/backups/store-YYYY-MM-DD.sqlite'"
```

The optional sqlite3 CLI must be installed separately (`mingw-w64-ucrt-x86_64-sqlite3` on MSYS2). Alternatively stop the service cleanly, checkpoint WAL and back up the database and uploads consistently. Back up `data/uploads/` and deployment configuration alongside the database. Encrypt backups, restrict access, retain them according to an approved policy, and test restoring to a private instance with order intake disabled. Never upload real customer data into source control.

The application does not log request bodies, credentials or customer data. Configure reverse-proxy logs to avoid sensitive URL/query contents, restrict log access and rotate/retain logs appropriately. Health checks should call `/api/health` and a representative private test flow; an open TCP port alone does not establish shopping readiness. Monitor disk usage, failed orders, availability and SQLite backups. Image uploads are bounded and decoded/re-encoded; periodically review codec updates. Cookies require HTTPS/Secure in production. Sessions are in-memory, so restart logs everyone out.

## Testing evidence and limits

Run `ctest --test-dir build --output-on-failure` and the optional `tests/browser.py` acceptance flow. HTTP tests use a temporary database and exercise real persisted orders, idempotency, invalid customers, stock contention, status transitions, admin authorization, CSRF and disabled delivery. Browser tests run through shopping, a real temporary COD order and admin image upload/editing. Mobile widths are automated viewport checks; physical iPhone/Android and assistive-technology testing remain merchant release work. Windows/MSYS2 build settings are provided but were not executed in the Linux cloud machine.
