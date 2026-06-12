import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DevEmailPreview } from "@/components/account/DevEmailPreview";
import { supabase } from "@/integrations/supabase/client";
import { redirectAfterPasswordChange, setUserPassword } from "@/lib/auth-password";
import { useAuth } from "@/lib/auth";
import { buildRecoveryEmailPreview, type RecoveryEmailPreview } from "@/lib/recovery-email-preview";
import { M } from "@/lib/i18n/messages";

export default function AccountPasswordPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const email = profile?.email ?? user?.email ?? "";
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailPreview, setEmailPreview] = useState<RecoveryEmailPreview | null>(null);
  const [devPassword, setDevPassword] = useState("");
  const [devBusy, setDevBusy] = useState(false);
  const isDev = import.meta.env.DEV;

  async function sendResetEmail() {
    if (!email) {
      toast.error("Email akun tidak ditemukan.");
      return;
    }
    setBusy(true);
    setEmailPreview(null);
    const redirectTo = `${window.location.origin}/reset-password`;

    if (isDev) {
      const { data, error } = await supabase.functions.invoke("dev-recovery-preview", {
        body: { redirectTo },
      });
      setBusy(false);
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error ?? error?.message ?? M.saveFailed);
        return;
      }
      const link = (data as { action_link: string }).action_link;
      setEmailPreview(buildRecoveryEmailPreview(email, link));
      setSent(true);
      toast.success("Email simulasi ditampilkan di bawah (mode dev).");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    if (error) {
      toast.error(`${M.saveFailed}: ${error.message}`);
      return;
    }
    setSent(true);
    toast.success(M.passwordResetEmailSent);
  }

  async function devSetPassword() {
    if (devPassword.length < 8) {
      toast.error(M.minPassword);
      return;
    }
    setDevBusy(true);
    const result = await setUserPassword(devPassword);
    setDevBusy(false);
    if (!result.ok) {
      toast.error(`${M.saveFailed}: ${result.error}`);
      return;
    }
    setDevPassword("");
    redirectAfterPasswordChange();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link to="/account">
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Pengaturan Akun
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Ubah Password</h1>
        <p className="text-sm text-muted-foreground">
          Untuk keamanan, perubahan password dilakukan melalui tautan yang dikirim ke email Anda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Kirim Tautan Reset Password
          </CardTitle>
          <CardDescription>
            Kami akan mengirim email berisi tautan aman. Buka tautan tersebut untuk menetapkan password baru.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email akun</Label>
            <Input value={email} readOnly disabled className="bg-muted" />
          </div>

          {sent && !isDev && (
            <Alert>
              <AlertTitle>Email terkirim</AlertTitle>
              <AlertDescription>{M.passwordResetEmailSent}</AlertDescription>
            </Alert>
          )}

          {isDev && (
            <Alert className="border-warning/40 bg-warning/5">
              <AlertTitle>Mode pengembang</AlertTitle>
              <AlertDescription>
                Email sungguhan tidak dikirim. Setelah menekan tombol, isi email akan muncul di kartu
                &quot;Bypass Pengujian&quot; di bawah — gunakan tautan di sana untuk menguji alur reset.
              </AlertDescription>
            </Alert>
          )}

          <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
            <li>Klik tombol di bawah untuk meminta email reset password.</li>
            <li>Buka kotak masuk (dan folder spam) untuk email dari Carlton.</li>
            <li>Klik tautan di email, lalu masukkan password baru.</li>
          </ol>

          <Button onClick={sendResetEmail} disabled={busy || !email} className="w-full sm:w-auto">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Kirim Email Ubah Password
          </Button>
        </CardContent>
      </Card>

      {isDev && (
        <Card className="border-dashed border-warning/60 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-warning">
              <FlaskConical className="h-4 w-4" /> Bypass Pengujian (Dev)
            </CardTitle>
            <CardDescription>
              Hanya di <code className="text-xs">npm run dev</code>. Setelah &quot;Kirim Email Ubah
              Password&quot;, simulasi kotak masuk muncul di sini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {emailPreview ? (
              <DevEmailPreview preview={emailPreview} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Belum ada pratinjau. Tekan &quot;Kirim Email Ubah Password&quot; untuk memuat simulasi email.
              </p>
            )}

            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                Atau set password langsung tanpa tautan:
              </p>
              <div className="space-y-2">
                <Label htmlFor="dev-password">Password baru (min. 8 karakter)</Label>
                <PasswordInput
                  id="dev-password"
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={devSetPassword}
                disabled={devBusy || devPassword.length < 8}
              >
                {devBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Set Password Langsung
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
