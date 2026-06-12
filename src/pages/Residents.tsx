import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera, Home, Loader2, Mail, Phone, Plus, ShieldCheck, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error";
import { ROLE_LABELS, M } from "@/lib/i18n/messages";
import { formatShortDateID } from "@/lib/date";
import { toProfilePhotoDataUrl } from "@/lib/profile-photo";
import { ACCEPT_IMAGES, isRasterImageFile } from "@/lib/upload-file";
import { ResidentFormDialog } from "@/components/residents/ResidentFormDialog";

type StatusFilter = "all" | "aktif" | "nonaktif";
type ResidentRow = {
  user_id: string;
  avatar_url: string | null;
  full_name: string | null;
  block_unit: string | null;
  phone: string | null;
  email: string | null;
  status: "aktif" | "nonaktif";
  created_at: string;
  roles: string[];
};

type AdminDeleteResponse = {
  error?: string;
};

type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function readStatusFilter(value: string | null): StatusFilter {
  return value === "aktif" || value === "nonaktif" ? value : "all";
}

function isMissingAvatarColumn(error: { code?: string; message?: string }) {
  return error.code === "42703" || /avatar_url|schema cache/i.test(error.message ?? "");
}

function satpamPhotoErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  const dbError = error as DatabaseError;
  if (isMissingAvatarColumn(dbError)) {
    return "Kolom avatar_url belum ada di database. Jalankan migration add_profile_avatar_url terlebih dahulu.";
  }
  return dbError.message ?? "Foto satpam gagal disimpan. Periksa koneksi atau konfigurasi database.";
}

