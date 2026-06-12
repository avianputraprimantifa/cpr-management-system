import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUploadButton } from "@/components/ui/file-upload-button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { M, ROLE_LABELS } from "@/lib/i18n/messages";
import { toProfilePhotoDataUrl } from "@/lib/profile-photo";
import { ACCEPT_IMAGES } from "@/lib/upload-file";

const schema = z.object({
  full_name: z.string().min(1, M.required),
  block_unit: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email(M.email),
});

type Values = z.infer<typeof schema>;

export default function AccountPage() {
  const { user, profile, roles, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(null);
  const isSatpam = roles.includes("satpam");
  const needsBlockUnit = !isSatpam;
  const name = profile?.full_name ?? user?.email ?? "Pengguna";
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const photoPreviewUrl = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  const avatarUrl = photoPreviewUrl ?? savedAvatarUrl ?? profile?.avatar_url ?? "";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("passwordChanged") === "1") {
      toast.success(M.passwordResetSuccess);
      navigate("/account", { replace: true });
      return;
    }
    const state = location.state as { passwordChanged?: boolean } | null;
    if (state?.passwordChanged) {
      toast.success(M.passwordResetSuccess);
      navigate("/account", { replace: true, state: {} });
    }
  }, [location.search, location.state, navigate]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      block_unit: "",
      phone: "",
      email: "",
    },
  });

  useEffect(() => {
    if (!profile && !user) return;
    form.reset({
      full_name: profile?.full_name ?? "",
      block_unit: profile?.block_unit ?? "",
      phone: profile?.phone ?? "",
      email: profile?.email ?? user?.email ?? "",
    });
  }, [profile, user, form]);

  useEffect(() => {
    if (!photoPreviewUrl) return undefined;
    return () => URL.revokeObjectURL(photoPreviewUrl);
  }, [photoPreviewUrl]);

  async function onSubmit(v: Values) {
    if (!user) return;

    const currentEmail = user.email ?? "";
    if (v.email.trim() !== currentEmail) {
      const { error: authError } = await supabase.auth.updateUser({ email: v.email.trim() });
      if (authError) {
        toast.error(`${M.saveFailed}: ${authError.message}`);
        return;
      }
      toast.info(M.emailChangeNotice);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: v.full_name.trim(),
        block_unit: needsBlockUnit ? (v.block_unit?.trim() || null) : null,
        phone: v.phone?.trim() || null,
        email: v.email.trim(),
      })
      .eq("user_id", user.id);

    if (profileError) {
      toast.error(`${M.saveFailed}: ${profileError.message}`);
      return;
    }

    if (photoFile) {
      try {
        const avatarDataUrl = await toProfilePhotoDataUrl(photoFile);
        const { error: profilePhotoError } = await supabase
          .from("profiles")
          .update({ avatar_url: avatarDataUrl })
          .eq("user_id", user.id);
        if (profilePhotoError) {
          toast.error(`${M.saveFailed}: ${profilePhotoError.message}`);
          return;
        }
        setSavedAvatarUrl(avatarDataUrl);
        setPhotoFile(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : M.fileCompressFailed);
        return;
      }
    }

    toast.success(M.saveSuccess);
    await refreshProfile();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan Akun</h1>
        <p className="text-sm text-muted-foreground">
          Kelola informasi profil dan email login Anda.
          {roles.length > 0 && (
            <span className="ml-1">
              Peran: {roles.map((r) => ROLE_LABELS[r]).join(", ")}.
            </span>
          )}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profil Singkat</CardTitle>
              <CardDescription>Foto profil bersifat opsional dan akan tampil di menu akun.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
              <Avatar className="h-20 w-20 border bg-card">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-4">
                <div>
                  <div className="text-lg font-semibold">{name}</div>
                  <div className="text-sm text-muted-foreground">
                    {roles.map((r) => ROLE_LABELS[r]).join(", ") || "Pengguna"}
                  </div>
                  <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    <span>{profile?.email ?? user?.email ?? "—"}</span>
                    <span>{profile?.phone ?? "No. HP belum diisi"}</span>
                    {needsBlockUnit && <span>Unit {profile?.block_unit ?? "belum diisi"}</span>}
                  </div>
                </div>
                <FileUploadButton
                  id="profile-photo"
                  accept={ACCEPT_IMAGES}
                  file={photoFile}
                  onChange={setPhotoFile}
                  label="Foto Profil"
                  buttonLabel="Pilih Foto"
                  buttonLabelChange="Ganti Foto"
                  hint="Opsional. JPG, PNG, atau HEIC. Foto akan dirapikan otomatis saat disimpan."
                  maxBytes={5 * 1024 * 1024}
                  disabled={form.formState.isSubmitting}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profil</CardTitle>
              <CardDescription>Nama dan kontak yang ditampilkan di sistem.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Lengkap</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className={needsBlockUnit ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>
                {needsBlockUnit && (
                  <FormField control={form.control} name="block_unit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Blok / Unit</FormLabel>
                      <FormControl><Input placeholder="mis. A-12" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>No. HP</FormLabel>
                    <FormControl><Input placeholder="08xxxxxxxxxx" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email Login</CardTitle>
              <CardDescription>Alamat email untuk masuk ke sistem.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormDescription>{M.emailChangeNotice}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Password
              </CardTitle>
              <CardDescription>
                Ubah password melalui email konfirmasi — tidak dapat diubah langsung di halaman ini.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link to="/account/password">Buka Halaman Ubah Password</Link>
              </Button>
            </CardContent>
          </Card>

          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Simpan Perubahan
          </Button>
        </form>
      </Form>
    </div>
  );
}
