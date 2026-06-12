import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatBlockUnit } from "@/lib/block-unit";
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error";
import { BILL_STATUS_LABELS, M } from "@/lib/i18n/messages";
import { formatIDR } from "@/lib/currency";
import { formatShortDateID } from "@/lib/date";

type VerifyBill = {
  id: string;
  resident_user_id: string;
  name: string;
  amount: number;
  due_date: string;
  period: string;
  status: "belum_dibayar" | "dalam_pengecekan" | "lunas";
  receipt_path: string | null;
  receipt_thumbnail_path: string | null;
  payment_submitted_at: string | null;
  paid_at: string | null;
};

type UpdateBillStatusResponse = {
  error?: string;
};

const statusClass: Record<VerifyBill["status"], string> = {
  belum_dibayar: "bg-destructive/15 text-destructive border-destructive/30",
  dalam_pengecekan: "status-warning-soft",
  lunas: "bg-success/15 text-success border-success/30",
};

export default function IplVerifyPage() {
  const { billId } = useParams();
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["ipl-verify", billId],
    enabled: Boolean(billId),
    queryFn: async () => {
      const id = billId ?? "";
      const { data: bill, error } = await supabase
        .from("ipl_bills")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!bill) throw new Error("Tagihan tidak ditemukan.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, block_unit, email")
        .eq("user_id", bill.resident_user_id)
        .maybeSingle();
      if (profileError) throw profileError;

      const receiptUrl = bill.receipt_path
        ? (await supabase.storage.from("payment-receipts").createSignedUrl(bill.receipt_path, 300)).data?.signedUrl ?? null
        : null;
      const thumbnailUrl = bill.receipt_thumbnail_path
        ? (await supabase.storage.from("payment-receipts").createSignedUrl(bill.receipt_thumbnail_path, 300)).data?.signedUrl ?? null
        : null;

      return {
        bill: bill as VerifyBill,
        profile: profile ?? null,
        receiptUrl,
        thumbnailUrl,
      };
    },
  });

  const bill = q.data?.bill ?? null;
  const isPdf = bill?.receipt_path?.toLowerCase().endsWith(".pdf") ?? false;

  async function verifyPaid() {
    if (!bill) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("update-ipl-bill-status", {
      body: { bill_id: bill.id, status: "lunas" },
    });
    const result = data as UpdateBillStatusResponse | null;
    setBusy(false);
    setConfirmOpen(false);
    if (error || result?.error) {
      toast.error(result?.error ?? edgeFunctionErrorMessage(error, "update-ipl-bill-status", M.saveFailed));
      return;
    }
    toast.success("Pembayaran dikonfirmasi lunas.");
    await qc.invalidateQueries({ queryKey: ["ipl-verify", billId] });
    await qc.invalidateQueries({ queryKey: ["ipl-bills"] });
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link to="/ipl?status=dalam_pengecekan">
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Tagihan IPL
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Verifikasi Pembayaran</h1>
        <p className="text-sm text-muted-foreground">
          Cek detail tagihan dan bukti pembayaran sebelum mengubah status menjadi Lunas.
        </p>
      </div>

      {q.isLoading && (
        <Card className="space-y-4 p-5">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-40 w-full" />
        </Card>
      )}

      {q.error && (
        <Card className="p-5 text-sm text-destructive">
          {(q.error as Error).message}
        </Card>
      )}

      {q.data && bill && (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <Card className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{bill.name}</h2>
                <p className="text-sm text-muted-foreground">{bill.period}</p>
              </div>
              <Badge variant="outline" className={statusClass[bill.status]}>
                {BILL_STATUS_LABELS[bill.status]}
              </Badge>
            </div>

            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Penghuni</dt>
                <dd className="font-medium">{q.data.profile?.full_name ?? "—"}</dd>
                <dd className="text-xs text-muted-foreground">
                  {formatBlockUnit(q.data.profile?.block_unit) ?? q.data.profile?.email ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Jumlah</dt>
                <dd className="font-mono text-base font-semibold">{formatIDR(bill.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Jatuh Tempo</dt>
                <dd>{formatShortDateID(bill.due_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Bukti Dikirim</dt>
                <dd>{bill.payment_submitted_at ? formatShortDateID(bill.payment_submitted_at) : "—"}</dd>
              </div>
            </dl>

            <Button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={bill.status === "lunas" || busy}
              className="w-full bg-success text-success-foreground hover:bg-success/90"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {bill.status === "lunas" ? "Sudah Lunas" : "Konfirmasi Lunas"}
            </Button>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <div>
                <h2 className="text-base font-semibold">Bukti Pembayaran</h2>
                <p className="text-xs text-muted-foreground">File penuh hanya dibuka setelah login.</p>
              </div>
              <Button variant="outline" size="sm" asChild disabled={!q.data.receiptUrl}>
                <a href={q.data.receiptUrl ?? "#"} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" /> Unduh
                </a>
              </Button>
            </div>
            <div className="flex min-h-[24rem] items-center justify-center bg-muted/30 p-4">
              {!q.data.receiptUrl ? (
                <p className="text-sm text-muted-foreground">Bukti pembayaran belum tersedia.</p>
              ) : isPdf ? (
                <iframe src={q.data.receiptUrl} className="h-[65vh] w-full rounded-md border bg-background" title="Bukti pembayaran" />
              ) : (
                <img
                  src={q.data.receiptUrl}
                  alt="Bukti pembayaran"
                  className="max-h-[65vh] max-w-full rounded-md border bg-background object-contain"
                />
              )}
            </div>
          </Card>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Konfirmasi pembayaran lunas?</DialogTitle>
            <DialogDescription>
              Status tagihan akan berubah menjadi Lunas dan penghuni terkait akan menerima notifikasi email.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button onClick={verifyPaid} disabled={busy} className="bg-success text-success-foreground hover:bg-success/90">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
