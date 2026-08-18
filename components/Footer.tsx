import Link from "next/link";

import { getLegalDocument } from "@/lib/legal-corpus-publication";

export default function Footer() {
  const rulebook = getLegalDocument("rulebook");
  const ppa = getLegalDocument("ppa");

  return (
    <footer className="border-t border-white/10 bg-black px-6 py-8 text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm md:flex-row md:items-center md:justify-between">
        <p>© 2026 IronClad Tournaments. All rights reserved.</p>

        <nav aria-label="Legal and rules" className="flex flex-wrap gap-x-5 gap-y-3">
          <Link
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href="/rules"
          >
            Rules
          </Link>
          <a
            aria-label="Official Tournament Rulebook (opens in a new tab)"
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href={rulebook.publicPath}
            rel="noopener noreferrer"
            target="_blank"
          >
            Rulebook
          </a>
          <a
            aria-label="Player Participation Agreement (opens in a new tab)"
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href={ppa.publicPath}
            rel="noopener noreferrer"
            target="_blank"
          >
            PPA
          </a>
          <Link
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href="/terms"
          >
            Terms of Service
          </Link>
          <Link
            className="transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
            href="/privacy"
          >
            Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
