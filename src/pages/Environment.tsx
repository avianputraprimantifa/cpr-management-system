import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Plus, Trees } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateID } from "@/lib/date";
import { ENV_CATEGORY_LABELS, ENV_STATUS_LABELS, M } from "@/lib/i18n/messages";
import { EnvItemDialog } from "@/components/environment/EnvItemDialog";

type EnvCategory = "sampah" | "kolam_renang" | "lainnya";
type EnvStatus = "baik" | "perlu_perhatian" | "bermasalah";
type EnvItem = {
  id: string;
  category: EnvCategory;
  title: string;
  status: EnvStatus;
  notes: string | null;
  item_date: string;
  photo_path: string | null;
  photo_url: string | null;
  updated_by: string | null;
  created_at: string;
};

const statusClass: Record<EnvStatus, string> = {
  baik:            "bg-success/15 text-success border-success/30",
  perlu_perhatian: "bg-warning/15 text-warning border-warning/30",
  bermasalah:      "bg-destructive/15 text-destructive border-destructive/30",
};

export default function EnvironmentPage() {
  const { hasRole } = useAuth();
  const canWrite = hasRole("admin", "pengurus", "satpam");
  const qc = useQueryClient();
  const [date, setDate] = useState<Date>(new Date());
  const [tab, setTab]   = useState<EnvCategory>("sampah");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EnvItem | null>(null);

  const dateStr = date.toISOString().slice(0, 10);

  const q = useQuery({
    queryKey: ["env-items", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("environment_items").select("*")
        .eq("item_date", dateStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Omit<EnvItem, "photo_url">[];

      return await Promise.all(rows.map(async (item) => {
        if (!item.photo_path) return { ...item, photo_url: null };
        const { data: signed, error: signedError } = await supabase.storage
          .from("environment-photos")
          .createSignedUrl(item.photo_path, 60 * 60);
        return {
          ...item,
          photo_url: signedError ? null : signed?.signedUrl ?? null,
        };
      })) as EnvItem[];
    },
  });

  const items = (cat: EnvCategory) => (q.data ?? []).filter((x) => x.category === cat);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lingkungan</h1>
          <p className="text-sm text-muted-foreground">Catatan harian fasilitas lingkungan.</p>
        </div>
        {canWrite && (
          <Button className="w-full sm:w-auto" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Catatan
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Pilih Tanggal</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="mx-auto w-fit max-w-full">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{formatDateID(date)}</p>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as EnvCategory)}>
          <TabsList className="grid h-auto w-full grid-cols-3 sm:w-auto">
            {(Object.keys(ENV_CATEGORY_LABELS) as EnvCategory[]).map((k) => (
              <TabsTrigger key={k} value={k} className="px-2 text-xs sm:px-3 sm:text-sm">
                {ENV_CATEGORY_LABELS[k]}
              </TabsTrigger>
            ))}
          </TabsList>
          {(Object.keys(ENV_CATEGORY_LABELS) as EnvCategory[]).map((k) => (
            <TabsContent key={k} value={k} className="space-y-3">
              {q.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : items(k).length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    <Trees className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    {M.noData} untuk {ENV_CATEGORY_LABELS[k]} pada tanggal ini.
                  </CardContent>
                </Card>
              ) : (
                items(k).map((it) => (
                  <Card key={it.id}>
                    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        {it.photo_url && (
                          <img
                            src={it.photo_url}
                            alt={`Foto ${it.title}`}
                            className="mb-3 aspect-video w-full rounded-md border bg-muted/30 object-contain sm:max-w-sm"
                          />
                        )}
                        {!it.photo_url && it.photo_path && (
                          <div className="mb-3 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                            Foto tersimpan belum bisa ditampilkan.
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{it.title}</span>
                          <Badge variant="outline" className={statusClass[it.status as EnvStatus]}>
                            {ENV_STATUS_LABELS[it.status as EnvStatus]}
                          </Badge>
                        </div>
                        {it.notes && (
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{it.notes}</p>
                        )}
                      </div>
                      {canWrite && (
                        <Button size="sm" variant="ghost" className="w-full sm:w-auto" onClick={() => { setEditing(it); setOpen(true); }}>Edit</Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <EnvItemDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        item={editing}
        defaultCategory={tab}
        defaultDate={dateStr}
        onSaved={() => qc.invalidateQueries({ queryKey: ["env-items"] })}
      />
    </div>
  );
}
