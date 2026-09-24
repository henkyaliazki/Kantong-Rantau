export type Pocket = {
  id: string;
  name: string;
  kind:
    | "required"
    | "saving"
    | "daily"
    | "monthly"
    | "snack"
    | "debt"
    | "installment";
  amount: number;
  debtId?: string;
};
export type Debt = {
  id: string;
  name: string;
  total: number;
  term: 1 | 3 | 6 | 12 | 24;
  startPeriod: string;
  paidInstallments: number;
  paid?: number;
};
export type Budget = {
  period: string;
  payday: number;
  opening: number;
  expected: number;
  pockets: Pocket[];
};
export type Transaction = {
  id: string;
  period: string;
  date: string;
  type: "income" | "expense";
  amount: number;
  pocket: string;
  note: string;
  debt_id?: string | null;
};
export const isSpending = (p: Pocket) =>
  ["daily", "monthly", "snack"].includes(p.kind);
export const isDebtPocket = (p: Pocket) =>
  p.kind === "debt" || p.kind === "installment";
export const pocketKinds = {
  required: "Kebutuhan wajib",
  saving: "Alokasi tabungan",
  daily: "Belanja harian (lama)",
  monthly: "Belanja bulanan",
  snack: "Budget jajan",
  debt: "Hutang",
  installment: "Cicilan",
};
export function debtSummary(d: Debt) {
  const monthly = Math.floor(d.total / d.term);
  const initial =
    d.paidInstallments >= d.term ? d.total : monthly * d.paidInstallments;
  const paid = Math.min(d.total, initial + (d.paid ?? 0));
  const remaining = Math.max(0, d.total - paid);
  const completed =
    remaining === 0
      ? d.term
      : Math.min(d.term - 1, monthly > 0 ? Math.floor(paid / monthly) : 0);
  return {
    monthly,
    initial,
    paid,
    remaining,
    completed,
    left: d.term - completed,
    last: d.total - monthly * (d.term - 1),
  };
}
export function debtDue(d: Debt, period: string) {
  const [y, m] = period.split("-").map(Number),
    [sy, sm] = d.startPeriod.split("-").map(Number);
  const i = (y - sy) * 12 + m - sm;
  const s = debtSummary(d);
  return i < d.paidInstallments || i < 0
    ? 0
    : i >= d.term
      ? s.remaining
      : Math.min(s.remaining, i === d.term - 1 ? s.last : s.monthly);
}
export function budgetAlerts(
  b: Budget,
  tx: Transaction[],
  today = todayJakarta(),
) {
  const periodTx = tx.filter((t) => t.period === b.period);
  const alerts: {
    key: string;
    level: "warning" | "danger";
    message: string;
  }[] = [];
  const spent = (p: Pocket) =>
    periodTx
      .filter((t) => t.type === "expense" && t.pocket === p.id)
      .reduce((n, t) => n + t.amount, 0);
  const check = (key: string, label: string, used: number, limit: number) => {
    if (used > limit)
      alerts.push({
        key,
        level: "danger",
        message: `Overbudget ${label}: lebih ${rupiah(used - limit)} dari alokasi ${rupiah(limit)}.`,
      });
    else if (limit > 0 && used >= limit * 0.8)
      alerts.push({
        key,
        level: "warning",
        message: `Hati-hati, ${label} sudah terpakai ${Math.round((used / limit) * 100)}%. Sisa ${rupiah(limit - used)}.`,
      });
  };
  for (const p of b.pockets)
    check("pocket:" + p.id, p.name, spent(p), p.amount);
  const s = summarize(b, periodTx, today);
  check("total", "total budget", s.expense, s.allocated);
  if (today >= s.range.start && today <= s.range.end) {
    const used = periodTx
      .filter(
        (t) =>
          t.type === "expense" &&
          t.date === today &&
          b.pockets.some((p) => p.id === t.pocket && isSpending(p)),
      )
      .reduce((v, t) => v + t.amount, 0);
    check("daily-limit", "belanja hari ini", used, s.daily);
  }
  return alerts;
}
export function budgetChart(
  b: Budget,
  tx: Transaction[],
  today = todayJakarta(),
) {
  const s = summarize(b, tx, today);
  let cumulative = 0;
  return Array.from({ length: s.periodDays }, (_, i) => {
    const date = new Date(Date.parse(s.range.start) + i * 86400000)
      .toISOString()
      .slice(0, 10);
    cumulative += tx
      .filter(
        (t) => t.period === b.period && t.type === "expense" && t.date === date,
      )
      .reduce((v, t) => v + t.amount, 0);
    return {
      date,
      label: new Date(date).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      actual: date <= today ? cumulative : null,
      budget: s.allocated,
    };
  });
}
export const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export const todayJakarta = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function periodRange(period: string, payday: number) {
  const [y, m] = period.split("-").map(Number);
  const at = (yy: number, mm: number) =>
    new Date(
      Date.UTC(
        yy,
        mm,
        Math.min(payday, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()),
      ),
    );
  const start = at(y, m - 1),
    next = at(y, m);
  const end = new Date(next.getTime() - 86400000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
  };
}
export function summarize(
  b: Budget,
  tx: Transaction[],
  today = todayJakarta(),
) {
  tx = tx.filter((t) => t.period === b.period);
  const income = tx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expense = tx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const spent = (id: string) =>
    tx
      .filter((t) => t.type === "expense" && t.pocket === id)
      .reduce((s, t) => s + t.amount, 0);
  const reserved = b.pockets
    .filter((p) => !isSpending(p))
    .reduce((s, p) => s + Math.max(0, p.amount - spent(p.id)), 0);
  const cash = b.opening + income - expense;
  const dailyAllocation = b.pockets
    .filter(isSpending)
    .reduce((s, p) => s + p.amount, 0);
  const dailyRemaining = b.pockets
    .filter(isSpending)
    .reduce((s, p) => s + p.amount - spent(p.id), 0);
  const range = periodRange(b.period, b.payday);
  const days = Math.max(
    0,
    Math.ceil(
      (Date.parse(range.next) -
        Date.parse(today < range.start ? range.start : today)) /
        86400000,
    ),
  );
  const spendable = Math.max(0, Math.min(cash - reserved, dailyRemaining));
  const periodDays = Math.round(
    (Date.parse(range.next) - Date.parse(range.start)) / 86400000,
  );
  return {
    income,
    expense,
    cash,
    reserved,
    spent,
    spendable,
    days,
    daily: Math.floor(dailyAllocation / periodDays),
    dailyAllocation,
    dailyRemaining,
    periodDays,
    range,
    allocated: b.pockets.reduce((s, p) => s + p.amount, 0),
    shortfall: Math.max(0, reserved - cash),
  };
}
export function defaultBudget(period: string): Budget {
  return {
    period,
    payday: 25,
    opening: 0,
    expected: 0,
    pockets: [
      { id: "kos", name: "Kos & tagihan", kind: "required", amount: 0 },
      { id: "keluarga", name: "Kirim ke rumah", kind: "required", amount: 0 },
      { id: "darurat", name: "Dana darurat", kind: "saving", amount: 0 },
      { id: "pulang", name: "Pulang kampung", kind: "saving", amount: 0 },
      { id: "harian", name: "Belanja bulanan", kind: "monthly", amount: 0 },
    ],
  };
}
