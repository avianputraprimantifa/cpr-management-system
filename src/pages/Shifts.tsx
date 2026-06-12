import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Moon, Plus, Sun, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateID } from "@/lib/date";
import { AssignShiftDialog } from "@/components/shifts/AssignShiftDialog";

type Shift = {
  id: string;
  shift_date: string;
  shift_type: "pagi" | "malam";
  guard_user_id: string;
  notes: string | null;
  guard?: { full_name: string | null } | null;
};

export default function ShiftsPage() {
  const { user, hasRole } = useAuth();
  const canAssign = hasRole("admin", "pengurus");
  const isSatpam  = hasRole("satpam");
  const qc = useQueryClient();
  const [date, setDate]   = useState<Date>(new Date());
  const [open, setOpen]   = useState(false);
  const [selfOnly, setSelfOnly] = useState(false);
  const [slot, setSlot]   = useState<{ date: string; type: "pagi" | "malam"; existing: Shift | null } | null>(null);

  const dateStr = date.toISOString().slice(0, 10);

  const q = useQuery({
    queryKey: ["shifts-day", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guard_shifts")
        .select("*")
        .eq("shift_date", dateStr);
      if (error) throw error;
      const list = (data ?? []) as Shift[];
      const ids = list.map((s) => s.guard_user_id);
      if (ids.length === 0) return list;
      const { data: profs } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.user_id, p]));
      return list.map((s) => ({ ...s, guard: byId.get(s.guard_user_id) ?? null }));
    },
  });

  const pagi  = q.data?.find((s) => s.shift_type === "pagi");
  const malam = q.data?.find((s) => s.shift_type === "malam");
  const noShifts = !q.isLoading && !pagi && !malam;

  function openStaff(t: "pagi" | "malam", existing: Shift | null) {
    setSelfOnly(false);
    setSlot({ date: dateStr, type: t, existing });
    setOpen(true);
  }

  function openSelf(t: "pagi" | "malam") {
    setSelfOnly(true);
    setSlot({ date: dateStr, type: t, existing: null });
    setOpen(true);
  }

  function isMe(s?: Shift | null) {
    return s?.guard_user_id === user?.id;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Jadwal Satpam</h1>
        <p className="text-sm text-muted-foreground">Atur jadwal shift Pagi & Malam.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Pilih Tanggal</CardTitle></CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
            />
            <p className="mt-3 text-xs text-muted-foreground">{formatDateID(date)}</p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {q.isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            <>
              {noShifts && (
                <Alert>
                  <CalendarOff className="h-4 w-4" />
                  <AlertTitle>Belum ada jadwal di hari ini</AlertTitle>
                  <AlertDescription>
                    {canAssign
                      ? "Tugaskan satpam untuk masing-masing shift di kartu di bawah."
                      : isSatpam
                        ? "Anda dapat menugaskan diri sebagai satpam untuk shift Pagi atau Malam."
                        : "Belum ada penugasan satpam untuk tanggal ini."}
                  </AlertDescription>
                </Alert>
              )}
              <SlotCard
                label="Shift Pagi (07:00–18:59)"
                icon={<Sun className="h-5 w-5" />}
                shift={pagi}
                mine={isMe(pagi)}
                action={
                  canAssign ? (
                    <Button size="sm" onClick={() => openStaff("pagi", pagi ?? null)}>
                      <Plus className="mr-1 h-4 w-4" /> {pagi ? "Ubah" : "Tugaskan"}
                    </Button>
                  ) : isSatpam && !pagi ? (
                    <Button size="sm" onClick={() => openSelf("pagi")}>
                      <UserPlus className="mr-1 h-4 w-4" /> Tugaskan Diri
                    </Button>
                  ) : null
                }
              />
              <SlotCard
                label="Shift Malam (19:00–06:59)"
                icon={<Moon className="h-5 w-5" />}
                shift={malam}
                mine={isMe(malam)}
                action={
                  canAssign ? (
                    <Button size="sm" onClick={() => openStaff("malam", malam ?? null)}>
                      <Plus className="mr-1 h-4 w-4" /> {malam ? "Ubah" : "Tugaskan"}
                    </Button>
                  ) : isSatpam && !malam ? (
                    <Button size="sm" onClick={() => openSelf("malam")}>
                      <UserPlus className="mr-1 h-4 w-4" /> Tugaskan Diri
                    </Button>
                  ) : null
                }
              />
            </>
          )}
        </div>
      </div>

      <AssignShiftDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) { setSlot(null); setSelfOnly(false); } }}
        slot={slot}
        selfOnly={selfOnly}
        onSaved={() => qc.invalidateQueries({ queryKey: ["shifts-day"] })}
      />
    </div>
  );
}

function SlotCard({
  label, icon, shift, mine, action,
}: {
  label: string; icon: React.ReactNode; shift?: Shift; mine?: boolean; action?: React.ReactNode;
}) {
  return (
    <Card className={mine ? "bg-success/10 border-success/30" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">{icon} {label}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {shift ? (
          <div>
            <div className="font-semibold">
              {shift.guard?.full_name ?? "Satpam"}
              {mine && <span className="ml-2 text-xs text-success">(Anda yang bertugas)</span>}
            </div>
            {shift.notes && (
              <div className="text-xs text-muted-foreground mt-1">{shift.notes}</div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada satpam ditugaskan.</p>
        )}
      </CardContent>
    </Card>
  );
}
