import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import carltonFullLogo from "@/assets/carlton-full-logo.png";
import { useAuth } from "@/lib/auth";
import { M } from "@/lib/i18n/messages";

const schema = z.object({
  email: z.string().min(1, M.required).email(M.email),
  password: z.string().min(8, M.minPassword),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { user, isLoading, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) navigate("/dashboard", { replace: true });
  }, [user, isLoading, navigate]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    const { error } = await signIn(values.email, values.password);
    if (error) { toast.error(error || M.loginFailed); return; }
    toast.success(M.loginSuccess);
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="login-shell flex min-h-svh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card className="w-full bg-card/95">
          <CardHeader className="space-y-4 text-center">
            <img
              src={carltonFullLogo}
              alt="Carlton Private Residence"
              draggable={false}
              className="mx-auto h-auto w-full max-w-[18rem]"
            />
            <div>
              <CardTitle className="text-2xl">Residence Management System</CardTitle>
              <CardDescription className="mt-2">Masuk untuk melanjutkan</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" autoComplete="email" placeholder="nama@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <PasswordInput autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Masuk
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Akun baru hanya dapat dibuat oleh admin.
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
