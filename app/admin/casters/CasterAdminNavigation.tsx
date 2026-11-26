import Link from "next/link";
import { CASTER_ADMIN_PATH } from "@/lib/caster/contracts";
import { CASTER_APPLICATIONS_ADMIN_PATH, CASTER_GRANTS_ADMIN_PATH } from "./admin-application-contracts";

const sections = [
  { key: "invitations", href: CASTER_ADMIN_PATH, label: "Invitations" },
  { key: "applications", href: CASTER_APPLICATIONS_ADMIN_PATH, label: "Applications" },
  { key: "grants", href: CASTER_GRANTS_ADMIN_PATH, label: "Grant caster access" },
] as const;

export default function CasterAdminNavigation({ current }: { current: (typeof sections)[number]["key"] }) {
  return (
    <nav aria-label="Caster management" className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
      {sections.map(({ key, href, label }) => (
        <Link
          key={key}
          href={href}
          prefetch={false}
          aria-current={current === key ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 ${current === key
            ? "border-orange-400/50 bg-orange-500/15 text-orange-200"
            : "border-white/15 bg-zinc-950 text-zinc-300 hover:border-orange-400/40 hover:text-white"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
