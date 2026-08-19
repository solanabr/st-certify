"use client";

import Link from "next/link";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Copy, ExternalLink, LogOut, Menu } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { useMe } from "@/hooks/useMe";
import { useT } from "@/lib/i18n";

const NAV_LINK_CLASS =
  "rounded-sm px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function RoleLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { data: me } = useMe();
  const { t } = useT();

  return (
    <>
      <Link href="/editions" onClick={onNavigate} className={NAV_LINK_CLASS}>
        {t("nav.editions")}
      </Link>
      <Link href="/verify" onClick={onNavigate} className={NAV_LINK_CLASS}>
        {t("nav.verify")}
      </Link>
      <Link href="/events" onClick={onNavigate} className={NAV_LINK_CLASS}>
        {t("nav.events")}
      </Link>
      {me?.authenticated && (
        <Link href="/me" onClick={onNavigate} className={NAV_LINK_CLASS}>
          {t("nav.me")}
        </Link>
      )}
      {me?.isCertifier && (
        <Link
          href="/certificator"
          onClick={onNavigate}
          className={NAV_LINK_CLASS}
        >
          {t("nav.certificator")}
        </Link>
      )}
      {me?.role === "sysadmin" && (
        <Link href="/admin" onClick={onNavigate} className={NAV_LINK_CLASS}>
          {t("nav.admin")}
        </Link>
      )}
    </>
  );
}

function AccountMenu() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { data: me } = useMe();
  const { t } = useT();

  if (!ready) {
    return <Skeleton className="h-9 w-24 rounded-md" />;
  }

  if (!authenticated) {
    return (
      <Button onClick={() => login()} size="sm">
        {t("nav.signIn")}
      </Button>
    );
  }

  const wallet = me?.wallets[0];
  const label =
    me?.email ?? (wallet ? truncateAddress(wallet) : t("nav.account"));

  async function copyWallet(): Promise<void> {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet);
    toast.success(t("nav.addressCopied"));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          title={me?.email ?? wallet}
        >
          <span
            className="inline-block size-2 shrink-0 rounded-full bg-success"
            aria-hidden="true"
          />
          <span className="max-w-[10rem] truncate font-mono text-xs">
            {label}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {wallet && (
          <DropdownMenuItem onSelect={() => void copyWallet()}>
            <Copy /> {t("nav.copyAddress")}
          </DropdownMenuItem>
        )}
        {wallet && (
          <DropdownMenuItem asChild>
            <a
              href={`https://explorer.solana.com/address/${wallet}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink /> {t("nav.viewExplorer")}
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
          <LogOut /> {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useT();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/symbol-emerald.svg"
            alt=""
            aria-hidden="true"
            className="size-7 dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/symbol-cream.svg"
            alt=""
            aria-hidden="true"
            className="hidden size-7 dark:block"
          />
          <span>
            Superteam <span className="text-primary">Certify</span>
          </span>
        </Link>

        <nav
          aria-label={t("nav.mainNav")}
          className="hidden items-center gap-6 md:flex"
        >
          <RoleLinks />
        </nav>

        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
          <div className="ml-1 hidden md:block">
            <AccountMenu />
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t("nav.openMenu")}
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>{t("nav.menu")}</SheetTitle>
              </SheetHeader>
              <nav
                aria-label={t("nav.mainNavMobile")}
                className="flex flex-col gap-4 px-4"
              >
                <RoleLinks onNavigate={() => setMobileOpen(false)} />
              </nav>
              <div className="mt-auto border-t border-border p-4">
                <AccountMenu />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
