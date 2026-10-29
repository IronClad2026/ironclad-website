import { ArrowRight, Mail } from "lucide-react";
import type { PublicDictionary } from "@/lib/i18n/dictionaries/en/public";

const contactEmail = "ironclad.tournaments@gmail.com";

export default function HomeCollaborationSection({
  copy,
}: {
  copy: PublicDictionary["home"]["collaboration"];
}) {
  return (
    <section
      aria-labelledby="home-collaboration-title"
      className="bg-black px-5 pt-12 pb-20 sm:px-8 sm:pb-24 lg:px-12"
    >
      <div className="relative mx-auto grid max-w-7xl gap-8 border border-orange-400/25 bg-zinc-950 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16 lg:p-12">
        <div
          aria-hidden="true"
          className="absolute top-0 left-0 h-1 w-20 bg-orange-500"
        />

        <div className="min-w-0 max-w-2xl">
          <h2
            id="home-collaboration-title"
            className="text-3xl font-black leading-tight text-white sm:text-4xl"
          >
            {copy.heading}
          </h2>
          <p className="mt-4 text-base leading-7 text-zinc-300">
            {copy.body}
          </p>
        </div>

        <div className="flex min-w-0 flex-col items-start gap-4 lg:items-center">
          <a
            href={`mailto:${contactEmail}`}
            className="inline-flex min-h-12 w-full items-center justify-center gap-3 border border-orange-400 bg-orange-500 px-6 py-3 text-sm font-black text-black transition-colors hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 sm:w-auto lg:w-full"
          >
            <Mail size={18} aria-hidden="true" className="shrink-0" />
            <span>{copy.contact}</span>
            <ArrowRight size={17} aria-hidden="true" className="shrink-0" />
          </a>
          <p className="max-w-full select-text text-sm leading-6 break-all text-zinc-400">
            {contactEmail}
          </p>
        </div>
      </div>
    </section>
  );
}
