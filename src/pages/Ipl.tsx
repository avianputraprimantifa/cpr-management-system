import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, Download, FileSpreadsheet, FileText, Filter, Plus, Search, Settings2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { MONTHS_ID, formatShortDateID, periodFromMonthYear } from "@/lib/date";
import { formatBlockUnit } from "@/lib/block-unit";
import { formatIDR } from "@/lib/currency";
import { edgeFunctionErrorMessageAsync } from "@/lib/edge-function-error";
import { BILL_STATUS_LABELS, M } from "@/lib/i18n/messages";
import { BillFormDialog } from "@/components/ipl/BillFormDialog";
import { BillPayDialog } from "@/components/ipl/BillPayDialog";
import { BillReceiptDialog } from "@/components/ipl/BillReceiptDialog";
import { BillCsvImportDialog, type BillImportFormat } from "@/components/ipl/BillCsvImportDialog";
import { IplSettingsDialog } from "@/components/ipl/IplSettingsDialog";
import { FALLBACK_IPL_SETTINGS, fetchIplSettings, IPL_SETTINGS_QUERY_KEY } from "@/lib/ipl-settings";
import { updateIplBillStatus, type UpdateIplBillStatusResponse } from "@/lib/ipl-bill-actions";

export type Bill = {
  id: string;
  resident_user_id: string;
  name: string;
  amount: number;
  due_date: string;
  period: string;
  status: "belum_dibayar" | "dalam_pengecekan" | "lunas";
  receipt_path: string | null;
  receipt_thumbnail_path: string | null;
  paid_at: string | null;
  payment_submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  profiles?: { full_name: string | null; block_unit: string | null; email: string | null } | null;
};

const ALL = 0;
const BILL_STATUSES = ["belum_dibayar", "dalam_pengecekan", "lunas"] as const satisfies readonly Bill["status"][];
type StatusFilter = Bill["status"] | "all";
type IplViewMode = "manage" | "mine";
function readMonthParam(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 12 ? n : fallback;
}

function readYearParam(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && (n === ALL || (n >= 2020 && n <= 2100)) ? n : fallback;
}

function readStatusParam(value: string | null): StatusFilter {
  return BILL_STATUSES.includes(value as Bill["status"]) ? value as Bill["status"] : "all";
}

const statusClass: Record<Bill["status"], string> = {
  belum_dibayar:    "bg-destructive/15 text-destructive border-destructive/30",
  dalam_pengecekan: "status-warning-soft",
  lunas:            "bg-success/15 text-success border-success/30",
};

const statusTextClass: Record<Bill["status"], string> = {
  belum_dibayar:    "text-destructive",
  dalam_pengecekan: "text-warning",
  lunas:            "text-success",
};

type ExportCell = string | number | null | undefined;

