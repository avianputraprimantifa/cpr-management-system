import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type RoleKey = keyof typeof ROLE_LABELS;

const roleTone: Record<RoleKey, string> = {
  admin: "border-rose-200 bg-rose-50 text-rose-800",
  pengurus: "border-emerald-200 bg-emerald-50 text-emerald-800",
  penghuni: "border-sky-200 bg-sky-50 text-sky-800",
  satpam: "border-amber-200 bg-amber-50 text-amber-800",
};

function isRoleKey(role: string): role is RoleKey {
  return role in ROLE_LABELS;
}

export function RoleBadge({ role, className }: { role: string; className?: string }) {
  const knownRole = isRoleKey(role);
  return (
    <Badge
      variant="outline"
      className={cn(
        "min-w-[6.5rem] justify-center px-3 py-1 text-center",
        knownRole ? roleTone[role] : "border-muted bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      {knownRole ? ROLE_LABELS[role] : role}
    </Badge>
  );
}
