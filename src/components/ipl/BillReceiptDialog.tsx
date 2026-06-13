import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Loader2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { edgeFunctionErrorMessageAsync } from "@/lib/edge-function-error";
import { updateIplBillStatus, type UpdateIplBillStatusResponse } from "@/lib/ipl-bill-actions";
import { getPaymentReceiptSignedUrl } from "@/lib/payment-receipt-url";
import { M } from "@/lib/i18n/messages";
import { formatIDR } from "@/lib/currency";

type ReceiptBill = {
  id: string;
  resident_user_id: string;
  name: string;
  amount: number;
  status: "belum_dibayar" | "dalam_pengecekan" | "lunas";
  receipt_path: string | null;
};
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bill: ReceiptBill | null;
  onActionDone: () => void;
}

export function BillReceiptDialog({ open, onOpenChange, bill, onActionDone }: Props) {
  const [signedReceipt, setSignedReceipt] = useState<{ path: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const receiptPath = open ? bill?.receipt_path ?? null : null;
  const url = signedReceipt?.path === receiptPath ? signedReceipt.url : null;

  useEffect(() => {
    if (!receiptPath) return undefined;
    let active = true;
    getPaymentReceiptSignedUrl(bill?.id ?? "", "receipt", receiptPath, 300)
      .then((signedUrl) => {
        if (active) setSignedReceipt({ path: receiptPath, url: signedUrl });
      })
      .catch((error) => {
        if (active) toast.error((error as Error).message);
      });
    return () => { active = false; };
  }, [bill?.id, receiptPath]);

  const isPdf = bill?.receipt_path?.toLowerCase().endsWith(".pdf");

  async function updateStatus(
    status: ReceiptBill["status"],
    options: { clearReceipt?: boolean } = {},
    successMessage: string = M.confirmSuccess,
  ) {
    if (!bill) return;
    setBusy(true);
    const { data, error } = await updateIplBillStatus({
      bill_id: bill.id,
      status,
      clear_receipt: options.clearReceipt ?? false,
    });
    const result = data as UpdateIplBillStatusResponse | null;
    setBusy(false);
    if (error || result?.error) {
      toast.error(result?.error ?? await edgeFunctionErrorMessageAsync(error, "update-ipl-bill-status", M.saveFailed));
      return;
    }
    toast.success(successMessage);
    onOpenChange(false);
    onActionDone();
  }

  async function confirm() {
    await updateStatus("lunas");
  }

  async function reject() {
    await updateStatus("belum_dibayar", { clearReceipt: true }, M.rejectSuccess);
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
