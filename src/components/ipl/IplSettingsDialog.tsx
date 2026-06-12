import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { type IplSettings, saveIplSettings } from "@/lib/ipl-settings";
import { M } from "@/lib/i18n/messages";

const schema = z.object({
  default_amount: z.coerce.number().min(0, M.minAmount),
  bank_name: z.string().trim().optional(),
  bank_account_number: z.string().trim().min(1, M.required),
  bank_account_name: z.string().trim().min(1, M.required),
});

type Values = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  settings: IplSettings;
  onSaved: () => void;
}

export function IplSettingsDialog({ open, onOpenChange, settings, onSaved }: Props) {
  const { user } = useAuth();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      default_amount: settings.default_amount,
      bank_name: settings.bank_name,
      bank_account_number: settings.bank_account_number,
      bank_account_name: settings.bank_account_name,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      default_amount: settings.default_amount,
      bank_name: settings.bank_name,
      bank_account_number: settings.bank_account_number,
      bank_account_name: settings.bank_account_name,
    });
  }, [form, open, settings]);

  async function onSubmit(values: Values) {
    try {
      await saveIplSettings({
        default_amount: values.default_amount,
        bank_name: values.bank_name ?? "",
        bank_account_number: values.bank_account_number,
        bank_account_name: values.bank_account_name,
      }, user?.id);

      toast.success("Pengaturan biaya IPL disimpan ke database.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(`${M.saveFailed}: ${(err as Error).message}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Atur Biaya IPL</DialogTitle>
          <DialogDescription>
            Jumlah default dan rekening tujuan pembayaran untuk tagihan IPL.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="default_amount" render={({ field }) => (
              <FormItem>
                <FormLabel>Biaya IPL Default (Rp)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="1000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField control={form.control} name="bank_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank</FormLabel>
                  <FormControl>
                    <Input placeholder="BCA / Mandiri / BNI" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bank_account_number" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor Rekening</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="bank_account_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Penerima</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