export default function ResidentsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const canManageSatpamPhoto = hasRole("admin", "pengurus");
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = readStatusFilter(searchParams.get("status"));
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ResidentRow | null>(null);
  const [viewing, setViewing] = useState<ResidentRow | null>(null);
  const [satpamPhotoFile, setSatpamPhotoFile] = useState<File | null>(null);
  const [satpamPhotoBusy, setSatpamPhotoBusy] = useState(false);
  const satpamPhotoInputRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["residents-list"],
    queryFn: async () => {
      const withAvatar = await supabase
        .from("profiles")
        .select("user_id, avatar_url, full_name, block_unit, phone, email, status, created_at")
        .order("full_name");
      const withoutAvatar = withAvatar.error && isMissingAvatarColumn(withAvatar.error)
        ? await supabase
          .from("profiles")
          .select("user_id, full_name, block_unit, phone, email, status, created_at")
          .order("full_name")
        : null;
      if (withAvatar.error && !withoutAvatar) throw withAvatar.error;
      if (withoutAvatar?.error) throw withoutAvatar.error;
      const profiles = (withAvatar.data ?? withoutAvatar?.data ?? []).map((profile) => ({
        ...profile,
        avatar_url: "avatar_url" in profile ? profile.avatar_url : null,
      }));
      const ids = (profiles ?? []).map((p) => p.user_id);
      if (ids.length === 0) return [];
      const { data: roles } = await supabase
        .from("user_roles").select("user_id, role").in("user_id", ids);
      const byUser = new Map<string, string[]>();
      for (const r of roles ?? []) {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role);
        byUser.set(r.user_id, arr);
      }
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.user_id) ?? [] })) as ResidentRow[];
    },
  });

  async function toggleStatus(p: ResidentRow) {
    const newStatus = p.status === "aktif" ? "nonaktif" : "aktif";
    const { error } = await supabase
      .from("profiles").update({ status: newStatus }).eq("user_id", p.user_id);
    if (error) { toast.error(`${M.saveFailed}: ${error.message}`); return; }
    toast.success(M.saveSuccess);
    qc.invalidateQueries({ queryKey: ["residents-list"] });
  }

  async function hardDelete(p: ResidentRow) {
    if (!isAdmin) return;
    if (!confirm(`Hapus permanen akun ${p.full_name ?? p.email}?\nTindakan ini tidak dapat dibatalkan.`)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: p.user_id },
    });
    const result = data as AdminDeleteResponse | null;
    if (error || result?.error) {
      toast.error(result?.error ?? edgeFunctionErrorMessage(error, "admin-delete-user", M.deleteFailed));
      return;
    }
    toast.success(M.deleteSuccess);
    qc.invalidateQueries({ queryKey: ["residents-list"] });
  }

  function updateStatusFilter(next: StatusFilter) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "all") nextParams.delete("status");
    else nextParams.set("status", next);
    setSearchParams(nextParams, { replace: true });
  }

  const people = q.data ?? [];
  const filteredPeople = people.filter((p) => statusFilter === "all" || p.status === statusFilter);
  const residentRows = filteredPeople.filter((p) => !p.roles.includes("satpam"));
  const guardRows = filteredPeople.filter((p) => p.roles.includes("satpam"));
  const viewingName = viewing?.full_name ?? viewing?.email ?? "Pengguna";
  const viewingInitials = viewingName
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const viewingIsSatpam = Boolean(viewing?.roles.includes("satpam"));
  const viewingAvatarUrl = viewing?.avatar_url ?? "";

  async function saveSatpamPhoto() {
    if (!viewing || !satpamPhotoFile || !viewingIsSatpam || !canManageSatpamPhoto) return;
    setSatpamPhotoBusy(true);
    try {
      const avatarUrl = await toProfilePhotoDataUrl(satpamPhotoFile);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("user_id", viewing.user_id);
      if (error) throw error;
      toast.success("Foto satpam diperbarui.");
      setSatpamPhotoFile(null);
      setViewing({ ...viewing, avatar_url: avatarUrl });
      qc.invalidateQueries({ queryKey: ["residents-list"] });
    } catch (error) {
      toast.error(satpamPhotoErrorMessage(error));
    } finally {
      setSatpamPhotoBusy(false);
    }
  }

  function pickSatpamPhoto(file: File | null) {
    if (!file) {
      setSatpamPhotoFile(null);
      return;
    }
    if (!isRasterImageFile(file)) {
      toast.error("Hanya file JPG, PNG, atau HEIC yang diperbolehkan.");
      setSatpamPhotoFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(M.fileTooLarge);
      setSatpamPhotoFile(null);
      return;
    }
    setSatpamPhotoFile(file);
  }

  const renderTable = (
    rows: typeof people,
    title: string,
    description: string,
  ) => (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama</TableHead>
            <TableHead>Blok / Unit</TableHead>
            <TableHead>Peran</TableHead>
            <TableHead>Kontak</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading && (
            <TableRow><TableCell colSpan={6}><Skeleton className="h-12 w-full" /></TableCell></TableRow>
          )}
          {!q.isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                {M.noData}
              </TableCell>
            </TableRow>
          )}
          {rows.map((p) => (
            <TableRow key={p.user_id}>
              <TableCell className="font-medium">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-8 w-8 border bg-card">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.full_name ?? p.email ?? "Profil"} />}
                    <AvatarFallback className="bg-primary text-[0.7rem] text-primary-foreground">
                      {(p.full_name ?? p.email ?? "?")
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => {
                      setSatpamPhotoFile(null);
                      setViewing(p);
                    }}
                    className="min-w-0 truncate text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {p.full_name ?? "—"}
                  </button>
                </div>
              </TableCell>
              <TableCell>{p.block_unit ?? "—"}</TableCell>
              <TableCell className="space-x-1">
                {p.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                {p.roles.map((r: string) => (
                  <Badge key={r} variant="outline">{ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}</Badge>
                ))}
              </TableCell>
              <TableCell>
                <div className="text-sm">{p.email}</div>
                <div className="text-xs text-muted-foreground">{p.phone ?? "—"}</div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={
                  p.status === "aktif"
                    ? "bg-success/15 text-success border-success/30"
                    : "bg-muted text-muted-foreground"
                }>
                  {p.status === "aktif" ? "Aktif" : "Nonaktif"}
                </Badge>
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => toggleStatus(p)}>
                  {p.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="destructive" onClick={() => hardDelete(p)}>Hapus</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Penghuni</h1>
          <p className="text-sm text-muted-foreground">
            Kelola data penghuni, satpam, dan pengurus.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => updateStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="aktif">Aktif</SelectItem>
              <SelectItem value="nonaktif">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Tambah Penghuni
            </Button>
          )}
        </div>
      </div>

      {renderTable(
        residentRows,
        "Penghuni",
        "Akun admin, pengurus, dan penghuni yang terkait dengan unit hunian.",
      )}

      {renderTable(
        guardRows,
        "Satpam",
        "Akun petugas keamanan yang bertugas di lingkungan Carlton.",
      )}

      <ResidentFormDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        resident={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["residents-list"] })}
      />

      <Dialog open={!!viewing} onOpenChange={(v) => {
        if (!v) {
          setSatpamPhotoFile(null);
          setViewing(null);
        }
      }}>
        <DialogContent className="sm:max-w-xl">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>Profil Akun</DialogTitle>
                <DialogDescription>
                  Ringkasan data profil yang tercatat di sistem.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <Avatar className="h-24 w-24 border bg-card">
                  {viewingAvatarUrl && <AvatarImage src={viewingAvatarUrl} alt={viewingName} />}
                  <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                    {viewingInitials || "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <div className="text-xl font-semibold">{viewingName}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {viewing.roles.length === 0 && (
                        <Badge variant="outline">Tanpa Peran</Badge>
                      )}
                      {viewing.roles.map((r: string) => (
                        <Badge key={r} variant="outline">
                          {ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}
                        </Badge>
                      ))}
                      <Badge variant="outline" className={
                        viewing.status === "aktif"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-muted text-muted-foreground"
                      }>
                        {viewing.status === "aktif" ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div className="flex gap-2">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">Email</div>
                        <div className="truncate">{viewing.email ?? "—"}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">No. HP</div>
                        <div>{viewing.phone ?? "—"}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Home className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Blok / Unit</div>
                        <div>{viewing.block_unit ?? "—"}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Terdaftar</div>
                        <div>{viewing.created_at ? formatShortDateID(viewing.created_at) : "—"}</div>
                      </div>
                    </div>
                  </div>

                  {!viewingAvatarUrl && (
                    <p className="text-xs text-muted-foreground">
                      Foto profil belum tersedia untuk akun ini.
                    </p>
                  )}

                  {viewingIsSatpam && canManageSatpamPhoto && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Camera className="h-4 w-4 text-primary" />
                            Foto Satpam
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Admin dan Pengurus dapat mengganti foto khusus akun Satpam dari halaman ini.
                          </p>
                        </div>
                        <input
                          ref={satpamPhotoInputRef}
                          id={`satpam-photo-${viewing.user_id}`}
                          type="file"
                          accept={ACCEPT_IMAGES}
                          disabled={satpamPhotoBusy}
                          className="sr-only"
                          onChange={(event) => {
                            pickSatpamPhoto(event.target.files?.[0] ?? null);
                            event.target.value = "";
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => satpamPhotoInputRef.current?.click()}
                            disabled={satpamPhotoBusy}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            {satpamPhotoFile || viewingAvatarUrl ? "Ganti Foto" : "Pilih Foto"}
                          </Button>
                          {satpamPhotoFile && (
                            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs">
                              <span className="max-w-[14rem] truncate font-medium" title={satpamPhotoFile.name}>
                                {satpamPhotoFile.name}
                              </span>
                              <span className="text-muted-foreground">
                                {(satpamPhotoFile.size / 1024).toFixed(0)} KB
                              </span>
                              <button
                                type="button"
                                aria-label="Hapus foto satpam"
                                onClick={() => setSatpamPhotoFile(null)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Opsional. JPG, PNG, atau HEIC. Foto akan dirapikan otomatis saat disimpan.
                        </p>
                        <Button
                          size="sm"
                          onClick={saveSatpamPhoto}
                          disabled={!satpamPhotoFile || satpamPhotoBusy}
                        >
                          {satpamPhotoBusy ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Camera className="mr-2 h-4 w-4" />
                          )}
                          Simpan Foto Satpam
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
