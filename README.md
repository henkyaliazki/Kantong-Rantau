# Kantong Rantau

Indonesian budgeting SaaS for salaried people living away from home. Built with React/Vinext, Cloudflare Workers and D1; platform ChatGPT sign-in; Midtrans Snap redirect payments.

## Development

Node >=22.13, npm and Git are required. Install locked packages with npm run install:ci. Copy .env.example to .env, then npm run dev. Local sign-in simulates the account local_seedy; production relies exclusively on trusted platform identity headers. Every finance API query scopes records to the server-authenticated user.

Generate migrations with npm run db:generate. Build with npm run build. Apply each pending migration locally using Wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wet_mole_man.sql. Do not replay applied migrations. Production migrations are deployed through Sites.

## Verification

- npm run test:finance: fixed allocation-based daily allowance, cash, payday boundaries, debt payments, alerts and chart data.
- npm run test:ownership: SQLite schema, cross-user write protection and payment grant idempotency.
- npm run test:api: actual API handlers against in-memory SQLite, including migrations, Free/Premium limits, period copying, debt payments and ownership.
- npx tsc --noEmit: types.

## Billing

Premium costs IDR 19,000 for 30 days, manual renewal, up to 20 pockets and CSV exports. Free supports 10 pockets and unlimited transaction history. Configure MIDTRANS_SERVER_KEY as a hosting secret, MIDTRANS_PRODUCTION=false for sandbox, and APP_URL as the actual trusted site origin. No secret is sent to the browser. Sandbox payments never grant production Premium access.

Webhook: /api/billing/webhook. Configure an accessible notification URL for a public rollout; a private Sites access gate can block external webhooks. Authenticated users can explicitly verify orders through /api/billing. The backend retrieves current Midtrans status, validates order identity, currency and amount, and grants each order once. There is no automatic renewal or card storage.

## Debt and periods

Choosing a different month in the editor copies the plan and preserves the original period and transactions; existing destination budgets cannot be overwritten. Debt records are shared across periods. Total obligation includes all charges; equal payments support 3, 6, 12 or 24 months, with any rupiah rounding difference in the last payment. Single-payment debts use term 1. Previously paid installments are an initial balance adjustment. Expense transactions linked to the debt reduce its remaining balance; editing/deleting them recalculates the balance. Debt configuration is immutable after creation. Select the existing debt when planning another month.

## Financial model

Each period stores payday, opening cash, expected income and category allocations. Actual cash is opening cash plus recorded income minus recorded expenses. Remaining required and savings allocations are reserved. Spendable cash is limited by both the unreserved cash and remaining daily allocations. The displayed daily allowance is the monthly spending/jajan allocation divided by all days in the selected payday period, rounded down to rupiah. It stays constant throughout the period and is a plan, not a guarantee of available cash. Warnings appear in-app at 80% usage; overruns above 100% are marked overbudget. Each new period requires an explicit opening balance; transfers to savings outside spendable cash are recorded as expenses in a savings pocket.

Keep .env, runtime folders, build archives and dependencies out of source control. The site starts private. Public launch requires access configuration, payment sandbox verification and the merchant's business/privacy/support policies.
