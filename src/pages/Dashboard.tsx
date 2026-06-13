import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock3, Home, Moon, Receipt,
  ShieldCheck, Sun, Trees, Users, WalletCards, type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  formatDateID, periodFromMonthYear, currentShiftDate, currentShiftType,
} from "@/lib/date";
import { formatBlockUnit } from "@/lib/block-unit";
import { formatIDR } from "@/lib/currency";
import {
  BILL_STATUS_LABELS, ENV_CATEGORY_LABELS, ENV_STATUS_LABELS, ROLE_LABELS,
} from "@/lib/i18n/messages";

type BillStatus = "belum_dibayar" | "dalam_pengecekan" | "lunas";

const statusClass: Record<BillStatus, string> = {
  belum_dibayar:    "bg-destructive/15 text-destructive border-destructive/30",
  dalam_pengecekan: "bg-warning/15 text-warning border-warning/30",
  lunas:            "bg-success/15 text-success border-success/30",
};

export default function DashboardPage() {
  const { user, profile, roles, hasRole } = useAuth();
  const isStaff = hasRole("admin", "pengurus");
  const isResident = hasRole("penghuni");
  const isSatpam = hasRole("satpam");

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardHero
        name={profile?.full_name}
        unit={profile?.block_unit}
        roles={roles}
        isResident={isResident}
        isStaff={isStaff}
      />

      {isResident && <ResidentBlock userId={user!.id} />}
      {isStaff && <StaffStatsBlock />}

      <OnDutyGuardCard currentUserId={user!.id} />

      {isSatpam && <SatpamExtraBlock userId={user!.id} />}
    </div>
  );
}

