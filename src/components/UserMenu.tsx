import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { M, ROLE_LABELS } from "@/lib/i18n/messages";

export function UserMenu() {
  const { profile, user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const name = profile?.full_name ?? user?.email ?? "Pengguna";
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const avatarUrl = typeof user?.user_metadata?.avatar_url === "string"
    ? user.user_metadata.avatar_url
    : "";
  const profileAvatarUrl = profile?.avatar_url ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="h-7 w-7">
            {(profileAvatarUrl || avatarUrl) && <AvatarImage src={profileAvatarUrl || avatarUrl} alt={name} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm font-medium md:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium leading-none">{name}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {roles.map((r) => ROLE_LABELS[r]).join(", ") || "—"}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/account")}>
          <Settings className="mr-2 h-4 w-4" /> Pengaturan Akun
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            toast.success(M.logoutSuccess);
            navigate("/login", { replace: true });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
