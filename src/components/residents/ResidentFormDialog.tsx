import { useEffect } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { edgeFunctionErrorMessage } from "@/lib/edge-function-error";
import { M, ROLE_LABELS } from "@/lib/i18n/messages";

const createSchema = z.object({
  email: z.string().email(M.email),
  password: z.string().min(8, M.minPassword),
  full_name: z.string().min(1, M.required),
  block_unit: z.string().optional(),
  phone: z.string().optional(),
  role: z.enum(["pengurus", "penghuni", "satpam"]),
});

const editSchema = z.object({
  full_name: z.string().min(1, M.required),
  block_unit: z.string().optional(),
  phone: z.string().optional(),
});

type ResidentRole = "admin" | "pengurus" | "penghuni" | "satpam";
type CreatableResidentRole = Exclude<ResidentRole, "admin">;
type ResidentFormValues = {
  email: string;
  password: string;
  full_name: string;
  block_unit: string;
  phone: string;
  role: CreatableResidentRole;
};
type ResidentFormResident = {
  user_id: string;
  full_name: string | null;
  block_unit: string | null;
  phone: string | null;
  roles: string[];
};
type AdminCreateUserResponse = {
  error?: string;
  user_id?: string;
  email?: string;
  role?: CreatableResidentRole;
};

const CREATABLE_ROLES: CreatableResidentRole[] = ["pengurus", "penghuni", "satpam"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resident: ResidentFormResident | null;
  onSaved: () => void;
}

export function ResidentFormDialog({ open, onOpenChange, resident, onSaved }: Props) {
  const { hasRole } = useAuth();
  const canCreateAccounts = hasRole("admin", "pengurus");
  const isEdit = !!resident;
  const schema = isEdit ? editSchema : createSchema;
  const editingIsSatpam = isEdit && Array.isArray(resident?.roles) && resident.roles.includes("satpam");

  const form = useForm<ResidentFormValues>({
    resolver: zodResolver(schema) as Resolver<ResidentFormValues>,
    defaultValues: {
      email: "", password: "", full_name: "", block_unit: "", phone: "", role: "penghuni",
    },
  });

  const selectedRole = useWatch({ control: form.control, name: "role" });
  // Hide Blok/Unit for satpam (they work here, not live here).
  const needsBlockUnit = isEdit ? !editingIsSatpam : selectedRole !== "satpam";

  useEffect(() => {
    if (isEdit && resident) {
      form.reset({
        email: "",
        password: "",
        full_name: resident.full_name ?? "",
        block_unit: resident.block_unit ?? "",
        phone: resident.phone ?? "",
        role: "penghuni",
      });
    } else {
      form.reset({
        email: "", password: "", full_name: "", block_unit: "", phone: "", role: "penghuni",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resident, open]);

  // When admin switches role to satpam, clear any stale Blok/Unit so it isn't submitted.
  useEffect(() => {
    if (!isEdit && selectedRole === "satpam") form.setValue("block_unit", "");
  }, [selectedRole, isEdit, form]);

  async function onSubmit(v: ResidentFormValues) {
    if (isEdit) {
      const { error } = await supabase.from("profiles").update({
        full_name: v.full_name,
        block_unit: needsBlockUnit ? (v.block_unit || null) : null,
        phone: v.phone || null,
      }).eq("user_id", resident.user_id);
      if (error) { toast.error(`${M.saveFailed}: ${error.message}`); return; }
      toast.success(M.saveSuccess);
    } else {
      if (!canCreateAccounts) { toast.error(M.unauthorized); return; }
      const payload = {
        ...v,
        block_unit: needsBlockUnit ? (v.block_unit?.trim() || null) : null,
        phone: v.phone?.trim() || null,
      };
      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
      const result = data as AdminCreateUserResponse | null;
      if (error || result?.error) {
        toast.error(result?.error ?? edgeFunctionErrorMessage(error, "admin-create-user", M.saveFailed));
        return;
      }
      toast.success(M.saveSuccess);
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Penghuni" : "Tambah Penghuni"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Perbarui data profil penghuni." : "Pilih peran terlebih dahulu — formulir akan menyesuaikan."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!isEdit && (
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Peran</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CREATABLE_ROLES.map((k) => (
                        <SelectItem key={k} value={k}>{ROLE_LABELS[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {!isEdit && (
              <>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password Awal</FormLabel>
                    <FormControl><PasswordInput placeholder="min. 8 karakter" autoComplete="new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}
            <FormField control={form.control} name="full_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Nama Lengkap</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className={needsBlockUnit ? "grid grid-cols-2 gap-3" : ""}>
              {needsBlockUnit && (
                <FormField control={form.control} name="block_unit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blok / Unit</FormLabel>
                    <FormControl><Input placeholder="A1 / 12" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>No. HP</FormLabel>
                  <FormControl><Input placeholder="08xxx" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter>
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
