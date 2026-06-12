import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateID } from "@/lib/date";
import { M } from "@/lib/i18n/messages";

const schema = z.object({
  guard_user_id: z.string().uuid(M.required),
  notes: z.string().optional(),
});
type Values = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot: { date: string; type: "pagi" | "malam"; existing: any | null } | null;
  onSaved: () => void;
  selfOnly?: boolean;
}

export function AssignShiftDialog({ open, onOpenChange, slot, onSaved, selfOnly = false }: Props) {
  const { user } = useAuth();
  const guardsQ = useQuery({
    enabled: open && !selfOnly,
    queryKey: ["active-satpam"],
    queryFn: async () => {
      const { data: rs } = await supabase.from("user_roles").select("user_id").eq("role", "satpam");
      const ids = (rs ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles").select("user_id, full_name")
        .in("user_id", ids).eq("status", "aktif").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { guard_user_id: "", notes: "" },
  });

  useEffect(() => {
    if (slot?.existing) {
      form.reset({
        guard_user_id: slot.existing.guard_user_id,
        notes: slot.existing.notes ?? "",
      });
    } else if (selfOnly && user) {
      form.reset({ guard_user_id: user.id, notes: "" });
    } else {
      form.reset({ guard_user_id: "", notes: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, open, selfOnly, user]);

  async function onSubmit(v: Values) {
    if (!slot) return;
    const payload = {
      shift_date: slot.date, shift_type: slot.type,
      guard_user_id: v.guard_user_id, notes: v.notes || null,
    };
    const res = slot.existing
      ? await supabase.from("guard_shifts").update(payload).eq("id", slot.existing.id)
      : await supabase.from("guard_shifts").insert(payload);
    if (res.error) {
      if ((res.error as any).code === "23505") {
        toast.error("Slot ini sudah terisi. Muat ulang halaman dan coba lagi.");
      } else {
        toast.error(`${M.saveFailed}: ${res.error.message}`);
      }
      return;
    }
    toast.success(M.saveSuccess);
    onOpenChange(false);
    onSaved();
  }

  async function onDelete() {
    if (!slot?.existing) return;
    if (!confirm("Hapus penugasan ini?")) return;
    const { error } = await supabase.from("guard_shifts").delete().eq("id", slot.existing.id);
    if (error) { toast.error(`${M.deleteFailed}: ${error.message}`); return; }
    toast.success(M.deleteSuccess);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selfOnly ? "Tugaskan Diri Sendiri" : "Tugaskan Satpam"}</DialogTitle>
          {slot && (
            <DialogDescription>
              {formatDateID(slot.date)} — Shift {slot.type === "pagi" ? "Pagi ☀️" : "Malam 🌙"}
              {selfOnly && (
                <span className="block mt-1 text-xs">
                  Anda akan tercatat sebagai satpam bertugas pada slot ini.
                </span>
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!selfOnly && (
              <FormField control={form.control} name="guard_user_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Satpam</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Pilih satpam" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {guardsQ.data?.map((g) => (
                        <SelectItem key={g.user_id} value={g.user_id}>{g.full_name ?? "—"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Catatan (opsional)</FormLabel>
                <FormControl><Textarea rows={3} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter className="gap-2 sm:gap-2">
              {slot?.existing && (
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
