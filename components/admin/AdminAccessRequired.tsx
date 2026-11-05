import Link from "next/link";

export default function AdminAccessRequired() {
  return (
    <main className="min-h-screen bg-black px-4 pt-28 pb-20 text-white sm:px-6">
      <section className="mx-auto max-w-2xl rounded-2xl border border-orange-500/30 bg-zinc-950 p-6 sm:p-8">
        <p className="text-xs font-bold tracking-widest text-orange-400 uppercase">Admin workspace</p>
        <h1 className="mt-3 text-3xl font-black">Administrator access required</h1>
        <p className="mt-4 leading-relaxed text-zinc-300">
          You are signed in, but this account does not have administrator access.
        </p>
        <p className="mt-3 leading-relaxed text-zinc-300">
          Open your account menu in the navigation bar, sign out, then sign in with your
          administrator account and open this page again. On mobile, open the site menu
          to find your account controls.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Administrators do not need a personal match or a tournament registration to use this workspace.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold transition-colors hover:border-orange-400 hover:text-orange-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400"
        >
          Return to your dashboard
        </Link>
      </section>
    </main>
  );
}
