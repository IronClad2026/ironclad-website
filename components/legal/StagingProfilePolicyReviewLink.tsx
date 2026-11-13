import Link from "next/link";
import { isStagingProfilePolicyReview } from "@/lib/staging-profile-policy-review";

export default function StagingProfilePolicyReviewLink() {
  if (!isStagingProfilePolicyReview()) return null;

  return (
    <aside lang="en" aria-label="Staging policy review" className="border-b border-orange-400/25 bg-zinc-950 px-5 py-4 text-sm text-zinc-200">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2">
        <p>Staging review drafts for Privacy Policy 1.4 and Rulebook 3.3.</p>
        <Link className="inline-flex min-h-11 items-center font-semibold text-orange-200 underline" href="/rules/public-gaming-profile">
          Review the public gaming-profile policy
        </Link>
      </div>
    </aside>
  );
}
