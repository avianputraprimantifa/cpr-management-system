import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trees } from "lucide-react";
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
  const [editing, setEditing] = useState<any | null>(null);

  const dateStr = date.toISOString().slice(0, 10);

  const q = useQuery({
    queryKey: ["env-items", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("environment_items").select("*")
        .eq("item_date", dateStr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const items = (cat: EnvCategory) => (q.data ?? []).filter((x) => x.category === cat);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lingkungan</h1>
          <p className="text-sm text-muted-foreground">Catatan harian fasilitas lingkungan.</p>
        </div>
        {canWrite && (
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Catatan
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Pilih Tanggal</CardTitle></CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
            />
            <p className="mt-3 text-xs text-muted-foreground">{formatDateID(date)}</p>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as EnvCategory)}>
          <TabsList>
            {(Object.keys(ENV_CATEGORY_LABELS) as EnvCategory[]).map((k) => (
              <TabsTrigger key={k} value={k}>{ENV_CATEGORY_LABELS[k]}</TabsTrigger>
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
                    <CardContent className="py-4 flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
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
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>Edit</Button>
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
