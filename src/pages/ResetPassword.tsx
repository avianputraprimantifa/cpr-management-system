import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { BrandMark } from "@/components/BrandMark";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { redirectAfterPasswordChange, setUserPassword } from "@/lib/auth-password";
import { M } from "@/lib/i18n/messages";

const schema = z
  .object({
    password: z.string().min(8, M.minPassword),
    confirm: z.string().min(1, M.required),
  })
  .refine((v) => v.password === v.confirm, {
    message: M.passwordMismatch,
    path: ["confirm"],
  });

type Values = z.infer<typeof schema>;

async function waitForRecoverySession(maxMs = 4000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session?.access_token) {
        setReady(true);
        setChecking(false);
      }
    });

    (async () => {
      const hasSession = await waitForRecoverySession();
      if (!mounted) return;
      setReady(hasSession);
      setChecking(false);
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(v: Values) {
    setSaving(true);
    const result = await setUserPassword(v.password);
    if (!result.ok) {
      toast.error(`${M.saveFailed}: ${result.error}`);
      setSaving(false);
      return;
    }
    redirectAfterPasswordChange();
  }

  if (checking) {
    return (
      <div className="login-shell flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="login-shell flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Tautan Tidak Valid</CardTitle>
            <CardDescription>
              Tautan reset password tidak ditemukan atau sudah kedaluwarsa. Minta email baru dari halaman pengaturan.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button asChild>
              <Link to="/account/password">Minta Email Reset</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/login">Kembali ke Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="login-shell flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <BrandMark className="mx-auto mb-2 h-14 w-14 bg-white/80" imageClassName="p-0.5" />
          <CardTitle>Password Baru</CardTitle>
          <CardDescription>Masukkan password baru untuk akun Carlton Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password Baru</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="confirm" render={({ field }) => (
                <FormItem>
                  <FormLabel>Konfirmasi Password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  "Simpan Password Baru"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
