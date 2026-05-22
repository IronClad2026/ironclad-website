import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="min-h-screen bg-black pt-32 text-white">
      <div className="mx-auto flex max-w-md justify-center px-4">
        <SignIn />
      </div>
    </main>
  );
}