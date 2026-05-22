"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";

type CustomClaims = {
  metadata?: {
    role?: string;
  };
};

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { sessionClaims } = useAuth();

  const role = (sessionClaims as CustomClaims | null)?.metadata?.role;
  const isAdmin = role === "admin";

  return (
    <header className="absolute left-0 top-0 z-20 w-full border-b border-white/10 bg-black/20 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 text-white">
        <a href="/" className="text-lg font-bold tracking-wide">
          IronClad
        </a>

        <div className="hidden items-center gap-8 text-sm font-medium text-zinc-300 md:flex">
          <a href="/" className="hover:text-white">Home</a>
          <a href="/tournaments" className="hover:text-white">Tournaments</a>
          <a href="/rules" className="hover:text-white">Rules</a>
          <a href="/rankings" className="hover:text-white">Rankings</a>
          <a href="/about" className="hover:text-white">About</a>

          {isAdmin && (
            <a href="/admin" className="text-orange-400 hover:text-orange-300">
              Admin
            </a>
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
            <a href="/" onClick={() => setIsOpen(false)}>Home</a>
            <a href="/tournaments" onClick={() => setIsOpen(false)}>Tournaments</a>
            <a href="/rules" onClick={() => setIsOpen(false)}>Rules</a>
            <a href="/rankings" onClick={() => setIsOpen(false)}>Rankings</a>
            <a href="/about" onClick={() => setIsOpen(false)}>About</a>

            {isAdmin && (
              <a
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="text-orange-400"
              >
                Admin
              </a>
            )}
          </div>
        </div>
      )}
    </header>
  );
}