function DashboardHero({
  name, unit, roles, isResident, isStaff,
}: {
  name: string | null | undefined;
  unit: string | null | undefined;
  roles: Array<keyof typeof ROLE_LABELS>;
  isResident: boolean;
  isStaff: boolean;
}) {
  const quickLinks = [
    isResident ? { to: "/ipl?view=mine", label: "Tagihan IPL", icon: Receipt } : null,
    isStaff ? { to: "/residents", label: "Penghuni", icon: Users } : null,
    { to: "/environment", label: "Lingkungan", icon: Trees },
  ].filter(Boolean) as Array<{ to: string; label: string; icon: LucideIcon }>;
  const roleText = roles.map((role) => ROLE_LABELS[role]).join(", ") || "Pengguna";
  const displayUnit = formatBlockUnit(unit);

  return (
    <section className="home-hero overflow-hidden rounded-lg border border-border/80 p-4 shadow-sm sm:p-5 md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Carlton Private Residence</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
            Selamat datang{name ? `, ${name}` : ""}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ringkasan hunian hari ini sudah siap, dari tagihan sampai kondisi lingkungan.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex min-h-8 items-center gap-2 rounded-md border border-white/70 bg-white/65 px-3 text-xs font-medium text-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              {formatDateID(new Date())}
            </span>
            {displayUnit && (
              <span className="inline-flex min-h-8 items-center gap-2 rounded-md border border-white/70 bg-white/65 px-3 text-xs font-medium text-foreground">
                <Home className="h-3.5 w-3.5 text-primary" />
                Unit {displayUnit}
              </span>
            )}
            <span className="inline-flex min-h-8 items-center gap-2 rounded-md border border-white/70 bg-white/65 px-3 text-xs font-medium text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {roleText}
            </span>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:justify-end">
          {quickLinks.map(({ to, label, icon: Icon }) => (
            <Button
              key={to}
              asChild
              variant="secondary"
              className="h-10 justify-start border border-white/70 bg-white/80 px-3 hover:bg-white lg:h-9"
            >
              <Link to={to}>
                <Icon className="mr-2 h-4 w-4" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResidentBlock({ userId }: { userId: string }) {
  const now = new Date();
  const currentPeriod = periodFromMonthYear(now.getMonth() + 1, now.getFullYear());

  const current = useQuery({
    queryKey: ["resident-bill-current", userId, currentPeriod],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipl_bills").select("*")
        .eq("resident_user_id", userId).eq("period", currentPeriod)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const overdue = useQuery({
    queryKey: ["resident-bill-overdue", userId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("ipl_bills").select("*")
        .eq("resident_user_id", userId).eq("status", "belum_dibayar")
        .lt("due_date", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-3 sm:p-5 sm:pb-3">
          <CardTitle className="text-base">Tagihan IPL Bulan Ini</CardTitle>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Receipt className="h-4 w-4" />
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
          {current.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : current.data ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm text-muted-foreground">{current.data.name}</span>
                <Badge variant="outline" className={statusClass[current.data.status as BillStatus]}>
                  {BILL_STATUS_LABELS[current.data.status as BillStatus]}
                </Badge>
              </div>
              <div className="text-3xl font-bold">{formatIDR(current.data.amount)}</div>
              <div className="text-xs text-muted-foreground">
                Jatuh tempo: {formatDateID(current.data.due_date)}
              </div>
              {current.data.status === "belum_dibayar" && (
                <Button asChild className="w-full"><Link to="/ipl?view=mine">Bayar Sekarang</Link></Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada tagihan untuk bulan ini.</p>
          )}
        </CardContent>
      </Card>

      {overdue.data && overdue.data.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Tagihan Terlambat</AlertTitle>
          <AlertDescription>
            Anda memiliki {overdue.data.length} tagihan yang sudah melewati jatuh tempo.{" "}
            <Link to="/ipl?view=mine" className="underline font-medium">Lihat detail</Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function StaffStatsBlock() {
  const stats = useQuery({
    queryKey: ["staff-dashboard-stats"],
    queryFn: async () => {
      const [outstanding, aktif] = await Promise.all([
        supabase.from("ipl_bills").select("id, period, status")
          .in("status", ["belum_dibayar", "dalam_pengecekan"]),
        supabase.from("profiles").select("id", { count: "exact", head: true })
          .eq("status", "aktif"),
      ]);
      if (outstanding.error) throw outstanding.error;
      if (aktif.error) throw aktif.error;

      const rows = outstanding.data ?? [];
      const periods = Array.from(new Set(rows.map((bill) => bill.period))).sort();
      const belum = rows.filter((bill) => bill.status === "belum_dibayar").length;
      const dalam = rows.filter((bill) => bill.status === "dalam_pengecekan").length;

      return {
        belum,
        dalam,
        periods,
        activePeriod: periods.length === 1 ? periods[0] : null,
        aktif: aktif.count ?? 0,
      };
    },
  });

  const activePeriodParts = stats.data?.activePeriod?.split("-").map(Number);
  const activePeriodMonth = activePeriodParts?.[1] ?? 0;
  const activePeriodYear = activePeriodParts?.[0] ?? 0;
  const hasOutstanding = (stats.data?.belum ?? 0) + (stats.data?.dalam ?? 0) > 0;
  const isMultiPeriod = hasOutstanding && (stats.data?.periods.length ?? 0) > 1;
  const periodText = stats.data?.activePeriod
    ? `Periode ${stats.data.activePeriod}`
    : isMultiPeriod
      ? `${stats.data?.periods.length ?? 0} periode`
      : "";
  const periodParams = stats.data?.activePeriod
    ? `month=${activePeriodMonth}&year=${activePeriodYear}`
    : "month=0&year=0";

  type StaffStatCard = {
    label: string;
    value: number | null;
    helper: string;
    tone: "destructive" | "warning" | "success" | "primary";
    icon: LucideIcon;
    to: string | null;
    periodText: string;
  };

  const billCards: StaffStatCard[] = [];
  if (hasOutstanding) {
    if (stats.data?.belum) {
      billCards.push({
        label: "Belum Dibayar",
        value: stats.data.belum,
        helper: isMultiPeriod ? "Total perlu ditindaklanjuti" : "Perlu ditindaklanjuti",
        tone: "destructive" as const,
        icon: WalletCards,
        to: `/ipl?${periodParams}&status=belum_dibayar`,
        periodText,
      });
    }
    if (stats.data?.dalam) {
      billCards.push({
        label: "Dalam Pengecekan",
        value: stats.data.dalam,
        helper: isMultiPeriod ? "Total menunggu verifikasi" : "Menunggu verifikasi",
        tone: "warning" as const,
        icon: Clock3,
        to: `/ipl?${periodParams}&status=dalam_pengecekan`,
        periodText,
      });
    }
  } else {
    billCards.push({
      label: "Semua Tagihan IPL Telah Terbayar",
      value: null,
      helper: "Tidak ada tagihan belum dibayar atau dalam pengecekan.",
      tone: "success" as const,
      icon: CheckCircle2,
      to: null,
      periodText: "",
    });
  }

  const cards: StaffStatCard[] = [
    ...billCards,
    {
      label: "Penghuni Aktif",
      value: stats.data?.aktif ?? 0,
      helper: "Unit terdaftar",
      tone: "primary" as const,
      icon: Users,
      to: "/residents?status=aktif",
      periodText: "",
    },
  ];

  const toneClass: Record<
    "destructive" | "warning" | "success" | "primary",
    { text: string; bg: string; border: string }
  > = {
    destructive: {
      text: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/20",
    },
    warning: {
      text: "text-warning",
      bg: "bg-warning/15",
      border: "border-warning/25",
    },
    success: {
      text: "text-success",
      bg: "bg-success/10",
      border: "border-success/20",
    },
    primary: {
      text: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/20",
    },
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="overflow-hidden">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4 pb-2 sm:p-5 sm:pb-2">
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold">{c.label}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{c.helper}</p>
              </div>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${toneClass[c.tone].border} ${toneClass[c.tone].bg} ${toneClass[c.tone].text}`}>
                <Icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-1 sm:p-5 sm:pt-1">
              {stats.isLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : c.value === null ? (
                <div className={`max-w-64 text-lg font-bold leading-tight ${toneClass[c.tone].text}`}>
                  Beres
                </div>
              ) : c.value > 0 && c.to ? (
                <Link
                  to={c.to}
                  className={`inline-flex rounded-md text-3xl font-bold underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${toneClass[c.tone].text}`}
                  aria-label={`Lihat ${c.value} ${c.label.toLowerCase()}`}
                >
                  {c.value}
                </Link>
              ) : (
                <div className={`text-3xl font-bold ${toneClass[c.tone].text}`}>{c.value}</div>
              )}
              {c.periodText && (
                <p className="text-xs text-muted-foreground mt-1">{c.periodText}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function OnDutyGuardCard({ currentUserId }: { currentUserId: string }) {
  const shiftDate = currentShiftDate();
  const shiftKind = currentShiftType();

  const onDuty = useQuery({
    queryKey: ["on-duty-guard", shiftDate, shiftKind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guard_shifts")
        .select("id, guard_user_id, shift_type, shift_date")
        .eq("shift_date", shiftDate).eq("shift_type", shiftKind)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: p } = await supabase
        .from("profiles").select("full_name, block_unit")
        .eq("user_id", data.guard_user_id).maybeSingle();
      return { ...data, profile: p };
    },
  });

  const isMe = onDuty.data?.guard_user_id === currentUserId;
  const Icon = shiftKind === "pagi" ? Sun : Moon;

  return (
    <Card className={`overflow-hidden ${isMe ? "bg-success/10 border-success/30" : "bg-card/95"}`}>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          Satpam Bertugas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
        {onDuty.isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : onDuty.data ? (
          <div className="flex items-center gap-3 rounded-lg bg-secondary/50 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {onDuty.data.profile?.full_name ?? "Satpam"}
                {isMe && <span className="ml-2 text-xs text-success">(Anda)</span>}
              </div>
              <div className="text-xs text-muted-foreground">
                Shift {shiftKind === "pagi" ? "Pagi (07:00–18:59)" : "Malam (19:00–06:59)"} · {formatDateID(shiftDate)}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Belum ada satpam yang ditugaskan untuk shift {shiftKind === "pagi" ? "pagi" : "malam"} hari ini.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SatpamExtraBlock({ userId }: { userId: string }) {
  const nextShift = useQuery({
    queryKey: ["satpam-next-shift", userId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("guard_shifts").select("shift_date, shift_type")
        .eq("guard_user_id", userId).gte("shift_date", today)
        .order("shift_date", { ascending: true }).order("shift_type", { ascending: true })
        .limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const envSummary = useQuery({
    queryKey: ["env-last-7-days"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("environment_items").select("category, status, item_date")
        .gte("item_date", since).in("category", ["sampah", "kolam_renang"])
        .order("item_date", { ascending: false });
      if (error) throw error;
      const latest: Record<string, { category: string; status: string; item_date: string }> = {};
      for (const row of data ?? []) if (!latest[row.category]) latest[row.category] = row;
      return latest;
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            Shift Berikutnya
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
          {nextShift.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : nextShift.data ? (
            <div>
              <div className="font-semibold text-lg">{formatDateID(nextShift.data.shift_date)}</div>
              <div className="text-sm text-muted-foreground">
                Shift {nextShift.data.shift_type === "pagi" ? "Pagi" : "Malam"}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada jadwal.</p>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Trees className="h-4 w-4" />
            </span>
            Lingkungan Minggu Ini
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
          {envSummary.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <ul className="space-y-2 text-sm">
              {(["sampah", "kolam_renang"] as const).map((cat) => {
                const it = envSummary.data?.[cat];
                return (
                  <li key={cat} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{ENV_CATEGORY_LABELS[cat]}</span>
                    {it ? (
                      <Badge variant="outline">{ENV_STATUS_LABELS[it.status as keyof typeof ENV_STATUS_LABELS]}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Belum ada laporan</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="link" className="px-0 mt-2">
            <Link to="/environment">Buka halaman Lingkungan →</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
