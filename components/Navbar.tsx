"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { isSignedIn, sessionClaims } = useAuth();

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";

  return (
    <header className="absolute left-0 top-0 z-20 w-full border-b border-white/10 bg-black/20 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 text-white">
        <Link href="/" className="text-lg font-bold tracking-wide">
          IronClad
        </Link>

        <div className="hidden items-center gap-8 text-sm font-medium text-zinc-300 md:flex">
          <Link href="/" className="hover:text-white">Home</Link>
          <Link href="/tournaments" className="hover:text-white">Tournaments</Link>
          <Link href="/players" className="hover:text-white">Players</Link>
          <Link href="/rules" className="hover:text-white">Rules</Link>
          <Link href="/rankings" className="hover:text-white">Rankings</Link>
          <Link href="/about" className="hover:text-white">About</Link>
          {isSignedIn && (
            <Link href="/dashboard" className="hover:text-white">
              Dashboard
            </Link>
          )}

          {isAdmin && (
            <Link href="/admin" className="text-orange-400 hover:text-orange-300">
              Admin
            </Link>
          )}
        </div>

        <button
          className="text-3xl md:hidden"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
      </nav>

      {isOpen && (
        <div className="mx-6 rounded-2xl border border-white/10 bg-black/85 p-5 text-white backdrop-blur md:hidden">
          <div className="flex flex-col gap-4 text-sm font-medium">
            <Link href="/" onClick={() => setIsOpen(false)}>Home</Link>
            <Link href="/tournaments" onClick={() => setIsOpen(false)}>Tournaments</Link>
            <Link href="/players" onClick={() => setIsOpen(false)}>Players</Link>
            <Link href="/rules" onClick={() => setIsOpen(false)}>Rules</Link>
            <Link href="/rankings" onClick={() => setIsOpen(false)}>Rankings</Link>
            <Link href="/about" onClick={() => setIsOpen(false)}>About</Link>
            {isSignedIn && (
              <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                Dashboard
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="text-orange-400"
              >
                Admin
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
