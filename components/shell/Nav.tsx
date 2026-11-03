"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppData, useProfile } from "@/lib/data/context";
import { useUI } from "@/lib/ui";
import { Icon, type IconName } from "@/components/ui/Icon";

const NAV: { href: string; label: string; icon: IconName; mobile: boolean }[] = [
  { href: "/", label: "Home", icon: "home", mobile: true },
  { href: "/inbox", label: "Inbox", icon: "inbox", mobile: true },
  { href: "/envelopes", label: "Envelopes", icon: "layers", mobile: true },
  { href: "/commitments", label: "Bills", icon: "receipt", mobile: true },
  { href: "/reconcile", label: "Reconcile", icon: "scale", mobile: false },
  { href: "/settings", label: "Settings", icon: "gear", mobile: false },
];

function usePendingCount() {
  return useAppData().txns.filter((t) => t.status === "pending").length;
}

export function initials(name: string, email: string | null): string {
  const source = name.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ size = 36 }: { size?: number }) {
  const { displayName, email } = useProfile();
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="grid shrink-0 place-items-center rounded-full bg-accent/15 font-medium text-accent"
    >
      {initials(displayName, email)}
    </span>
  );
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Sidebar() {
  const path = usePathname();
  const pending = usePendingCount();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  return (
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh flex-col gap-1 px-4 py-8 lg:flex">
      <Link href="/" className="mb-8 px-3 text-[17px] font-semibold tracking-tight">
        spency
      </Link>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(path, n.href) ? "page" : undefined}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-muted transition-colors hover:text-fg aria-[current=page]:bg-surface aria-[current=page]:text-fg"
        >
          <Icon name={n.icon} />
          {n.label}
          {n.href === "/inbox" && pending > 0 && (
            <span className="ml-auto rounded-full bg-accent/15 px-2 text-xs leading-5 text-accent tabular-nums">{pending}</span>
          )}
        </Link>
      ))}
      <button type="button" onClick={openQuickAdd} className="btn btn-primary mt-6">
        <Icon name="plus" size={18} />
        Add spend
      </button>
      <ProfileChip />
    </nav>
  );
}

function ProfileChip() {
  const { displayName, email } = useProfile();
  return (
    <Link href="/settings" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface">
      <Avatar size={32} />
      <span className="min-w-0">
        <span className="block truncate text-sm">{displayName || "Your profile"}</span>
        <span className="block truncate text-xs text-muted">{email ?? "Demo mode"}</span>
      </span>
    </Link>
  );
}

export function TabBar() {
  const path = usePathname();
  const pending = usePendingCount();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const items = NAV.filter((n) => n.mobile);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2">
        {items.slice(0, 2).map((n) => (
          <Tab key={n.href} {...n} active={isActive(path, n.href)} badge={n.href === "/inbox" ? pending : 0} />
        ))}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={openQuickAdd}
            aria-label="Add spend"
            className="grid size-12 place-items-center rounded-full bg-fg text-bg transition-transform active:scale-95"
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
        {items.slice(2).map((n) => (
          <Tab key={n.href} {...n} active={isActive(path, n.href)} badge={0} />
        ))}
      </div>
    </nav>
  );
}

function Tab({ href, label, icon, active, badge }: { href: string; label: string; icon: IconName; active: boolean; badge: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${active ? "text-fg" : "text-faint"}`}
    >
      <Icon name={icon} size={22} />
      {label}
      {badge > 0 && (
        <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-medium text-bg tabular-nums">
          {badge}
        </span>
      )}
    </Link>
  );
}
