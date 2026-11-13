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
          <p>Visitors can see public gaming profiles without signing in. A public profile can show your public IronClad player identifier, display name and in-game name, country, competitive region, rating, avatar, profile creation time and avatar availability. Published Showcase text, badges and eligible moderated clips can appear under their existing controls.</p>
          <p>Public competition information can include tournament participation, divisions, brackets, official matches, results, placements, standings and recorded tournament ratings. Where the profile is public and the identity is verified, the authorized CoH3Stats integration can use a Relic profile identifier and an IronClad profile link to connect competitive records.</p>
          <p>Your email address, login credentials, private match chat, private assistance conversations and restricted replay evidence are outside the public profile. A Discord username appears only when you turn on the separate Discord visibility setting. Public avatars use the player identifier and do not expose the private Storage path.</p>
          <p>The account notice records a protected one-way reference to your account, the acknowledgement time and the notice version. This records acknowledgement of the information shown. Historical settings and accepted versions remain in the records.</p>
        </section>
        <section className="space-y-3" aria-labelledby="rulebook-review">
          <h2 id="rulebook-review" className="text-xl font-bold text-white">Rulebook 3.3 · proposed sections 19.2 and 19.3</h2>
          <p>19.2 Gaming profiles created under the new Terms are public. Earlier accounts follow the transition in the Privacy Policy. Official tournament participation, results and standings remain visible under the documents for each event.</p>
          <p>19.3 Public Discord contact requires a separate opt-in. Published Showcase and media remain subject to their existing controls. Private account information, private communications and restricted match evidence stay protected.</p>
        </section>
        <section className="space-y-3" aria-labelledby="transition-review">
          <h2 id="transition-review" className="text-xl font-bold text-white">Transition after HOLD THE LINE</h2>
          <p>The temporary public-profile arrangement ends with HOLD THE LINE. Earlier accounts keep their documented visibility. If a player turned public visibility off, their previous choice is unknown or a privacy objection remains open, their full profile stays restricted. A player who does not return keeps the same treatment. Players can separately choose to publish their full profile, subject to any unresolved privacy objection.</p>
          <p>The acknowledgement records what was shown and leaves visibility choices and previous agreements intact. These provisions are also proposed for Terms 1.2 and Player Participation Agreement 3.3. They take effect through separate publication.</p>
        </section>
        <nav className="flex flex-wrap gap-4" aria-label="Existing legal documents">
          <Link className="inline-flex min-h-11 items-center text-orange-200 underline" href="/privacy">Current Privacy Policy</Link>
          <Link className="inline-flex min-h-11 items-center text-orange-200 underline" href="/rules">Current Rules and documents</Link>
        </nav>
      </article>
    </main>
  );
}
