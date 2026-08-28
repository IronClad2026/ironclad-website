"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ClipboardCheck,
  LayoutDashboard,
  Map,
  Megaphone,
  Trophy,
  Vote,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type AdminNavigationItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  match: "exact" | "hash" | "prefix";
};

type AdminNavigationGroup = {
  label: string;
  items: AdminNavigationItem[];
};

const ADMIN_NAVIGATION_GROUPS: AdminNavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/admin",
        icon: LayoutDashboard,
        label: "Command Center",
        match: "exact",
      },
      {
        href: "/admin/operations",
        icon: Activity,
        label: "Operations",
        match: "prefix",
      },
    ],
  },
  {
    label: "Competition",
    items: [
      {
        href: "/admin#registration-review",
        icon: ClipboardCheck,
        label: "Registrations",
        match: "hash",
      },
      {
        href: "/admin/tournaments",
        icon: Trophy,
        label: "Tournaments",
        match: "prefix",
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        href: "/admin/announcements",
        icon: Megaphone,
        label: "Announcements",
        match: "prefix",
      },
      {
        href: "/admin/polls",
        icon: Vote,
        label: "Polls & Decisions",
        match: "prefix",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        href: "/admin/maps",
        icon: Map,
        label: "Global Map Catalogue",
        match: "prefix",
      },
    ],
  },
  {
    label: "Advanced",
    items: [
      {
        href: "/admin/system",
        icon: Wrench,
        label: "System & Recovery",
        match: "prefix",
      },
    ],
  },
];

function isActiveRoute(
  pathname: string,
  hash: string,
  item: AdminNavigationItem
): boolean {
  if (item.match === "hash") {
    const [itemPathname, itemHash] = item.href.split("#");
    return pathname === itemPathname && hash === `#${itemHash}`;
  }

  if (item.match === "exact") {
    return (
      pathname === item.href &&
      !(item.href === "/admin" && hash === "#registration-review")
    );
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function AdminSidebar() {
  const pathname = usePathname() ?? "";
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  return (
    <aside className="sticky top-24 hidden h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain border-r border-white/10 bg-black/70 xl:block">
      <div className="px-5 pb-10 pt-8">
        <div className="border-b border-white/10 px-2 pb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-400">
            IronClad
          </p>
          <p className="mt-2 text-lg font-black tracking-tight text-white">
            Admin Workspace
          </p>
        </div>

        <nav aria-label="Admin navigation" className="mt-6 space-y-6">
          {ADMIN_NAVIGATION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                {group.label}
              </p>
              <ul className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = isActiveRoute(pathname, hash, item);
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                          active
                            ? "border-orange-400/35 bg-orange-500/10 text-orange-100"
                            : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
                        }`}
                      >
                        <Icon
                          aria-hidden="true"
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-orange-400" : "text-zinc-500"
                          }`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
