"use client";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import Link from "next/link";
import packageInfo from "@/package.json";
import {
  Wallet,
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  Sparkles,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  CalendarDays,
  ArrowDownLeft,
  ArrowUpLeft,
  Check,
  Trash2,
  Pencil,
  Download,
  LogOut,
  RefreshCw,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "sonner";
import {
  rupiah,
  todayJakarta,
  defaultBudget,
  summarize,
  periodRange,
  type Budget,
  type Transaction,
  type Debt,
  isSpending,
  pocketKinds,
  budgetAlerts,
} from "@/lib/finance";
import { MoneyInput } from "./financial-inputs";
import BudgetEditor from "./budget-editor";
import BudgetProgress from "./budget-progress";
type Data = {
  debts: Debt[];
  user: { name: string; email: string };
  budget: Budget | null;
  transactions: Transaction[];
  plan: { active: boolean; expires: number | null };
  orders: {
    id: string;
    amount: number;
    status: string;
    created: number;
    expires: number | null;
    mode: string;
    url: string | null;
  }[];
  paymentReady: boolean;
  paymentMode: string;
};
const nav = [
  { icon: LayoutDashboard, label: "Ringkasan" },
  { icon: ArrowLeftRight, label: "Transaksi" },
  { icon: PieChart, label: "Budget bulanan" },
  { icon: Sparkles, label: "Paket & akun" },
];
const kinds = pocketKinds;
const colors = ["#508b71", "#a9c98e", "#b7a077", "#7199b8", "#b7cbd2"];
async function api<T = Record<string, string>>(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(result.error || "Permintaan gagal.");
  return result;
}
function Choice({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (s: string) => void;
  items: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full bg-white h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((x) => (
          <SelectItem value={x.value} key={x.value}>
            {x.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function Dashboard({ name = "Perantau" }: { name?: string }) {
  const [period, setPeriod] = useState(() => {
    const today = todayJakarta();
    const d = new Date(today + "T00:00:00Z");
    if (Number(today.slice(8)) < 25) d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [view, setView] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [draft, setDraft] = useState<Budget>(defaultBudget(period));
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [remove, setRemove] = useState<Transaction | null>(null);
  const [formError, setFormError] = useState("");
  const [filter, setFilter] = useState("all");
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSequence.current;
    setLoading(true);
    try {
      const next = await api<Data>("/api/finance?period=" + period);
      if (seq === loadSequence.current) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (seq === loadSequence.current) setError((e as Error).message);
    } finally {
      if (seq === loadSequence.current) setLoading(false);
    }
  }, [period]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setData(null);
        void load();
      }
    });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("billing"))
      queueMicrotask(() => setView(3));
  }, []);
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const result = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const body = await result.json();
      if (!result.ok)
        throw new Error(body.error || "Belum bisa keluar. Silakan coba lagi.");
      window.location.replace("/login");
    } catch (error) {
      toast.error((error as Error).message);
      setLoggingOut(false);
    }
  }
  const b = data?.budget;
  const s = b ? summarize(b, data!.transactions) : null;
  const editBudget = () => {
    setDraft(b ? structuredClone(b) : defaultBudget(period));
    setFormError("");
    setBudgetOpen(true);
  };
  const newTransaction = () => {
    if (!b) {
      editBudget();
      return;
    }
    setFormError("");
    const range = periodRange(b.period, b.payday);
    const today = todayJakarta();
    if (range.start > today) {
      toast.error(
        "Periode ini belum dimulai. Catat transaksi setelah tanggal mulai.",
      );
      return;
    }
    setTransaction({
      id: crypto.randomUUID(),
      period,
      date: today > range.end ? range.end : today,
      type: "expense",
      amount: 0,
      pocket: b.pockets.find(isSpending)?.id ?? b.pockets[0].id,
      note: "",
    });
  };
  async function saveTransaction(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await api("/api/finance", "POST", transaction);
      setTransaction(null);
      await load();
      toast.success("Transaksi tersimpan.");
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteTransaction() {
    if (!remove) return;
    setBusy(true);
    try {
      await api("/api/finance", "DELETE", { id: remove.id });
      setRemove(null);
      await load();
      toast.success("Transaksi dihapus.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    setBusy(true);
    try {
      const r = await api("/api/billing", "POST", { action: "checkout" });
      window.location.assign(r.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function checkPayment(id: string) {
    setBusy(true);
    try {
      const r = await api("/api/billing", "POST", {
        action: "check",
        orderId: id,
      });
      await load();
      toast(
        r.status === "paid"
          ? "Pembayaran terverifikasi."
          : "Status pembayaran: " + r.status,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const toolActions = useRef({ newTransaction, editBudget });
  useEffect(() => {
    toolActions.current = { newTransaction, editBudget };
  });
  useEffect(() => {
    const ctx = (
      document as unknown as {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    for (const [tool, title] of [
      ["start_transaction_entry", "Buka formulir transaksi"],
      ["start_budget_edit", "Buka pengaturan budget"],
    ]) {
      try {
        Promise.resolve(
          ctx.registerTool(
            {
              name: tool,
              title,
              description: title + "; belum menyimpan perubahan.",
              inputSchema: {
                type: "object",
                properties: {},
                additionalProperties: false,
              },
              annotations: { readOnlyHint: false },
              execute(input: unknown) {
                if (
                  !input ||
                  typeof input !== "object" ||
                  Array.isArray(input) ||
                  Object.keys(input).length
                )
                  throw new Error("Input harus objek kosong.");
                if (tool === "start_transaction_entry")
                  toolActions.current.newTransaction();
                else toolActions.current.editBudget();
                return { opened: true };
              },
            },
            { signal: lifecycle.signal },
          ),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
  const transactions = (compact = false) => {
    const rows = (data?.transactions ?? []).filter(
      (t) => filter === "all" || t.type === filter,
    );
    return rows.length ? (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Transaksi</TableHead>
            <TableHead>Tanggal</TableHead>
            <TableHead className="text-right">Nominal</TableHead>
            {!compact && <TableHead className="text-right">Aksi</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(compact ? rows.slice(0, 5) : rows).map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <div className="flex gap-3 items-center">
                  <span
                    className={
                      "transaction-icon " +
                      (t.type === "income" ? "positive" : "")
                    }
                  >
                    {t.type === "income" ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div>
                    <div className="table-note font-medium" title={t.note}>
                      {t.note}
                    </div>
                    <span className="small muted">
                      {t.type === "income"
                        ? "Pemasukan"
                        : b?.pockets.find((p) => p.id === t.pocket)?.name}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="small muted">
                {new Date(t.date).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
              </TableCell>
              <TableCell
                className={
                  "text-right money font-medium " +
                  (t.type === "income" ? "positive" : "")
                }
              >
                {t.type === "income" ? "+" : "−"}
                {rupiah(t.amount)}
              </TableCell>
              {!compact && (
                <TableCell>
                  <div className="flex justify-end gap-3">
                    <button
                      aria-label={"Edit " + t.note}
                      onClick={() => {
                        setFormError("");
                        setTransaction({ ...t });
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label={"Hapus " + t.note}
                      onClick={() => setRemove(t)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ) : (
      <div className="empty-panel">
        <ArrowLeftRight className="mx-auto muted" />
        <h3 className="mt-3">
          Belum ada transaksi{filter !== "all" ? " dengan jenis ini" : ""}
        </h3>
        <p>Mulai dari pemasukan atau pengeluaran pertamamu.</p>
        <button className="secondary" onClick={newTransaction}>
          <Plus size={16} /> Catat transaksi
        </button>
      </div>
    );
  };
  return (
    <SidebarProvider>
      <Toaster richColors position="top-center" />
      <Sidebar className="border-r-0">
        <SidebarHeader>
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Wallet size={23} />
            </span>
            <span>
              Kantong<span className="brand-sub">Rantau</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">RUANG KEUANGAN</p>
          <SidebarMenu>
            {nav.map(({ icon: Icon, label }, i) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  isActive={view === i}
                  className="nav-item"
                  onClick={() => setView(i)}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="sidebar-note">
            <ShieldCheck />
            <strong>
              Jauh dari rumah.
              <br />
              Tetap pegang kendali.
            </strong>
            <p>Ruang kecil untuk rencana besarmu.</p>
          </div>
          <button className="sidebar-upgrade" onClick={() => setView(3)}>
            <Sparkles size={17} />
            <span>
              {data?.plan.active ? "Premium aktif" : "Kenali Premium"}
              <small>Lebih banyak ruang untuk rencana</small>
            </span>
            <ArrowUpRight size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>{nav[view].label}</span>
          </div>
          <div className="header-account">
            <span className="badge">
              {data?.plan.active ? "PREMIUM" : "GRATIS"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="avatar avatar-button"
                  aria-label="Buka menu akun"
                  disabled={loggingOut}
                >
                  {name.slice(0, 1).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="truncate">{name}</div>
                  {data?.user.email && (
                    <div className="truncate small muted font-normal">
                      {data.user.email}
                    </div>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setView(3)}>
                  <Wallet size={16} /> Paket & akun
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/security">
                    <ShieldCheck size={16} /> Keamanan akun
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={loggingOut}
                  onSelect={() => void logout()}
                >
                  <LogOut size={16} />
                  {loggingOut ? "Sedang keluar…" : "Keluar"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === 3
                  ? "RENCANA YANG TUMBUH BERSAMAMU"
                  : "SATU LANGKAH LEBIH TERATUR"}
              </p>
              <h1>
                {
                  [
                    "Uangmu, lebih terarah.",
                    "Catatan kecil, kendali besar.",
                    "Setiap rupiah punya tempat.",
                    "Ruang lebih untuk rencanamu.",
                  ][view]
                }
              </h1>
              <p>
                {
                  [
                    "Amankan yang wajib. Nikmati sisanya dengan tenang.",
                    "Pemasukan dan pengeluaran dalam satu tempat.",
                    "Kebutuhan wajib dulu, lalu tabungan dan belanja.",
                    "Pilih paket yang pas dengan perjalananmu.",
                  ][view]
                }
              </p>
            </div>
            {view !== 3 && (
              <button
                className="primary"
                disabled={loading || !!error}
                onClick={newTransaction}
              >
                <Plus size={19} /> Catat transaksi
              </button>
            )}
          </div>
          {view !== 3 && (
            <div className="section-heading">
              <div className="period-controls">
                <CalendarDays size={18} />
                <label htmlFor="period" className="small">
                  Periode gajian
                </label>
                <input
                  id="period"
                  type="month"
                  min="2000-01"
                  max="2099-12"
                  value={period}
                  onChange={(e) => {
                    if (e.target.value) setPeriod(e.target.value);
                  }}
                />
                {s && (
                  <span className="small muted">
                    {s.range.start} — {s.range.end}
                  </span>
                )}
              </div>
              <button
                className="subtle-button"
                disabled={loading || !!error}
                onClick={editBudget}
              >
                Atur budget <span aria-hidden>↗</span>
              </button>
            </div>
          )}
          {error ? (
            <div className="error" role="alert">
              {error}{" "}
              <button className="secondary ml-3" onClick={() => void load()}>
                Coba lagi
              </button>
            </div>
          ) : loading ? (
            <div className="space-y-5" aria-label="Memuat keuangan">
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-40 rounded-2xl" />
            </div>
          ) : (
            data && (
              <>
                {b &&
                  view !== 3 &&
                  budgetAlerts(b, data.transactions).map((a) => (
                    <div
                      key={a.key}
                      className={
                        a.level === "danger" ? "error" : "budget-warning"
                      }
                      role="status"
                    >
                      {a.message}
                    </div>
                  ))}
                {view === 0 && (
                  <>
                    <section className="overview-grid">
                      <div className="daily-card">
                        <div className="flex justify-between">
                          <span className="pill">
                            <ShieldCheck size={16} /> Batas belanja harian
                          </span>
                          <ArrowUpRight />
                        </div>
                        {s ? (
                          <>
                            <div className="daily-amount money">
                              {rupiah(s.daily)}
                              <span className="per-day"> / hari</span>
                            </div>
                            <p>
                              Alokasi {rupiah(s.dailyAllocation)} ?{" "}
                              {s.periodDays} hari periode gajian.
                            </p>
                            <div className="daily-footer">
                              <CalendarDays size={17} />
                              {s.days
                                ? s.days + " hari dalam sisa periode gajian"
                                : "Lihat ringkasan, lalu atur periode berikutnya"}
                            </div>
                          </>
                        ) : (
                          <>
                            <h2>Mulai dari gajimu.</h2>
                            <p>
                              Sisihkan kebutuhan wajib dan tabungan untuk
                              mengetahui ruang belanja sampai gajian.
                            </p>
                            <button
                              className="light-button"
                              onClick={editBudget}
                            >
                              Atur budget pertama <ArrowUpRight size={17} />
                            </button>
                            <div className="daily-footer">
                              <CalendarDays size={17} /> Mengikuti tanggal
                              gajianmu
                            </div>
                          </>
                        )}
                      </div>
                      <div className="card">
                        <div className="row">
                          <h3>Arus uang periode ini</h3>
                          <Wallet size={19} className="muted" />
                        </div>
                        <div className="two-stats">
                          <div>
                            <p className="small">
                              <ArrowDownLeft
                                size={15}
                                className="inline positive"
                              />{" "}
                              Pemasukan
                            </p>
                            <div className="stat-number money">
                              {rupiah(s?.income ?? 0)}
                            </div>
                          </div>
                          <div>
                            <p className="small">
                              <ArrowUpLeft
                                size={15}
                                className="inline negative"
                              />{" "}
                              Pengeluaran
                            </p>
                            <div className="stat-number money">
                              {rupiah(s?.expense ?? 0)}
                            </div>
                          </div>
                        </div>
                        <div className="summary-line row">
                          <span className="small muted">Saldo tercatat</span>
                          <strong className="money">
                            {rupiah(s?.cash ?? 0)}
                          </strong>
                        </div>
                        <p className="small">
                          Saldo awal + pemasukan − pengeluaran. Alokasi belum
                          memindahkan uang.
                        </p>
                      </div>
                    </section>
                    {s && s.shortfall > 0 && (
                      <div className="error">
                        Kebutuhan wajib dan alokasi tabungan masih kurang{" "}
                        {rupiah(s.shortfall)} dari saldo tercatat. Catat
                        pemasukan yang sudah diterima atau sesuaikan budget.
                      </div>
                    )}
                    {b && (
                      <BudgetProgress
                        budget={b}
                        transactions={data.transactions}
                        debts={data.debts ?? []}
                      />
                    )}
                    <section className="card">
                      <div className="section-heading">
                        <div>
                          <h2>Kantong kebutuhanmu</h2>
                          <p className="small">
                            {b
                              ? "Sisa alokasi setelah transaksi yang tercatat."
                              : "Beri uangmu tujuan sebelum mulai membelanjakannya."}
                          </p>
                        </div>
                        <button
                          className="subtle-button"
                          onClick={() => setView(2)}
                        >
                          Lihat budget ↗
                        </button>
                      </div>
                      <div className="pocket-grid">
                        {(b?.pockets ?? defaultBudget(period).pockets).map(
                          (p, i) => (
                            <div className="pocket" key={p.id}>
                              <span className="pocket-number">
                                <span
                                  className="legend-dot"
                                  style={{
                                    background: colors[i % colors.length],
                                  }}
                                />
                                {kinds[p.kind]}
                              </span>
                              <h3>{p.name}</h3>
                              <div className="pocket-amount money">
                                {rupiah(p.amount - (s?.spent(p.id) ?? 0))}
                              </div>
                              <Progress
                                aria-label={"Pemakaian " + p.name}
                                className="progress-wrap"
                                value={
                                  p.amount
                                    ? Math.min(
                                        100,
                                        ((s?.spent(p.id) ?? 0) / p.amount) *
                                          100,
                                      )
                                    : 0
                                }
                              />
                              <p>
                                {rupiah(s?.spent(p.id) ?? 0)} dari{" "}
                                {rupiah(p.amount)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </section>
                    <div className="bottom-grid">
                      <section className="card">
                        <div className="section-heading">
                          <h2>Transaksi terbaru</h2>
                          <button
                            className="subtle-button"
                            onClick={() => {
                              setFilter("all");
                              setView(1);
                            }}
                          >
                            Lihat semua ↗
                          </button>
                        </div>
                        {transactions(true)}
                      </section>
                      <section className="card">
                        <h2>Yang sudah kamu rencanakan</h2>
                        <p className="small">
                          Pembagian saldo awal dan rencana pemasukan.
                        </p>
                        <div className="allocation-total money">
                          {rupiah(s?.allocated ?? 0)}
                        </div>
                        <div className="allocation-bar">
                          {Object.keys(kinds).map((kind, i) => (
                            <span
                              key={kind}
                              style={{
                                background: colors[i % colors.length],
                                flex:
                                  b?.pockets
                                    .filter((p) => p.kind === kind)
                                    .reduce((sum, p) => sum + p.amount, 0) ||
                                  0.01,
                              }}
                            />
                          ))}
                        </div>
                        {Object.entries(kinds).map(([kind, label], i) => (
                          <div className="row summary-line" key={kind}>
                            <span className="small">
                              <span
                                className="legend-dot"
                                style={{
                                  background: colors[i % colors.length],
                                }}
                              />
                              {label}
                            </span>
                            <strong className="small money">
                              {rupiah(
                                b?.pockets
                                  .filter((p) => p.kind === kind)
                                  .reduce((v, p) => v + p.amount, 0) ?? 0,
                              )}
                            </strong>
                          </div>
                        ))}
                        <div className="hint">
                          Batas harian berasal dari alokasi belanja bulanan dan
                          jajan dibagi jumlah hari periode gajian. Tetap periksa
                          saldo aktual sebelum belanja.
                        </div>
                      </section>
                    </div>
                  </>
                )}
                {view === 1 && (
                  <section className="card">
                    <div className="section-heading">
                      <Tabs value={filter} onValueChange={setFilter}>
                        <TabsList>
                          <TabsTrigger value="all">Semua</TabsTrigger>
                          <TabsTrigger value="income">Pemasukan</TabsTrigger>
                          <TabsTrigger value="expense">Pengeluaran</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      {data.plan.active ? (
                        <a
                          className="secondary"
                          href={"/api/export?period=" + period}
                        >
                          <Download size={16} /> Ekspor CSV
                        </a>
                      ) : (
                        <button
                          className="secondary"
                          onClick={() => setView(3)}
                        >
                          <Sparkles size={16} /> Ekspor · Premium
                        </button>
                      )}
                    </div>
                    {transactions()}
                  </section>
                )}
                {view === 2 && (
                  <>
                    <section className="card">
                      <div className="section-heading">
                        <div>
                          <h2>
                            {b ? "Rencana periode ini" : "Rencanakan gajimu"}
                          </h2>
                          <p>
                            Saldo awal adalah uang yang tersedia saat periode
                            dimulai. Jangan catat lagi sebagai pemasukan.
                          </p>
                        </div>
                        <button className="primary" onClick={editBudget}>
                          <Pencil size={16} />
                          {b ? "Edit budget" : "Mulai budgeting"}
                        </button>
                      </div>
                      {b && s && (
                        <>
                          <div className="budget-summary">
                            <div>
                              <p>Saldo awal</p>
                              <h2>{rupiah(b.opening)}</h2>
                            </div>
                            <div>
                              <p>Rencana pemasukan</p>
                              <h2>{rupiah(b.expected)}</h2>
                            </div>
                            <div>
                              <p>Belum dialokasikan</p>
                              <h2>
                                {rupiah(b.opening + b.expected - s.allocated)}
                              </h2>
                            </div>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Kantong</TableHead>
                                <TableHead>Alokasi</TableHead>
                                <TableHead>Terpakai</TableHead>
                                <TableHead>Sisa</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {b.pockets.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell>
                                    <strong>{p.name}</strong>
                                    <p className="small">{kinds[p.kind]}</p>
                                  </TableCell>
                                  <TableCell>{rupiah(p.amount)}</TableCell>
                                  <TableCell>{rupiah(s.spent(p.id))}</TableCell>
                                  <TableCell
                                    className={
                                      p.amount < s.spent(p.id) ? "negative" : ""
                                    }
                                  >
                                    {rupiah(p.amount - s.spent(p.id))}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </>
                      )}
                    </section>
                    <div className="hint">
                      Untuk setiap periode baru, isi saldo awal aktual. Saldo
                      tidak dibawa otomatis. Catat pemindahan ke rekening
                      tabungan sebagai pengeluaran pada kantong tabungan agar
                      tidak ikut terhitung sebagai uang belanja.
                    </div>
                  </>
                )}
                {view === 3 && (
                  <>
                    <div className="pricing">
                      <section className="card">
                        <span className="badge">UNTUK MULAI TERATUR</span>
                        <h2 className="mt-5">Rantau Gratis</h2>
                        <div className="price">Rp0</div>
                        <p>Dasar yang kamu butuhkan untuk mengatur uang.</p>
                        <div className="feature-list">
                          {[
                            "Catat pemasukan & pengeluaran",
                            "Hingga 10 kantong per periode",
                            "Budget mengikuti tanggal gajian",
                            "Batas belanja harian & riwayat transaksi",
                          ].map((t) => (
                            <div className="flex gap-3 items-center" key={t}>
                              <Check size={17} className="positive" />
                              {t}
                            </div>
                          ))}
                        </div>
                        <span className="status-tag">
                          {data.plan.active
                            ? "Fitur dasar tetap tersedia"
                            : "Paket kamu saat ini"}
                        </span>
                      </section>
                      <section className="card premium-card">
                        <div className="row">
                          <span className="badge">
                            UNTUK RENCANA LEBIH BESAR
                          </span>
                          <Sparkles size={21} />
                        </div>
                        <h2 className="mt-5">Rantau Premium</h2>
                        <div className="price">
                          Rp19.000
                          <span className="small muted font-normal">
                            {" "}
                            / 30 hari
                          </span>
                        </div>
                        <p>
                          Lebih rinci mengatur uang, lebih mudah meninjau
                          catatan.
                        </p>
                        <div className="feature-list">
                          {[
                            "Semua fitur Gratis",
                            "Hingga 20 kantong per periode",
                            "Ekspor transaksi periode ke CSV",
                            "Perpanjang manual, tanpa tagihan otomatis",
                          ].map((t) => (
                            <div className="flex gap-3 items-center" key={t}>
                              <Check size={17} className="positive" />
                              {t}
                            </div>
                          ))}
                        </div>
                        {data.plan.active ? (
                          <div className="hint">
                            Aktif sampai{" "}
                            {new Date(
                              data.plan.expires! * 1000,
                            ).toLocaleDateString("id-ID")}
                            . Perpanjangan tersedia setelah masa akses berakhir.
                          </div>
                        ) : (
                          <>
                            <button
                              className="primary w-full"
                              disabled={busy || !data.paymentReady}
                              onClick={checkout}
                            >
                              {!data.paymentReady
                                ? "Pembayaran belum diaktifkan"
                                : data.paymentMode === "sandbox"
                                  ? "Uji pembayaran Midtrans"
                                  : "Aktifkan Premium"}
                              <ArrowUpRight size={17} />
                            </button>
                            <p className="small">
                              {!data.paymentReady
                                ? "Pencatatan dan budgeting gratis tetap bisa digunakan."
                                : data.paymentMode === "sandbox"
                                  ? "Mode uji: bukan pembayaran sungguhan dan tidak mengaktifkan Premium produksi."
                                  : "Pembayaran melalui Midtrans. Akses aktif setelah pembayaran terverifikasi."}
                            </p>
                          </>
                        )}
                      </section>
                    </div>
                    <section className="card mt-6">
                      <div className="section-heading">
                        <div>
                          <h2>Akun pribadi</h2>
                          <p>{data.user.email}</p>
                          <p className="small">
                            Akun pribadi · sesi terverifikasi
                          </p>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                          <Link className="secondary" href="/security">
                            <ShieldCheck size={16} /> Keamanan akun
                          </Link>
                          <button
                            type="button"
                            className="secondary"
                            disabled={loggingOut}
                            onClick={() => void logout()}
                          >
                            <LogOut size={16} />
                            {loggingOut ? "Sedang keluar…" : "Keluar"}
                          </button>
                        </div>
                      </div>
                      {data.orders.length > 0 && (
                        <>
                          <h3>Riwayat pembayaran</h3>
                          <p className="small">
                            Sesudah membayar, periksa status untuk memperbarui
                            akses.
                          </p>
                          {data.orders.map((o) => (
                            <div className="row summary-line" key={o.id}>
                              <div>
                                <strong>{rupiah(o.amount)}</strong>
                                <p className="small">
                                  {new Date(
                                    o.created * 1000,
                                  ).toLocaleDateString("id-ID")}{" "}
                                  · {o.status}
                                  {o.mode === "sandbox" ? " · Uji coba" : ""}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                {o.status === "pending" && o.url && (
                                  <a className="secondary" href={o.url}>
                                    Lanjut bayar
                                  </a>
                                )}
                                <button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => checkPayment(o.id)}
                                >
                                  <RefreshCw size={15} /> Periksa
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </section>
                  </>
                )}
              </>
            )
          )}
          <footer className="workspace-footer">
            Kantong Rantau ? v{packageInfo.version}{" "}
            <span>Pelan-pelan, rencana jadi kenyataan.</span>
          </footer>
        </main>
      </SidebarInset>
      {budgetOpen && (
        <BudgetEditor
          initial={draft}
          debts={data?.debts ?? []}
          premium={data?.plan.active ?? false}
          onClose={() => setBudgetOpen(false)}
          onSave={async (next) => {
            await api("/api/finance", "PUT", next);
            setBudgetOpen(false);
            if (next.period !== period) setPeriod(next.period);
            else await load();
            toast.success("Budget berhasil disimpan.");
          }}
        />
      )}
      <Dialog
        open={!!transaction}
        onOpenChange={(v) => {
          if (!v && !busy) setTransaction(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {transaction &&
            data?.transactions.some((t) => t.id === transaction.id)
              ? "Edit transaksi"
              : "Catat transaksi"}
          </DialogTitle>
          <DialogDescription>
            Catat uang yang benar-benar sudah masuk atau keluar.
          </DialogDescription>
          {transaction && (
            <form onSubmit={saveTransaction}>
              <Tabs
                value={transaction.type}
                onValueChange={(v) =>
                  setTransaction({
                    ...transaction,
                    type: v as Transaction["type"],
                  })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="expense">Pengeluaran</TabsTrigger>
                  <TabsTrigger value="income">Pemasukan</TabsTrigger>
                </TabsList>
              </Tabs>
              <MoneyInput
                label="Nominal (Rp)"
                value={transaction.amount}
                onChange={(n) => setTransaction({ ...transaction, amount: n })}
              />
              <label className="field">
                Catatan
                <input
                  required
                  maxLength={120}
                  placeholder={
                    transaction.type === "income"
                      ? "Contoh: Gaji September"
                      : "Contoh: Makan siang"
                  }
                  value={transaction.note}
                  onChange={(e) =>
                    setTransaction({ ...transaction, note: e.target.value })
                  }
                />
              </label>
              <label className="field">
                Tanggal
                <input
                  type="date"
                  required
                  min={s?.range.start}
                  max={
                    s && s.range.end < todayJakarta()
                      ? s.range.end
                      : todayJakarta()
                  }
                  value={transaction.date}
                  onChange={(e) =>
                    setTransaction({ ...transaction, date: e.target.value })
                  }
                />
              </label>
              {transaction.type === "expense" && (
                <div className="field">
                  <span>Kantong</span>
                  <Choice
                    label="Kantong pengeluaran"
                    value={transaction.pocket}
                    onChange={(v) =>
                      setTransaction({ ...transaction, pocket: v })
                    }
                    items={(b?.pockets ?? []).map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                  />
                </div>
              )}
              {formError && (
                <p className="error" role="alert">
                  {formError}
                </p>
              )}
              <div className="form-footer">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setTransaction(null)}
                >
                  Batal
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan transaksi"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!v && !busy) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Hapus transaksi ini?</AlertDialogTitle>
          <AlertDialogDescription>
            {remove?.note} · {rupiah(remove?.amount ?? 0)}. Saldo dan sisa
            budget akan dihitung ulang.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <button
              className="primary"
              disabled={busy}
              onClick={deleteTransaction}
            >
              Hapus transaksi
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
