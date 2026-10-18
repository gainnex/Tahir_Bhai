"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, KeyRound, LogOut, Plus } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { InstallAppMenuItem, IosInstallDialog } from "@/components/pwa";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { navForRole, type NavLink, type NavSection } from "./nav";

type Props = {
  user: { name: string; role: Role };
  companyName: string;
  pendingCount: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  // "/expenses" should not light up for "/expenses/new" — those are separate links
  if (href === "/expenses") return pathname === "/expenses" || /^\/expenses\/\d+/.test(pathname);
  return pathname === href || pathname.startsWith(href + "/");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function AppShell({ user, companyName, pendingCount, defaultOpen = true, children }: Props) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} companyName={companyName} pendingCount={pendingCount} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <span className="truncate text-sm font-medium">{companyName}</span>
        </header>
        <div className="mx-auto w-full max-w-7xl p-4 pb-24 sm:p-6">{children}</div>
        <QuickAddButton />
      </SidebarInset>
    </SidebarProvider>
  );
}

/** Phones: a floating "New expense" button, except on form pages (they have their own save bar). */
function QuickAddButton() {
  const pathname = usePathname();
  if (/\/(new|edit|post)$/.test(pathname) || pathname.startsWith("/attendance") || pathname === "/labour-payment") {
    return null;
  }
  return (
    <Link
      href="/expenses/new"
      aria-label="New expense"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 sm:hidden"
    >
      <Plus className="size-6" />
    </Link>
  );
}

function AppSidebar({ user, companyName, pendingCount }: Omit<Props, "children" | "defaultOpen">) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const nav = navForRole(user.role);
  // Close the mobile sheet after navigating
  const close = () => isMobile && setOpenMobile(false);

  const top = nav.filter((s) => s.href);
  const groups = nav.filter((s) => !s.href);

  const link = (l: NavLink | NavSection, icon?: NavSection["icon"]) => {
    const Icon = icon;
    return (
      <SidebarMenuItem key={l.href}>
        <SidebarMenuButton asChild isActive={isActive(pathname, l.href!)} tooltip={l.label}>
          <Link href={l.href!} onClick={close}>
            {Icon && <Icon />}
            <span>{l.label}</span>
          </Link>
        </SidebarMenuButton>
        {l.href === "/expenses/pending" && pendingCount > 0 && (
          <SidebarMenuBadge className="bg-amber-500 font-mono text-white tabular-nums peer-hover/menu-button:text-white peer-data-[active=true]/menu-button:text-white">
            {pendingCount}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent active:bg-transparent">
              <Link href="/" onClick={close}>
                {/* Line Craft "LC" mark, white for the dark sidebar */}
                <Image src="/brand/mark-white.png" alt="" width={82} height={83} className="size-8 shrink-0 object-contain" priority />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-white">{companyName}</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">Project Expense Manager</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{top.map((s) => link(s, s.icon))}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {groups.map((section) => (
          <SidebarGroup key={section.label} className="pt-0">
            <SidebarGroupLabel className="gap-2 text-sidebar-foreground/60 uppercase tracking-wide">
              <section.icon /> {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{section.children?.map((c) => link(c))}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu user={user} onNavigate={close} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function UserMenu({ user, onNavigate }: { user: Props["user"]; onNavigate: () => void }) {
  const { isMobile } = useSidebar();
  const logoutForm = useRef<HTMLFormElement>(null);
  const [iosHelp, setIosHelp] = useState(false);
  return (
    <SidebarMenu>
      <IosInstallDialog open={iosHelp} onOpenChange={setIosHelp} />
      <SidebarMenuItem>
        {/* Sign-out form lives outside the menu portal; the menu item submits it. */}
        <form ref={logoutForm} action={logoutAction} className="hidden" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-sidebar-accent text-xs font-semibold text-white">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-white">{user.name}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">{ROLE_LABELS[user.role]}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/change-password" onClick={onNavigate}>
                <KeyRound /> Change password
              </Link>
            </DropdownMenuItem>
            <InstallAppMenuItem onIosHelp={() => setIosHelp(true)} />
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => logoutForm.current?.requestSubmit()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
