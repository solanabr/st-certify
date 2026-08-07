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
import { useMe } from "@/hooks/useMe";

const NAV_LINK_CLASS =
  "rounded-sm px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function RoleLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { data: me } = useMe();

  return (
    <>
      <Link href="/editions" onClick={onNavigate} className={NAV_LINK_CLASS}>
        Edições
      </Link>
      <Link href="/verify" onClick={onNavigate} className={NAV_LINK_CLASS}>
        Verificar
      </Link>
      {me?.authenticated && (
        <Link href="/me" onClick={onNavigate} className={NAV_LINK_CLASS}>
          Meus certificados
        </Link>
      )}
      {me?.isCertifier && (
        <Link
          href="/certificator"
          onClick={onNavigate}
          className={NAV_LINK_CLASS}
        >
          Certificador
        </Link>
      )}
      {me?.role === "sysadmin" && (
        <Link href="/admin" onClick={onNavigate} className={NAV_LINK_CLASS}>
          Administração
        </Link>
      )}
    </>
  );
}

function AccountMenu() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { data: me } = useMe();

  if (!ready) {
    return <Skeleton className="h-9 w-24 rounded-md" />;
  }

  if (!authenticated) {
    return (
      <Button onClick={() => login()} size="sm">
        Entrar
      </Button>
    );
  }

  const wallet = me?.wallets[0];
  const label = me?.email ?? (wallet ? truncateAddress(wallet) : "Conta");

  async function copyWallet(): Promise<void> {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet);
    toast.success("Endereço copiado");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
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
            <Copy /> Copiar endereço
          </DropdownMenuItem>
        )}
        {wallet && (
          <DropdownMenuItem asChild>
            <a
              href={`https://explorer.solana.com/address/${wallet}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink /> Ver no Explorer
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="rounded-sm text-lg font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Superteam <span className="text-primary">Certify</span>
        </Link>

        <nav
          aria-label="Principal"
          className="hidden items-center gap-6 md:flex"
        >
          <RoleLinks />
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <AccountMenu />
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Abrir menu"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Principal (móvel)"
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
