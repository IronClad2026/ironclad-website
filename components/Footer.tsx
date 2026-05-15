export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black px-6 py-8 text-zinc-400">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between">
        <p>© 2026 IronClad Tournaments. All rights reserved.</p>

        <div className="flex gap-5">
          <a href="/tournaments" className="hover:text-white">
            Tournaments
          </a>
          <a href="/rules" className="hover:text-white">
            Rules
          </a>
          <a href="/about" className="hover:text-white">
            About
          </a>
        </div>
      </div>
    </footer>
  );
}