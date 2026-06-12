import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandMark } from "@/components/BrandMark";
import { UserMenu } from "@/components/UserMenu";

export function AppLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="app-shell">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-3 sm:px-5 lg:px-8">
            <SidebarTrigger className="h-9 w-9 shrink-0 rounded-md lg:hidden" />
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <BrandMark className="hidden h-9 w-9 shrink-0 bg-card/70 sm:flex" imageClassName="p-0.5" />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold sm:text-base">
                  Carlton Private Residence
                </h1>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Ruang kerja komunitas hunian
                </p>
              </div>
            </div>
            <div className="ml-auto">
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 px-3 py-4 sm:px-5 md:px-8 md:py-7">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
