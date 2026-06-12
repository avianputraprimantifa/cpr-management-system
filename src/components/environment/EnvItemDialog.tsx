import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: any | null;
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
    setFile(null);
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
      const path = `${user.id}/env-${Date.now()}.${ext}`;
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
    onOpenChange(false);
    onSaved();
  }

  async function onDelete() {
    if (!item) return;
    if (!confirm("Hapus catatan ini?")) return;
    const { error } = await supabase.from("environment_items").delete().eq("id", item.id);
    if (error) { toast.error(`${M.deleteFailed}: ${error.message}`); return; }
    toast.success(M.deleteSuccess);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Catatan" : "Tambah Catatan Lingkungan"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
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

            <FileUploadButton
              label="Foto (opsional)"
              hint="JPG, PNG, HEIC (iPhone) — dikompres otomatis jika > 5MB."
              accept={ACCEPT_IMAGES}
              file={file}
              onChange={pickFile}
              buttonLabel="Unggah Foto"
              buttonLabelChange="Ganti Foto"
            />

            <DialogFooter className="gap-2 sm:gap-2">
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
      </DialogContent>
    </Dialog>
  );
}
