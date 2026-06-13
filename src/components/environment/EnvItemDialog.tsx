import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ImageIcon, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileUploadButton } from "@/components/ui/file-upload-button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  ENV_CATEGORY_LABELS, ENV_STATUS_LABELS, M,
} from "@/lib/i18n/messages";

import { ACCEPT_IMAGES, acceptsEnvPhoto } from "@/lib/upload-file";

const schema = z.object({
  category: z.enum(["sampah", "kolam_renang", "lainnya"]),
  title: z.string().min(1, M.required),
  status: z.enum(["baik", "perlu_perhatian", "bermasalah"]),
  notes: z.string().optional(),
  item_date: z.string().min(1, M.required),
});
type Values = z.infer<typeof schema>;
type EnvItemDialogItem = {
  id: string;
  category: Values["category"];
  title: string;
  status: Values["status"];
  notes: string | null;
  item_date: string;
  photo_path: string | null;
  photo_url?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: EnvItemDialogItem | null;
  defaultCategory: "sampah" | "kolam_renang" | "lainnya";
  defaultDate: string;
  onSaved: () => void;
}

export function EnvItemDialog({ open, onOpenChange, item, defaultCategory, defaultDate, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = !!item;
  const [file, setFile] = useState<File | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: defaultCategory, title: "", status: "baik", notes: "", item_date: defaultDate,
    },
  });

  useEffect(() => {
    if (item) {
      form.reset({
        category: item.category, title: item.title, status: item.status,
        notes: item.notes ?? "", item_date: item.item_date,
      });
    } else {
      form.reset({
        category: defaultCategory, title: "", status: "baik", notes: "", item_date: defaultDate,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, open, defaultCategory, defaultDate]);

  function pickFile(f: File | null) {
    if (!f) return setFile(null);
    if (!acceptsEnvPhoto(f)) { toast.error(M.fileTypeInvalid); return; }
    setFile(f);
  }

  async function onSubmit(v: Values) {
    if (!user) return;
    let photo_path: string | null = item?.photo_path ?? null;
    if (file) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/env-${file.lastModified}-${file.size}.${ext}`;
      const up = await supabase.storage.from("environment-photos").upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (up.error) { toast.error(`${M.uploadFailed}: ${up.error.message}`); return; }
      photo_path = path;
    }

    const payload = { ...v, photo_path, updated_by: user.id };
    const res = isEdit
      ? await supabase.from("environment_items").update(payload).eq("id", item.id)
      : await supabase.from("environment_items").insert(payload);

    if (res.error) { toast.error(`${M.saveFailed}: ${res.error.message}`); return; }
    toast.success(M.saveSuccess);
    setFile(null);
    onOpenChange(false);
    onSaved();
  }

  async function onDelete() {
    if (!item) return;
    if (!confirm("Hapus catatan ini?")) return;
    const { error } = await supabase.from("environment_items").delete().eq("id", item.id);
    if (error) { toast.error(`${M.deleteFailed}: ${error.message}`); return; }
    toast.success(M.deleteSuccess);
    setFile(null);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setFile(null);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-hidden p-0 sm:max-w-lg">
        <div className="flex max-h-[calc(100dvh-1rem)] min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6">
            <DialogTitle>{isEdit ? "Edit Catatan" : "Tambah Catatan Lingkungan"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategori</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {(Object.keys(ENV_CATEGORY_LABELS) as Array<keyof typeof ENV_CATEGORY_LABELS>).map((k) => (
                            <SelectItem key={k} value={k}>{ENV_CATEGORY_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {(Object.keys(ENV_STATUS_LABELS) as Array<keyof typeof ENV_STATUS_LABELS>).map((k) => (
                            <SelectItem key={k} value={k}>{ENV_STATUS_LABELS[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="item_date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tanggal</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Judul</FormLabel>
                    <FormControl><Input placeholder="mis. Sampah depan blok A" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catatan</FormLabel>
                    <FormControl><Textarea rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {item?.photo_url && !file && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      Foto tersimpan
                    </div>
                    <img
                      src={item.photo_url}
                      alt={`Foto ${item.title}`}
                      className="max-h-56 w-full rounded-lg border bg-muted/30 object-contain"
                    />
                  </div>
                )}

                <FileUploadButton
                  label="Foto (opsional)"
                  hint="JPG, PNG, HEIC (iPhone) — dikompres otomatis jika > 5MB."
                  accept={ACCEPT_IMAGES}
                  file={file}
                  onChange={pickFile}
                  buttonLabel={item?.photo_url ? "Ganti Foto" : "Unggah Foto"}
                  buttonLabelChange="Ganti Foto"
                />
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:gap-2 sm:px-6 [&>button]:w-full sm:[&>button]:w-auto">
                {isEdit && (
                  <Button type="button" variant="destructive" onClick={onDelete}>Hapus</Button>
                )}
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Simpan
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
