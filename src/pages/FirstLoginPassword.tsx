import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { markPasswordSetupComplete, setUserPassword } from "@/lib/auth-password";
import { M } from "@/lib/i18n/messages";

const schema = z
  .object({
    password: z.string().min(8, M.minPassword),
    confirm: z.string().min(1, M.required),
  })
  .refine((value) => value.password === value.confirm, {
    message: M.passwordMismatch,
    path: ["confirm"],
  });

type Values = z.infer<typeof schema>;

export default function FirstLoginPasswordPage() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [confirmKeepOpen, setConfirmKeepOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  if (profile && !profile.must_reset_password) {
    return <Navigate to="/dashboard" replace />;
  }

  async function finish(mode: "changed" | "kept") {
    const result = await markPasswordSetupComplete(mode);
    if (!result.ok) {
      toast.error(`${M.saveFailed}: ${result.error}`);
      return false;
    }
    await refreshProfile();
    return true;
  }

  async function onSubmit(values: Values) {
    setSaving(true);
    const passwordResult = await setUserPassword(values.password);
    if (!passwordResult.ok) {
      toast.error(`${M.saveFailed}: ${passwordResult.error}`);
      setSaving(false);
      return;
    }
    if (await finish("changed")) {
      toast.success("Password baru berhasil disimpan.");
      navigate("/dashboard", { replace: true });
    }
    setSaving(false);
  }

  async function keepPassword() {
    setSaving(true);
    if (await finish("kept")) {
      toast.success("Password awal tetap digunakan. Anda dapat mengubahnya nanti dari Pengaturan Akun.");
      navigate("/dashboard", { replace: true });
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <CardTitle>Amankan Password Akun</CardTitle>
            <CardDescription>
              Akun Anda dibuat dengan password awal. Untuk keamanan, sebaiknya buat password baru sebelum lanjut.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password Baru</FormLabel>
                  <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="confirm" render={({ field }) => (
                <FormItem>
                  <FormLabel>Konfirmasi Password Baru</FormLabel>
                  <FormControl><PasswordInput autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={saving} className="sm:flex-1">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan Password Baru
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setConfirmKeepOpen(true)}
                  className="sm:flex-1"
                >
                  Tetap Gunakan Password Saat Ini
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Dialog open={confirmKeepOpen} onOpenChange={setConfirmKeepOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tetap gunakan password awal?</DialogTitle>
            <DialogDescription>
              Password awal biasanya diketahui oleh pembuat akun. Jika Anda tetap melanjutkan, ingat bahwa
              password masih bisa diganti kapan saja dari Pengaturan Akun.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmKeepOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={keepPassword} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Tetap Gunakan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
