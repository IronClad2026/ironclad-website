import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import AssistanceConversation from "@/components/AssistanceConversation";
import { getPrivateAssistanceCopy } from "@/lib/i18n/private-assistance";
import { getRequestLocale } from "@/lib/i18n/request";
import { isAssistanceUuid } from "@/lib/private-assistance";

export default async function PrivateAssistancePage({ params, searchParams }: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ tournament?: string | string[] }>;
}) {
  const { userId } = await auth();
  const [{ requestId }, query] = await Promise.all([params, searchParams]);
  if (!isAssistanceUuid(requestId) || !isAssistanceUuid(query.tournament)) notFound();
  if (!userId) {
    const returnTo = `/assistance/${requestId}?tournament=${query.tournament}`;
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
  }
  const copy = getPrivateAssistanceCopy(await getRequestLocale());
  return (
    <main className="min-h-screen bg-black px-4 pb-20 pt-28 text-white">
      <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 p-4 sm:p-6">
        <h1 className="mb-4 text-2xl font-black">{copy.conversation}</h1>
        <AssistanceConversation requestId={requestId.toLowerCase()} tournamentId={query.tournament.toLowerCase()} />
      </section>
    </main>
  );
}
