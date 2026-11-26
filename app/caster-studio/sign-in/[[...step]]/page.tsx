import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { CASTER_SIGN_IN_PATH, CASTER_SIGN_UP_PATH, CASTER_STUDIO_PATH } from "@/lib/caster/contracts";
import { isCasterProgramEnabled } from "@/lib/caster/environment";

export const dynamic = "force-dynamic";

export default async function CasterSignIn() {
  if (!isCasterProgramEnabled()) notFound();
  if ((await auth()).userId) redirect(CASTER_STUDIO_PATH);
  return (
    <main className="grid min-h-svh place-items-center bg-black px-4 py-12 text-white">
      <SignIn routing="path" path={CASTER_SIGN_IN_PATH} signUpUrl={CASTER_SIGN_UP_PATH}
        forceRedirectUrl={CASTER_STUDIO_PATH} signUpForceRedirectUrl={CASTER_STUDIO_PATH} />
    </main>
  );
}
