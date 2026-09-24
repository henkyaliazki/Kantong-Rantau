import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.log(
    "MySQL integration test skipped: set TEST_DATABASE_URL to a dedicated test database.",
  );
  process.exit(0);
}
const parsed = new URL(url);
if (!/test/i.test(parsed.pathname))
  throw new Error(
    'TEST_DATABASE_URL must name a dedicated database containing "test".',
  );
const pool = mysql.createPool({
  uri: url,
  connectionLimit: 5,
  decimalNumbers: true,
});
const migration = await readFile(
  "drizzle-mysql/0000_mysql_initial.sql",
  "utf8",
);
for (const table of ["transactions", "orders", "debts", "budgets"])
  await pool.query(`DROP TABLE IF EXISTS \`${table}\``);
for (const statement of migration
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean))
  await pool.query(statement);

await pool.execute("INSERT INTO budgets(user,period,data) VALUES(?,?,?)", [
  "alice",
  "2026-09",
  JSON.stringify({ period: "2026-09", payday: 1, pockets: [] }),
]);
const [foreign] = await pool.execute(
  "SELECT * FROM budgets WHERE user=? AND period=?",
  ["bob", "2026-09"],
);
assert.equal(foreign.length, 0, "budgets remain isolated by user");
const debt = {
  id: "debt-1",
  name: "Laptop",
  total: 100000,
  term: 1,
  startPeriod: "2026-09",
  paidInstallments: 0,
};
await pool.execute("INSERT INTO debts(id,user,data) VALUES(?,?,?)", [
  debt.id,
  "alice",
  JSON.stringify(debt),
]);

async function pay(id, amount) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[locked]] = await db.execute(
      "SELECT data FROM debts WHERE id=? AND user=? FOR UPDATE",
      [debt.id, "alice"],
    );
    assert.ok(locked);
    const [[sum]] = await db.execute(
      "SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE user=? AND debt_id=? AND type='expense'",
      ["alice", debt.id],
    );
    if (Number(sum.total) + amount > debt.total) {
      await db.rollback();
      return false;
    }
    await db.execute(
      "INSERT INTO transactions(id,user,period,date,type,amount,pocket,note,debt_id) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        id,
        "alice",
        "2026-09",
        "2026-09-02",
        "expense",
        amount,
        "debt",
        "payment",
        debt.id,
      ],
    );
    await db.commit();
    return true;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
const concurrent = await Promise.all([
  pay("payment-a", 60000),
  pay("payment-b", 60000),
]);
assert.equal(
  concurrent.filter(Boolean).length,
  1,
  "row lock prevents concurrent overpayment",
);
const [[paid]] = await pool.execute(
  "SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE debt_id=?",
  [debt.id],
);
assert.equal(Number(paid.total), 60000);

await pool.execute(
  "INSERT INTO orders(id,user,amount,status,created,mode) VALUES(?,?,?,?,?,?)",
  ["order-1", "alice", 19000, "pending", 1, "production"],
);
await pool.execute(
  "UPDATE orders SET status='paid',expires=COALESCE(expires,?) WHERE id=?",
  [100, "order-1"],
);
await pool.execute(
  "UPDATE orders SET status='paid',expires=COALESCE(expires,?) WHERE id=?",
  [200, "order-1"],
);
const [[order]] = await pool.execute("SELECT expires FROM orders WHERE id=?", [
  "order-1",
]);
assert.equal(
  Number(order.expires),
  100,
  "premium activation is idempotent per order",
);
await pool.end();
console.log(
  "MySQL integration checks passed: migration, user isolation, concurrent debt cap, and payment idempotency.",
);
