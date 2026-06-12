import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, Landmark, Loader2, Upload, UserRound, WalletCards } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileUploadButton } from "@/components/ui/file-upload-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatIDR } from "@/lib/currency";
import type { IplSettings } from "@/lib/ipl-settings";
import { M } from "@/lib/i18n/messages";
import { ACCEPT_BILL_RECEIPT, acceptsBillReceipt } from "@/lib/upload-file";

type PayableBill = {
  id: string;
  name: string;
  amount: number;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bill: PayableBill | null;
  onPaid: () => void;
  paymentSettings: IplSettings;
}

export function BillPayDialog({ open, onOpenChange, bill, onPaid, paymentSettings }: Props) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const hasRecipient = Boolean(paymentSettings.bank_account_number && paymentSettings.bank_account_name);

  function pick(f: File | null) {
    if (!f) return setFile(null);
    if (!acceptsBillReceipt(f)) { toast.error(M.fileTypeInvalid); return; }
    setFile(f);
  }

  async function submit() {
    if (!file || !bill || !user) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${bill.id}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("payment-receipts").upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (up.error) throw up.error;

      const upd = await supabase
        .from("ipl_bills")
        .update({ status: "dalam_pengecekan", receipt_path: path })
        .eq("id", bill.id).eq("resident_user_id", user.id);
      if (upd.error) throw upd.error;

      toast.success(M.uploadSuccess);
      onOpenChange(false);
      setFile(null);
      onPaid();
    } catch (err) {
      toast.error(`${M.uploadFailed}: ${(err as Error).message ?? err}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unggah Bukti Pembayaran</DialogTitle>
          <DialogDescription>
            {bill?.name} — setelah diunggah, status berubah menjadi <strong>Dalam Pengecekan</strong> hingga admin memverifikasi.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <WalletCards className="h-4 w-4 text-primary" />
            Detail Transfer
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Nominal</dt>
              <dd className="font-semibold">{formatIDR(bill?.amount ?? 0)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <Landmark className="h-3.5 w-3.5" /> Bank
              </dt>
              <dd className="font-semibold">{paymentSettings.bank_name || "Belum diatur"}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" /> Nomor Rekening
              </dt>
              <dd className="font-mono text-base font-semibold">
                {paymentSettings.bank_account_number || "Belum diatur"}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" /> Nama Penerima
              </dt>
              <dd className="font-semibold">{paymentSettings.bank_account_name || "Belum diatur"}</dd>
            </div>
          </dl>
          {!hasRecipient && (
            <p className="mt-3 text-xs text-muted-foreground">
              Rekening tujuan belum diatur oleh Admin atau Pengurus.
            </p>
          )}
        </div>
        <FileUploadButton
          id="receipt"
          label="Bukti Pembayaran"
          hint="JPG, PNG, HEIC (iPhone), PDF. Gambar > 5MB dikompres otomatis."
          accept={ACCEPT_BILL_RECEIPT}
          file={file}
          onChange={pick}
          buttonLabel="Pilih Bukti"
          buttonLabelChange="Ganti Bukti"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={submit} disabled={!file || busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Unggah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
