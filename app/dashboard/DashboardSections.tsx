"use client";

import { ArrowUpRight, Gamepad2, LayoutGrid, UserRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import DashboardReadyWardrobe from "@/components/dashboard/DashboardReadyWardrobe";
import { readyWardrobeHref, readyWardrobeOpenEvent } from "@/lib/wardrobe/catalogue";
import styles from "./Dashboard.module.css";

type Section = "overview" | "wardrobe" | "hub";

const sectionLinks = [
  { id: "overview", label: "Overview", icon: LayoutGrid, href: "/dashboard" },
  { id: "wardrobe", label: "Ready Wardrobe", icon: Gamepad2, href: readyWardrobeHref },
  { id: "hub", label: "Player hub", icon: UserRound, href: "/dashboard?section=player-hub" },
] as const;

const hubAnchors = new Set([
  "#dashboard-statistics",
  "#dashboard-history",
  "#dashboard-badges",
  "#community-polls",
  "#dashboard-visibility",
]);

function sectionFor(params: URLSearchParams | null, hash: string, wardrobeEnabled: boolean): Section {
  if (wardrobeEnabled && (params?.get("wardrobe") === "open" || hash === "#ready-wardrobe")) return "wardrobe";
  if (hubAnchors.has(hash) || (params?.get("section") === "player-hub" && !hash)) return "hub";
  return "overview";
}

function revealTarget(hash: string) {
  let target: HTMLElement | null;
  try {
    target = document.getElementById(decodeURIComponent(hash.slice(1)));
  } catch {
    return;
  }
  if (!target || !target.closest("[data-dashboard-command-centre]")) return;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  target.scrollIntoView?.({ block: "start" });
}

export default function DashboardSections({
  introduction,
  overview,
  hub,
  profileHref,
  wardrobeEnabled,
}: {
  introduction: ReactNode;
  overview: ReactNode;
  hub: ReactNode;
  profileHref: string | null;
  wardrobeEnabled: boolean;
}) {
  const params = useSearchParams();
  const [hash, setHash] = useState("");
  const section = sectionFor(params, hash, wardrobeEnabled);

  function selectSection(next: Section, behavior: "push" | "replace" = "push") {
    const url = new URL(window.location.href);
    url.searchParams.delete("section");
    url.searchParams.delete("wardrobe");
    url.hash = "";
    if (next === "hub") url.searchParams.set("section", "player-hub");
    if (next === "wardrobe") {
      url.searchParams.set("wardrobe", "open");
      url.hash = "ready-wardrobe";
    }
    if (url.href !== window.location.href) {
      if (behavior === "replace") window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    }
    setHash(url.hash);
    if (next !== section) window.scrollTo({ top: 0, behavior: "instant" });
  }

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [params]);

  useEffect(() => {
    if (!wardrobeEnabled) return;
    function openInvitation() {
      const url = new URL(window.location.href);
      url.searchParams.delete("section");
      url.searchParams.set("wardrobe", "open");
      url.hash = "ready-wardrobe";
      if (url.href !== window.location.href) window.history.pushState(null, "", url);
      setHash(url.hash);
      window.requestAnimationFrame(() => document.getElementById("ready-wardrobe")?.focus({ preventScroll: true }));
    }
    window.addEventListener(readyWardrobeOpenEvent, openInvitation);
    return () => window.removeEventListener(readyWardrobeOpenEvent, openInvitation);
  }, [wardrobeEnabled]);

  useEffect(() => {
    if (!hash || hash === "#ready-wardrobe") return;
    const frame = window.requestAnimationFrame(() => revealTarget(hash));
    return () => window.cancelAnimationFrame(frame);
  }, [section, hash]);

  return (
    <div className={styles.shell}>
      <nav aria-label="Dashboard sections" className={styles.rail}>
        <p className={styles.railLabel}>Player Dashboard</p>
        <div className={styles.navigation}>
          {sectionLinks.filter(({ id }) => wardrobeEnabled || id !== "wardrobe").map(({ id, label, icon: Icon, href }) => (
            <Link
              key={id}
              href={href}
              prefetch={false}
              aria-current={section === id ? "page" : undefined}
              onNavigate={(event) => {
                event.preventDefault();
                selectSection(id);
              }}
            >
              <Icon aria-hidden size={16} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
        {profileHref && (
          <Link href={profileHref} prefetch={false} className={styles.publicProfile}>
            View player profile <ArrowUpRight aria-hidden size={15} />
          </Link>
        )}
      </nav>
      <div className={styles.content} data-dashboard-view={section}>
        <div hidden={section !== "overview"} className={styles.introduction}>
          {introduction}
        </div>
        {wardrobeEnabled && (
          <div hidden={section === "hub"}>
            <DashboardReadyWardrobe
              mode={section === "wardrobe" ? "wardrobe" : "overview"}
              active={section !== "hub"}
              onOpen={() => selectSection("wardrobe")}
              onClose={() => selectSection("overview", "replace")}
            />
          </div>
        )}
        <div hidden={section !== "overview"}>{overview}</div>
        <div hidden={section !== "hub"}>{hub}</div>
      </div>
    </div>
  );
}
