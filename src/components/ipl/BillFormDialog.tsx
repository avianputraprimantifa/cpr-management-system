import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { MONTHS_ID, periodFromMonthYear, billNameFromPeriod } from "@/lib/date";
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error";
import { M, BILL_STATUS_LABELS } from "@/lib/i18n/messages";

const ALL_VALUE = "__all__";

const schema = z.object({
  resident_user_id: z.string().min(1, M.required),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  amount: z.coerce.number().min(0, M.minAmount),
  due_date: z.string().min(1, M.required),
  status: z.enum(["belum_dibayar", "dalam_pengecekan", "lunas"]),
});
type Values = z.infer<typeof schema>;

type EditableBill = {
  id: string;
  resident_user_id: string;
  amount: number;
  due_date: string;
  period: string;
  status: Values["status"];
};
type CreateIplBillsResponse = {
  created?: number;
  skipped?: number;
  failed?: number;
  errors?: string[];
  period?: string;
  error?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bill: EditableBill | null;
  onSaved: (period?: string) => void;
  initialMonth?: number;
  initialYear?: number;
  defaultAmount?: number;
}

export function BillFormDialog({
  open, onOpenChange, bill, onSaved, initialMonth, initialYear, defaultAmount = 0,
}: Props) {
  const isEdit = !!bill;
  const now = new Date();
  const defaultMonth = initialMonth ?? now.getMonth() + 1;
  const defaultYear  = initialYear  ?? now.getFullYear();

  const residentsQ = useQuery({
    enabled: open,
    queryKey: ["active-billable-residents"],
    queryFn: async () => {
      const { data: roleRows, error: re } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "pengurus", "penghuni", "satpam"]);
      if (re) throw re;

      const rolesByUser = new Map<string, Set<string>>();
      for (const row of roleRows ?? []) {
        const set = rolesByUser.get(row.user_id) ?? new Set<string>();
        set.add(row.role);
        rolesByUser.set(row.user_id, set);
      }
      const ids = Array.from(rolesByUser.entries())
        .filter(([, roles]) => (
          (roles.has("penghuni") || roles.has("pengurus"))
          && !roles.has("admin")
          && !roles.has("satpam")
        ))
        .map(([id]) => id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, block_unit")
        .in("user_id", ids).eq("status", "aktif").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      resident_user_id: "",
      month: defaultMonth,
      year: defaultYear,
      amount: defaultAmount,
      due_date: new Date(defaultYear, defaultMonth - 1, 10).toISOString().slice(0, 10),
      status: "belum_dibayar",
    },
  });

  useEffect(() => {
    if (bill) {
      const [y, m] = bill.period.split("-").map(Number);
      form.reset({
        resident_user_id: bill.resident_user_id,
        month: m, year: y,
        amount: Number(bill.amount),
        due_date: bill.due_date,
        status: bill.status,
      });
    } else {
      form.reset({
        resident_user_id: "",
        month: defaultMonth,
        year: defaultYear,
        amount: defaultAmount,
        due_date: new Date(defaultYear, defaultMonth - 1, 10).toISOString().slice(0, 10),
        status: "belum_dibayar",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill, open, defaultMonth, defaultYear, defaultAmount]);

  const month = useWatch({ control: form.control, name: "month" });
  const year = useWatch({ control: form.control, name: "year" });
  const selectedResidentId = useWatch({ control: form.control, name: "resident_user_id" });
  const isBulk = !isEdit && selectedResidentId === ALL_VALUE;
  const activeCount = residentsQ.data?.length ?? 0;
  const previewName = useMemo(() => billNameFromPeriod(periodFromMonthYear(month, year)), [month, year]);

  const yearOptions = Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i);

  async function onSubmit(v: Values) {
    const period = periodFromMonthYear(v.month, v.year);
    const basePayload = {
      name: billNameFromPeriod(period),
      amount: v.amount,
      due_date: v.due_date,
      period,
      status: v.status,
    };

    if (!isEdit) {
      const { data, error } = await supabase.functions.invoke("create-ipl-bills", {
        body: {
          ...basePayload,
          resident_user_id: isBulk ? ALL_VALUE : v.resident_user_id,
        },
      });
      const result = data as CreateIplBillsResponse | null;
      if (error || result?.error) {
        toast.error(result?.error ?? edgeFunctionErrorMessage(error, "create-ipl-bills", M.saveFailed));
        return;
      }

      const created = result?.created ?? 0;
      const skipped = result?.skipped ?? 0;
      const failed = result?.failed ?? 0;
      if (created > 0) toast.success(`${created} tagihan berhasil dibuat.`);
      if (skipped > 0) toast.info(`${skipped} dilewati (sudah punya tagihan untuk ${period}).`);
      if (failed > 0) {
        console.error("[create-ipl-bills]", result?.errors);
        toast.error(`${failed} gagal — cek console untuk detail.`);
      }
      if (created > 0) {
        onOpenChange(false);
        onSaved(period);
      }
      return;
    }

    const updatePayload = {
      name: basePayload.name,
      amount: basePayload.amount,
      due_date: basePayload.due_date,
      period: basePayload.period,
    };
    const res = await supabase.from("ipl_bills").update(updatePayload).eq("id", bill.id);

    if (res.error) {
      if (res.error.code === "23505") toast.error(M.duplicatePeriod);
      else toast.error(`${M.saveFailed}: ${res.error.message}`);
      return;
    }

    if (bill.status !== v.status) {
      const { data, error } = await supabase.functions.invoke("update-ipl-bill-status", {
        body: { bill_id: bill.id, status: v.status },
      });
      const result = data as CreateIplBillsResponse | null;
      if (error || result?.error) {
        toast.error(result?.error ?? edgeFunctionErrorMessage(error, "update-ipl-bill-status", M.saveFailed));
        return;
      }
    }

    toast.success(M.saveSuccess);
    onOpenChange(false);
    onSaved(period);
  }

  async function onDelete() {
    if (!bill) return;
    if (!confirm("Hapus tagihan ini? Tindakan ini tidak dapat dibatalkan.")) return;
    const { error } = await supabase.from("ipl_bills").delete().eq("id", bill.id);
    if (error) { toast.error(`${M.deleteFailed}: ${error.message}`); return; }
    toast.success(M.deleteSuccess);
    onOpenChange(false);
    onSaved(bill.period);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Tagihan" : "Buat Tagihan IPL Baru"}</DialogTitle>
          <DialogDescription>Nama tagihan dibuat otomatis dari Bulan + Tahun.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="resident_user_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Penghuni</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Pilih penghuni" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {!isEdit && (
                      <SelectItem value={ALL_VALUE}>
                        Semua Penghuni Aktif ({activeCount})
                      </SelectItem>
                    )}
                    {residentsQ.data?.map((r) => (
                      <SelectItem key={r.user_id} value={r.user_id}>
                        {r.full_name ?? "Tanpa Nama"}{r.block_unit ? ` — ${r.block_unit}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isBulk && (
                  <p className="text-xs text-muted-foreground">
                    Akan dibuat <strong>{activeCount}</strong> tagihan — satu per penghuni aktif.
                    Penghuni yang sudah memiliki tagihan untuk periode ini otomatis dilewati.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="month" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bulan</FormLabel>
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {MONTHS_ID.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="year" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tahun</FormLabel>
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div>
              <FormLabel>Nama Tagihan (otomatis)</FormLabel>
              <Input value={previewName} readOnly disabled className="mt-2" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="amount" render={({ field }) => (
                <FormItem>
                  <FormLabel>Jumlah (Rp)</FormLabel>
                  <FormControl><Input type="number" min="0" step="1000" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="due_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Jatuh Tempo</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {(Object.keys(BILL_STATUS_LABELS) as Array<keyof typeof BILL_STATUS_LABELS>).map((k) => (
                      <SelectItem key={k} value={k}>{BILL_STATUS_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="gap-2 sm:gap-2">
              {isEdit && (
                <Button type="button" variant="destructive" onClick={onDelete}>Hapus</Button>
              )}
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
