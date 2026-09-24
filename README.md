# Kantong Rantau

Indonesian budgeting SaaS for salaried people living away from home. Built with Next.js, React, MySQL and Drizzle; email/password sign-in, optional Google OAuth and TOTP 2FA; Midtrans Snap redirect payments.

## Development

Windows setup (PowerShell, Node.js 22.12.0):

1. Install MySQL 8.0 or newer and create two local databases: `CREATE DATABASE kantong_rantau CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` and `CREATE DATABASE kantong_rantau_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.
2. Run `Copy-Item .env.example .env.local`, then edit `.env.local` in VS Code. Put the local MySQL credentials in `DATABASE_URL` and `TEST_DATABASE_URL`; do not commit that file or paste its password into chat.
3. Run `npm.cmd ci`, `npm.cmd run db:migrate`, then `npm.cmd run dev`. Open http://127.0.0.1:3000. The migration and test scripts load `.env.local` directly.

Both development and production require a verified database session. Automatic development identity and identity headers are not accepted. Every finance API query scopes records to the server-authenticated user.

Generate MySQL migrations with `npm.cmd run db:generate`, apply them with `npm.cmd run db:migrate`, type-check with `npm.cmd run typecheck`, and build with `npm.cmd run build`. Historical D1 migrations remain in `drizzle/`; MySQL migrations are in `drizzle-mysql/`.

## Verification

- npm run test:finance: fixed allocation-based daily allowance, cash, payday boundaries, debt payments, alerts and chart data.
- `npm.cmd run test:ownership`: MySQL schema, cross-user isolation, concurrent debt cap and payment grant idempotency. It requires `TEST_DATABASE_URL` and refuses databases whose name does not contain `test`.
- `npm.cmd run typecheck`: TypeScript types.
- `npm.cmd run build`: production Next.js build.

## Moving existing D1/SQLite data

Do not run this against production without a backup and maintenance window. Export the four D1 tables (`budgets`, `debts`, `orders`, `transactions`) to one JSON file shaped as `{ "budgets": [], "debts": [], "orders": [], "transactions": [] }`; keep every column unchanged, including IDs, `user`, `debt_id`, timestamps and JSON `data`. Apply the MySQL migration to an empty database, set `DATABASE_URL` in the current PowerShell session, and run `node scripts/migrate-json-to-mysql.mjs .\path\export.json`. The import is one transaction and rolls back completely on duplicate IDs or invalid relationships. Compare row counts and sample records before switching the application connection. The script never deletes source data.

## Billing

Premium costs IDR 19,000 for 30 days, manual renewal, up to 20 pockets and CSV exports. Free supports 10 pockets and unlimited transaction history. Configure MIDTRANS_SERVER_KEY as a hosting secret, MIDTRANS_PRODUCTION=false for sandbox, and APP_URL as the actual trusted site origin. No secret is sent to the browser. Sandbox payments never grant production Premium access.

Webhook: /api/billing/webhook. Configure an accessible notification URL for a public rollout; a private Sites access gate can block external webhooks. Authenticated users can explicitly verify orders through /api/billing. The backend retrieves current Midtrans status, validates order identity, currency and amount, and grants each order once. There is no automatic renewal or card storage.

## Debt and periods

Choosing a different month in the editor copies the plan and preserves the original period and transactions; existing destination budgets cannot be overwritten. Debt records are shared across periods. Total obligation includes all charges; equal payments support 3, 6, 12 or 24 months, with any rupiah rounding difference in the last payment. Single-payment debts use term 1. Previously paid installments are an initial balance adjustment. Expense transactions linked to the debt reduce its remaining balance; editing/deleting them recalculates the balance. Debt configuration is immutable after creation. Select the existing debt when planning another month.

## Financial model

Each period stores payday, opening cash, expected income and category allocations. Actual cash is opening cash plus recorded income minus recorded expenses. Remaining required and savings allocations are reserved. Spendable cash is limited by both the unreserved cash and remaining daily allocations. The displayed daily allowance is the monthly spending/jajan allocation divided by all days in the selected payday period, rounded down to rupiah. It stays constant throughout the period and is a plan, not a guarantee of available cash. Warnings appear in-app at 80% usage; overruns above 100% are marked overbudget. Each new period requires an explicit opening balance; transfers to savings outside spendable cash are recorded as expenses in a savings pocket.

Keep .env, runtime folders, build archives and dependencies out of source control. The site starts private. Public launch requires access configuration, payment sandbox verification and the merchant's business/privacy/support policies.



## Autentikasi pengguna

Aplikasi kini menggunakan pendaftaran email/password, sesi MySQL, Google OAuth opsional, dan 2FA TOTP opsional. Akun development otomatis dan kepercayaan pada header identitas sudah dinonaktifkan. Jalankan npm.cmd run db:migrate, kemudian npm.cmd run dev dan buka /register. Lihat [panduan autentikasi](docs/AUTH-SETUP.md) untuk konfigurasi Google, recovery codes, dan pengujian.
