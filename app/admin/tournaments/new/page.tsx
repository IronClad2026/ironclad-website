import { auth } from "@clerk/nextjs/server";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import TournamentEditor, {
  EMPTY_TOURNAMENT_VALUES,
  type TournamentEditorNotice,
} from "@/components/admin/tournaments/TournamentEditor";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

type NewTournamentPageProps = {
  searchParams?: Promise<{
    notice?: TournamentEditorNotice;
    error?: string;
  }>;
};

export default async function NewTournamentPage({
  searchParams,
}: NewTournamentPageProps) {
  const { userId, sessionClaims } = await auth();
  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;

  if (!userId || role !== "admin") {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-black px-4 pt-28 pb-20 text-white sm:px-6 sm:pt-32">
      <section className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-orange-400">
              Tournament Administration
            </p>
            <h1 className="mt-3 break-words text-3xl font-black sm:text-4xl">
              Create Tournament
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Creation stays separate from the management workspace. Existing
              fields, validation, banner handling, and Division rules are
              unchanged.
            </p>
          </div>
          <Link
            href="/admin/tournaments"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 font-bold text-zinc-200 transition hover:border-orange-400/60 hover:text-white sm:w-auto"
          >
            <ChevronLeft aria-hidden="true" size={18} />
            Tournament List
          </Link>
        </div>

        <TournamentEditor
          values={EMPTY_TOURNAMENT_VALUES}
          notice={params?.notice}
          generatedByBracket={new Map()}
          approvedByBracket={new Map()}
          readinessByBracket={new Map()}
          isEditing
          errorMessage={params?.error}
          terminal={null}
          underReview={null}
        />
      </section>
    </main>
  );
}
