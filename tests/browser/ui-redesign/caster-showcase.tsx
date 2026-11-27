import { createRoot } from "react-dom/client";
import CasterShowcaseCarousel from "@/components/caster/CasterShowcaseCarousel";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import type { PublicCasterCard } from "@/lib/caster/publication";
import "@/app/globals.css";

const count = Number(new URLSearchParams(location.search).get("casters") ?? 2);
const cards: PublicCasterCard[] = Array.from({ length: Number.isInteger(count) && count >= 0 && count <= 6 ? count : 2 }, (_, index) => ({
  slug: `synthetic-caster-${index + 1}`, display_name: `Synthetic Caster ${index + 1}`,
  avatar: "25000000-0000-4000-8000-000000000001", publication_id: "35000000-0000-4000-8000-000000000001",
  languages: ["English"], games: ["Company of Heroes 3"], platforms: ["youtube", "twitch"],
}));
const copy = getPublicCasterCopy("en");
createRoot(document.getElementById("root")!).render(
  <section className="mx-auto mt-12 max-w-[1120px] px-5">
    <h2 id="official-caster-showcase" className="mb-5 text-2xl font-black">{copy.showcase}</h2>
    <CasterShowcaseCarousel casters={cards} copy={copy} />
  </section>,
);
