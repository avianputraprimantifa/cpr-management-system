import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateID } from "@/lib/date";
import { M } from "@/lib/i18n/messages";

type N = {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  read: boolean;
  created_at: string;
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as N[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const grouped = useMemo(() => {
    const m = new Map<string, N[]>();
    for (const n of q.data ?? []) {
      const day = n.created_at.slice(0, 10);
      const arr = m.get(day) ?? [];
      arr.push(n);
      m.set(day, arr);
    }
    return Array.from(m.entries());
  }, [q.data]);

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  }

  async function markAll() {
    if (!user) return;
    await supabase.from("notifications").update({ read: true })
      .eq("user_id", user.id).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
  }

  const unread = (q.data ?? []).filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifikasi</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} notifikasi belum dibaca.` : "Semua notifikasi sudah dibaca."}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="outline" className="w-full sm:w-auto" onClick={markAll}>
            <CheckCheck className="mr-2 h-4 w-4" /> Tandai semua dibaca
          </Button>
        )}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            {M.noData}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {formatDateID(day)}
              </h2>
              <div className="space-y-2">
                {items.map((n) => (
                  <Card
                    key={n.id}
                    className={`cursor-pointer transition-colors ${!n.read ? "border-primary/40 bg-primary/5" : ""}`}
                    onClick={() => !n.read && markRead(n.id)}
                  >
                    <CardContent className="flex gap-3 py-3">
                      <div className="mt-1">
                        <span
                          className={`inline-block h-2 w-2 rounded-full ${!n.read ? "bg-primary" : "bg-muted-foreground/30"}`}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{n.title}</div>
                        {n.body && <div className="text-sm text-muted-foreground mt-0.5">{n.body}</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
