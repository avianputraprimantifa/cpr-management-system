import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Loader2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { M } from "@/lib/i18n/messages";
import { formatIDR } from "@/lib/currency";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bill: any | null;
  onActionDone: () => void;
}

export function BillReceiptDialog({ open, onOpenChange, bill, onActionDone }: Props) {
  const [url, setUrl]   = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(null);
    if (!bill?.receipt_path || !open) return;
    supabase.storage.from("payment-receipts")
      .createSignedUrl(bill.receipt_path, 60)
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        setUrl(data.signedUrl);
      });
  }, [bill, open]);

  const isPdf = bill?.receipt_path?.toLowerCase().endsWith(".pdf");

  async function confirm() {
    if (!bill) return;
    setBusy(true);
    const u = await supabase
      .from("ipl_bills")
      .update({ status: "lunas", paid_at: new Date().toISOString() })
      .eq("id", bill.id);
    if (u.error) { setBusy(false); toast.error(`${M.saveFailed}: ${u.error.message}`); return; }
    await supabase.from("notifications").insert({
      user_id: bill.resident_user_id,
      title: "Pembayaran Dikonfirmasi",
      body: `${bill.name} sebesar ${formatIDR(bill.amount)} telah dikonfirmasi lunas.`,
      type: "bill_confirmed",
    });
    setBusy(false);
    toast.success(M.confirmSuccess);
    onOpenChange(false);
    onActionDone();
  }

  async function reject() {
    if (!bill) return;
    setBusy(true);
    const u = await supabase
      .from("ipl_bills")
      .update({ status: "belum_dibayar", receipt_path: null })
      .eq("id", bill.id);
    if (u.error) { setBusy(false); toast.error(`${M.saveFailed}: ${u.error.message}`); return; }
    await supabase.from("notifications").insert({
      user_id: bill.resident_user_id,
      title: "Pembayaran Ditolak",
      body: `${bill.name} ditolak. Mohon unggah ulang bukti pembayaran yang valid.`,
      type: "bill_rejected",
    });
    setBusy(false);
    toast.success(M.rejectSuccess);
    onOpenChange(false);
    onActionDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bukti Pembayaran</DialogTitle>
          <DialogDescription>
            {bill?.name} — {bill && formatIDR(bill.amount)}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted rounded-lg overflow-hidden min-h-[300px] flex items-center justify-center">
          {!url ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : isPdf ? (
            <iframe src={url} className="w-full h-[60vh]" title="Bukti pembayaran" />
          ) : (
            <img src={url} alt="Bukti pembayaran" className="max-h-[60vh] object-contain" />
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="outline" asChild disabled={!url}>
            <a href={url ?? "#"} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" /> Unduh
            </a>
          </Button>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={reject} disabled={busy}>
              <X className="mr-2 h-4 w-4" /> Tolak
            </Button>
            <Button onClick={confirm} disabled={busy} className="bg-success text-success-foreground hover:bg-success/90">
              <Check className="mr-2 h-4 w-4" /> Konfirmasi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
