import Link from "next/link";
import { notFound } from "next/navigation";
import { isStagingProfilePolicyReview } from "@/lib/staging-profile-policy-review";

export const dynamic = "force-dynamic";

export default function StagingPublicGamingProfilePolicyPage() {
  if (!isStagingProfilePolicyReview()) notFound();

  return (
    <main lang="en" className="min-h-screen bg-black px-5 pb-16 pt-28 text-zinc-200 sm:pt-32">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="font-semibold text-orange-300">Staging review draft</p>
          <h1 className="text-3xl font-black text-white sm:text-4xl">Public gaming profiles and tournament information</h1>
          <p>These proposed provisions have no effective date. The existing Privacy Policy, Rulebook and agreements still apply.</p>
        </header>
        <section className="space-y-3" aria-labelledby="privacy-review">
          <h2 id="privacy-review" className="text-xl font-bold text-white">Privacy Policy 1.4 · proposed public information provisions</h2>
          <p>Visitors can see core gaming profiles without signing in. Core information includes the public IronClad player identifier and profile link, in-game name, competitive region or division, and current ELO. Optional details include a different display name, country, avatar, published Showcase content and eligible moderated clips. They require a separate choice or verified prior permission.</p>
          <p>Public competition records can show approved event names, participation, divisions, recorded roster ELO, brackets, official matches, results, placements, standings and tournament history. Other event snapshots can appear only when optional sharing covers them. CoH3Stats can use a verified Relic profile identifier and an IronClad profile link only when the relevant sharing choice covers it. The Relic identifier is shared only with the authorized integration.</p>
          <p>Email addresses, Clerk IDs, login information, private match chat, private assistance, internal admin notes and restricted replay evidence stay private. Discord appears only on a visible gaming profile when you turn on its separate visibility setting. The avatar route keeps the private Storage path hidden.</p>
          <p>The account notice records a protected one-way reference to your account, the acknowledgement time and the notice version. This records acknowledgement of the information shown. Historical settings and accepted versions remain in the records.</p>
        </section>
        <section className="space-y-3" aria-labelledby="rulebook-review">
          <h2 id="rulebook-review" className="text-xl font-bold text-white">Rulebook 3.3 · proposed sections 19.2 and 19.3</h2>
          <p>19.2 Core gaming profiles are public under the new policy, including for existing accounts. Official tournament participation, results and standings remain visible under the documents for each event.</p>
          <p>19.3 Public Discord contact requires a separate opt-in. Published Showcase and media remain subject to their existing controls. Private account information, private communications and restricted match evidence stay protected.</p>
        </section>
        <section className="space-y-3" aria-labelledby="transition-review">
          <h2 id="transition-review" className="text-xl font-bold text-white">Transition after HOLD THE LINE</h2>
          <p>The temporary arrangement ends with HOLD THE LINE. The proposed policy makes core information public for active profiles regardless of older visibility settings. Earlier choices stay in the records. Optional details stay private unless a separate choice or verified prior permission covers them. A recorded, unresolved privacy objection restricts the individual gaming profile while it is reviewed.</p>
          <p>The acknowledgement records what was shown and does not grant optional sharing permission. These provisions are also proposed for Terms 1.2 and Player Participation Agreement 3.3. They take effect through separate publication.</p>
        </section>
        <nav className="flex flex-wrap gap-4" aria-label="Existing legal documents">
          <Link className="inline-flex min-h-11 items-center text-orange-200 underline" href="/privacy">Current Privacy Policy</Link>
          <Link className="inline-flex min-h-11 items-center text-orange-200 underline" href="/rules">Current Rules and documents</Link>
        </nav>
      </article>
    </main>
  );
}
