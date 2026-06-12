import { NavLink, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import {
  Bell, ChevronLeft, ChevronRight, LayoutDashboard, LogOut, Receipt, Settings, ShieldCheck, Trees, Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";
import carltonIcon from "@/assets/carlton-icon.png";
import carltonFullLogo from "@/assets/carlton-full-logo.png";
import { useAuth, type AppRole } from "@/lib/auth";
import { M } from "@/lib/i18n/messages";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles: AppRole[];
}

const ITEMS: NavItem[] = [
  { label: "Dashboard",     to: "/dashboard",     icon: LayoutDashboard, roles: ["admin", "pengurus", "penghuni", "satpam"] },
  { label: "Tagihan IPL",   to: "/ipl",           icon: Receipt,         roles: ["admin", "pengurus", "penghuni"] },
  { label: "Penghuni",      to: "/residents",     icon: Users,           roles: ["admin", "pengurus"] },
  { label: "Lingkungan",    to: "/environment",   icon: Trees,           roles: ["admin", "pengurus", "penghuni", "satpam"] },
  { label: "Jadwal Satpam", to: "/shifts",        icon: ShieldCheck,     roles: ["admin", "pengurus", "satpam"] },
  { label: "Notifikasi",    to: "/notifications", icon: Bell,            roles: ["admin", "pengurus", "penghuni", "satpam"] },
  { label: "Pengaturan Akun", to: "/account",       icon: Settings,        roles: ["admin", "pengurus", "penghuni", "satpam"] },
];

export function AppSidebar() {
  const { roles, signOut } = useAuth();
  const navigate = useNavigate();
  const { isMobile, setOpen, setOpenMobile, state } = useSidebar();
  const visible = ITEMS.filter((it) => it.roles.some((r) => roles.includes(r)));
  const isExpanded = state === "expanded";

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleDesktopToggle = () => {
    setOpen(!isExpanded);
  };

  const handleDesktopCollapse = () => {
    setOpen(false);
  };

  const handleLogout = async () => {
    await signOut();
    if (isMobile) setOpenMobile(false);
    toast.success(M.logoutSuccess);
    navigate("/login", { replace: true });
  };

  return (
    <Sidebar collapsible="icon" className="z-40 border-r border-sidebar-border/80">
      <SidebarHeader className="relative overflow-visible border-b border-sidebar-border/70 px-0 py-4">
        <div className="relative hidden h-14 w-full items-center justify-center overflow-visible lg:flex">
          {!isExpanded && (
            <button
              type="button"
              aria-label="Tampilkan menu"
              aria-expanded={false}
              title="Tampilkan menu"
              onClick={handleDesktopToggle}
              className="group/carlton-toggle absolute right-1 top-1/2 z-20 h-12 w-[4.5rem] -translate-y-1/2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
            >
              <span className="relative flex h-full w-full items-center overflow-hidden rounded-lg bg-card/90 text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border transition-colors duration-200 group-hover/carlton-toggle:bg-sidebar-accent group-hover/carlton-toggle:text-sidebar-accent-foreground">
                <img
                  src={carltonIcon}
                  alt=""
                  draggable={false}
                  className="h-full w-12 shrink-0 object-contain p-0.5"
                />
                <ChevronRight className="ml-auto mr-0.5 h-4 w-4 shrink-0" />
              </span>
            </button>
          )}
          <button
            type="button"
            aria-label="Sembunyikan menu lewat logo Carlton"
            aria-expanded={true}
            title="Sembunyikan menu"
            onClick={handleDesktopCollapse}
            className={`rounded-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
              isExpanded ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"
            }`}
          >
            <img
              src={carltonFullLogo}
              alt="Carlton Private Residence"
              draggable={false}
              className="h-12 w-auto max-w-[12rem] object-contain"
            />
          </button>
          {isExpanded && (
            <button
              type="button"
              aria-label="Sembunyikan menu"
              aria-expanded={true}
              title="Sembunyikan menu"
              onClick={handleDesktopToggle}
              className="absolute -right-3 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-sidebar-border bg-card text-sidebar-foreground shadow-sm transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-3 px-3 group-data-[collapsible=icon]:justify-center lg:hidden">
          <BrandMark className="h-10 w-10 shrink-0 bg-card/70" imageClassName="p-0.5" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-base font-bold text-sidebar-foreground">Carlton</div>
            <div className="truncate text-xs text-sidebar-foreground/70">Private Residence</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-1 py-3">
        <SidebarGroup>
          <SidebarGroupLabel>Area Rumah</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((it) => (
                <SidebarMenuItem key={it.to}>
                  <SidebarMenuButton asChild tooltip={it.label} className="h-10 rounded-md px-3 group-data-[collapsible=icon]:mx-auto">
                    <NavLink
                      to={it.to}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground/80"
                      }
                    >
                      <it.icon className="h-4 w-4" />
                      <span>{it.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Logout"
                  onClick={handleLogout}
                  className="h-10 rounded-md px-3 text-destructive hover:bg-destructive/10 hover:text-destructive group-data-[collapsible=icon]:mx-auto"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