function csvCell(value: ExportCell) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value: ExportCell) {
  return (value == null ? "" : String(value))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadTextFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFilename(ext: "csv" | "xls", month: number, year: number, status: StatusFilter) {
  const monthPart = month === ALL ? "semua-bulan" : String(month).padStart(2, "0");
  const yearPart = year === ALL ? "semua-tahun" : String(year);
  const statusPart = status === "all" ? "semua-status" : status.replace(/_/g, "-");
  return `tagihan-ipl-${yearPart}-${monthPart}-${statusPart}.${ext}`;
}

function exportRows(bills: Bill[], isStaff: boolean) {
  const headers = isStaff
    ? ["Penghuni", "Email", "Blok / Unit", "Nama Tagihan", "Periode", "Jumlah (Rp)", "Jatuh Tempo", "Status", "Tanggal Bayar"]
    : ["Nama Tagihan", "Periode", "Jumlah (Rp)", "Jatuh Tempo", "Status", "Tanggal Bayar"];

  const rows = bills.map((bill) => {
    const common = [
      bill.name,
      bill.period,
      bill.amount,
      bill.due_date,
      BILL_STATUS_LABELS[bill.status],
      bill.paid_at ? bill.paid_at.slice(0, 10) : "",
    ];
    return isStaff
      ? [bill.profiles?.full_name ?? "", bill.profiles?.email ?? "", formatBlockUnit(bill.profiles?.block_unit) ?? "", ...common]
      : common;
  });

  return { headers, rows };
}

function exportBillsCsv(bills: Bill[], isStaff: boolean, filename: string) {
  const { headers, rows } = exportRows(bills, isStaff);
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  downloadTextFile(filename, `\uFEFF${lines.join("\n")}`, "text/csv;charset=utf-8");
}

function exportBillsExcel(bills: Bill[], isStaff: boolean, filename: string) {
  const { headers, rows } = exportRows(bills, isStaff);
  const table = [
    "<table>",
    `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`,
    "</table>",
  ].join("");
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body>${table}</body></html>`;
  downloadTextFile(filename, html, "application/vnd.ms-excel;charset=utf-8");
}

function StatusInlineSelect({
  bill, onChanged,
}: {
  bill: Bill;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Bill["status"] | null>(null);

  async function applyStatus(next: Bill["status"]) {
    setBusy(true);
    const { data, error } = await updateIplBillStatus({
      bill_id: bill.id,
      status: next,
    });
    const result = data as UpdateIplBillStatusResponse | null;
    setBusy(false);
    setPending(null);
    if (error || result?.error) {
      toast.error(result?.error ?? await edgeFunctionErrorMessageAsync(error, "update-ipl-bill-status", M.saveFailed));
      return;
    }
    toast.success("Status diperbarui.");
    onChanged();
  }

  return (
    <>
      <Select
        value={bill.status}
        onValueChange={(v) => {
          const next = v as Bill["status"];
          if (next !== bill.status) setPending(next);
        }}
        disabled={busy}
      >
        <SelectTrigger
          className={`h-7 w-auto min-w-[10rem] px-2.5 gap-1 text-xs font-medium ${statusClass[bill.status]}`}
          aria-label="Ubah status pembayaran"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {(Object.keys(BILL_STATUS_LABELS) as Array<keyof typeof BILL_STATUS_LABELS>).map((k) => (
            <SelectItem key={k} value={k}>{BILL_STATUS_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi Ubah Status</DialogTitle>
            <DialogDescription>
              Ubah status <strong>{bill.name}</strong>
              {bill.profiles?.full_name ? <> milik <strong>{bill.profiles.full_name}</strong></> : null}
              {" "}dari{" "}
              <span className={`font-bold ${statusTextClass[bill.status]}`}>
                {BILL_STATUS_LABELS[bill.status]}
              </span>
              {" "}menjadi{" "}
              <span className={`font-bold ${pending ? statusTextClass[pending] : ""}`}>
                {pending ? BILL_STATUS_LABELS[pending] : ""}
              </span>?
            </DialogDescription>
          </DialogHeader>
          {pending === "lunas" && (
            <p className="text-xs text-muted-foreground">
              Tanggal pembayaran akan otomatis tercatat sebagai sekarang.
            </p>
          )}
          {pending && pending !== "lunas" && bill.status === "lunas" && (
            <p className="text-xs text-warning">
              Tagihan ini akan dikembalikan ke status belum lunas — tanggal pembayaran akan dihapus.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Batal
            </Button>
            <Button onClick={() => pending && applyStatus(pending)} disabled={busy}>
              {busy ? "Menyimpan…" : "Ya, Ubah"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function IplPage() {
  const { user, hasRole } = useAuth();
  const canManageBills = hasRole("admin", "pengurus");
  const canViewOwnBills = hasRole("pengurus", "penghuni") && !hasRole("admin");
  const [searchParams] = useSearchParams();
  const requestedViewMode = searchParams.get("view") === "mine" ? "mine" : "manage";
  const [selectedViewMode, setSelectedViewMode] = useState<IplViewMode>(requestedViewMode);
  const viewMode: IplViewMode = canManageBills
    ? canViewOwnBills ? selectedViewMode : "manage"
    : "mine";
  const isStaff = canManageBills && viewMode === "manage";
  const isOwnBills = !isStaff;
  const qc = useQueryClient();
  const now = new Date();

  const [month, setMonth] = useState<number>(
    isStaff ? readMonthParam(searchParams.get("month"), now.getMonth() + 1) : ALL,
  );
  const [year, setYear]   = useState<number>(
    isStaff ? readYearParam(searchParams.get("year"), now.getFullYear()) : ALL,
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    isStaff ? readStatusParam(searchParams.get("status")) : "all",
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing]   = useState<Bill | null>(null);
  const [paying, setPaying]     = useState<Bill | null>(null);
  const [viewing, setViewing]   = useState<Bill | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<BillImportFormat>("csv");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch]     = useState("");

  const allMonths = month === ALL;
  const allYears  = year === ALL;
  const period = !allMonths && !allYears ? periodFromMonthYear(month, year) : "";
  const tableColSpan = isStaff ? 6 : 5;

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 11 }, (_, i) => y - 5 + i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iplSettingsQ = useQuery({
    queryKey: IPL_SETTINGS_QUERY_KEY,
    queryFn: fetchIplSettings,
  });
  const iplSettings = iplSettingsQ.data ?? FALLBACK_IPL_SETTINGS;

  const billsQ = useQuery({
    queryKey: [
      "ipl-bills",
      isStaff ? month : "all-months",
      isStaff ? year : "all-years",
      isStaff ? statusFilter : "own-statuses",
      isStaff ? "all" : user?.id,
    ],
    queryFn: async () => {
      let q = supabase
        .from("ipl_bills")
        .select("*")
        .order("period", { ascending: false })
        .order("created_at", { ascending: false });
      if (isStaff) {
        if (!allMonths && !allYears) {
          q = q.eq("period", period);
        } else if (!allYears) {
          q = q.like("period", `${year}-%`);
        } else if (!allMonths) {
          q = q.like("period", `%-${String(month).padStart(2, "0")}`);
        }
        if (statusFilter !== "all") {
          q = q.eq("status", statusFilter);
        }
      }
      if (isOwnBills) {
        if (!user) return [] as Bill[];
        q = q.eq("resident_user_id", user.id);
      }
      const { data: bills, error } = await q;
      if (error) throw error;
      const rows = bills ?? [];
      if (rows.length === 0) return [] as Bill[];

      const ids = Array.from(new Set(rows.map((b) => b.resident_user_id)));
      const { data: profs, error: pe } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, block_unit")
        .in("user_id", ids);
      if (pe) throw pe;
      const map = new Map((profs ?? []).map((p) => [p.user_id, p]));

      return rows.map((b) => ({
        ...b,
        profiles: map.get(b.resident_user_id)
          ? {
              full_name: map.get(b.resident_user_id)!.full_name ?? null,
              email: map.get(b.resident_user_id)!.email ?? null,
              block_unit: map.get(b.resident_user_id)!.block_unit ?? null,
            }
          : null,
      })) as unknown as Bill[];
    },
  });

  const filteredBills = useMemo(() => {
    const rows = billsQ.data ?? [];
    if (!isStaff) return rows;
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((b) => (b.profiles?.full_name ?? "").toLowerCase().includes(term));
  }, [billsQ.data, isStaff, search]);
  const canExport = !billsQ.isLoading && filteredBills.length > 0;
  const exportMonth = isStaff ? month : ALL;
  const exportYear = isStaff ? year : ALL;
  const exportStatus = isStaff ? statusFilter : "all";
  const csvFilename = exportFilename("csv", exportMonth, exportYear, exportStatus);
  const excelFilename = exportFilename("xls", exportMonth, exportYear, exportStatus);

  const refresh = (savedPeriod?: string) => {
    if (isStaff && savedPeriod && !allMonths && !allYears && savedPeriod !== period) {
      const [y, m] = savedPeriod.split("-").map(Number);
      setYear(y);
      setMonth(m);
    }
    qc.invalidateQueries({ queryKey: ["ipl-bills"] });
  };

  const renderBillActions = (bill: Bill, mobile = false) => (
    <div className={mobile ? "grid grid-cols-2 gap-2" : "flex justify-end gap-2"}>
      {isOwnBills && bill.status === "belum_dibayar" && (
        <Button size="sm" onClick={() => setPaying(bill)} className={mobile ? "col-span-2" : ""}>
          Bayar
        </Button>
      )}
      {isStaff && bill.status === "dalam_pengecekan" && bill.receipt_path && (
        <Button size="sm" variant="outline" onClick={() => setViewing(bill)} className={mobile ? "col-span-2" : ""}>
          <FileText className="mr-1 h-4 w-4" /> Lihat Bukti
        </Button>
      )}
      {isStaff && (
        <Button size="sm" variant="ghost" onClick={() => { setEditing(bill); setFormOpen(true); }} className={mobile ? "col-span-2 border" : ""}>
          Edit
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tagihan IPL</h1>
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "Iuran Pemeliharaan Lingkungan — kelola tagihan bulanan penghuni."
              : "Tagihan IPL Anda, termasuk yang belum dibayar, dalam pengecekan, dan lunas."}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          {canManageBills && canViewOwnBills && (
            <div className="col-span-2 grid grid-cols-2 rounded-md border bg-card p-1 sm:flex">
              <Button
                type="button"
                size="sm"
                variant={viewMode === "manage" ? "default" : "ghost"}
                onClick={() => setSelectedViewMode("manage")}
                aria-pressed={viewMode === "manage"}
                className="h-8"
              >
                Kelola Tagihan
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === "mine" ? "default" : "ghost"}
                onClick={() => setSelectedViewMode("mine")}
                aria-pressed={viewMode === "mine"}
                className="h-8"
              >
                Tagihan Saya
              </Button>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!canExport} className="w-full justify-center sm:w-auto">
                <Download className="mr-2 h-4 w-4" /> Export
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => exportBillsCsv(filteredBills, isStaff, csvFilename)}>
                <FileText className="mr-2 h-4 w-4" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportBillsExcel(filteredBills, isStaff, excelFilename)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isStaff && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-center sm:w-auto">
                    <Upload className="mr-2 h-4 w-4" /> Import
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => { setImportFormat("csv"); setImportOpen(true); }}>
                    <FileText className="mr-2 h-4 w-4" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setImportFormat("excel"); setImportOpen(true); }}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="col-span-2 w-full justify-center border-success/30 bg-success/10 text-success hover:bg-success/15 hover:text-success sm:w-auto"
              >
                <Settings2 className="mr-2 h-4 w-4" /> Atur Biaya IPL
              </Button>
              <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="col-span-2 w-full justify-center sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Buat Tagihan Baru
              </Button>
            </>
          )}
        </div>
      </div>

      {isStaff && (
        <Card className="p-3 sm:p-4">
          <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-center">
            <Filter className="hidden h-4 w-4 text-muted-foreground sm:block" />
            <span className="text-sm font-medium">Filter Periode:</span>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Semua Bulan</SelectItem>
                {MONTHS_ID.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Semua Tahun</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                {BILL_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {BILL_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full sm:ml-auto sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama penghuni…"
                className="pl-8 pr-8"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Bersihkan pencarian"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="divide-y md:hidden">
          {billsQ.isLoading && (
            <div className="p-4"><Skeleton className="h-32 w-full" /></div>
          )}
          {!billsQ.isLoading && filteredBills.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? `Tidak ada tagihan dengan nama yang cocok "${search.trim()}".`
                : isStaff
                  ? "Belum ada tagihan untuk periode ini."
                  : "Belum ada riwayat tagihan untuk akun Anda."}
            </div>
          )}
          {filteredBills.map((b) => (
            <div key={b.id} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {isStaff && (
                    <div className="mb-1">
                      <div className="truncate text-sm font-semibold">{b.profiles?.full_name ?? "—"}</div>
                      {formatBlockUnit(b.profiles?.block_unit) && (
                        <div className="text-xs text-muted-foreground">{formatBlockUnit(b.profiles?.block_unit)}</div>
                      )}
                    </div>
                  )}
                  <div className="truncate font-medium">{b.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Periode {b.period}</div>
                </div>
                {isStaff ? (
                  <StatusInlineSelect bill={b} onChanged={refresh} />
                ) : (
                  <Badge variant="outline" className={statusClass[b.status]}>
                    {BILL_STATUS_LABELS[b.status]}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Jumlah</div>
                  <div className="font-mono font-semibold">{formatIDR(b.amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Jatuh Tempo</div>
                  <div>{formatShortDateID(b.due_date)}</div>
                </div>
              </div>
              {renderBillActions(b, true)}
            </div>
          ))}
        </div>
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              {isStaff && <TableHead>Penghuni</TableHead>}
              <TableHead>Nama Tagihan</TableHead>
              <TableHead>Jumlah</TableHead>
              <TableHead>Jatuh Tempo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {billsQ.isLoading && (
              <TableRow><TableCell colSpan={tableColSpan}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
            )}
            {!billsQ.isLoading && filteredBills.length === 0 && (
              <TableRow>
                <TableCell colSpan={tableColSpan} className="text-center text-sm text-muted-foreground py-8">
                  {search.trim()
                    ? `Tidak ada tagihan dengan nama yang cocok "${search.trim()}".`
                    : isStaff
                      ? "Belum ada tagihan untuk periode ini."
                      : "Belum ada riwayat tagihan untuk akun Anda."}
                </TableCell>
              </TableRow>
            )}
            {filteredBills.map((b) => (
              <TableRow key={b.id}>
                {isStaff && (
                  <TableCell>
                    <div className="font-medium">{b.profiles?.full_name ?? "—"}</div>
                    {formatBlockUnit(b.profiles?.block_unit) && (
                      <div className="text-xs text-muted-foreground">{formatBlockUnit(b.profiles?.block_unit)}</div>
                    )}
                  </TableCell>
                )}
                <TableCell>{b.name}</TableCell>
                <TableCell className="font-mono">{formatIDR(b.amount)}</TableCell>
                <TableCell>{formatShortDateID(b.due_date)}</TableCell>
                <TableCell>
                  {isStaff ? (
                    <StatusInlineSelect bill={b} onChanged={refresh} />
                  ) : (
                    <Badge variant="outline" className={statusClass[b.status]}>
                      {BILL_STATUS_LABELS[b.status]}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {renderBillActions(b)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <BillFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }}
        bill={editing}
        onSaved={refresh}
        initialMonth={allMonths ? now.getMonth() + 1 : month}
        initialYear={allYears ? now.getFullYear() : year}
        defaultAmount={iplSettings.default_amount}
      />
      <BillPayDialog
        open={!!paying}
        onOpenChange={(v) => !v && setPaying(null)}
        bill={paying}
        onPaid={refresh}
        paymentSettings={iplSettings}
      />
      <BillReceiptDialog
        open={!!viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        bill={viewing}
        onActionDone={refresh}
      />
      <BillCsvImportDialog
        key={importFormat}
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={refresh}
        format={importFormat}
      />
      {isStaff && (
        <IplSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={iplSettings}
          onSaved={() => qc.invalidateQueries({ queryKey: IPL_SETTINGS_QUERY_KEY })}
        />
      )}
    </div>
  );
}
