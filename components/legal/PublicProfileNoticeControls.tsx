"use client";

import { SignOutButton } from "@clerk/nextjs";
import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function NoticeDialog({ title, children }: { title: string; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <main className="grid min-h-dvh place-items-center bg-black px-4 py-8 text-white sm:px-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-profile-notice-title"
        className="w-full max-w-2xl rounded-2xl border border-orange-500/30 bg-zinc-950 p-5 shadow-xl sm:p-8"
      >
        <h1 ref={heading} tabIndex={-1} id="public-profile-notice-title" className="text-2xl font-black outline-none sm:text-3xl">
          {title}
        </h1>
        {children}
      </section>
    </main>
  );
}

export function NoticeSignOut({ label }: { label: string }) {
  return (
    <SignOutButton redirectUrl="/">
      <button type="button" className="inline-flex min-h-11 items-center underline">
        {label}
      </button>
    </SignOutButton>
  );
}

export function NoticeSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-12 rounded-lg border border-orange-400 bg-orange-500 px-5 py-2 font-bold text-black hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
