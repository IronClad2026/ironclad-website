import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import PublicCasterProfileView from "@/components/caster/PublicCasterProfileView";
import { isCasterProgramEnabled } from "@/lib/caster/environment";
import { getPublicCasterCopy } from "@/lib/caster/public-copy";
import { loadPublicCasterProfile } from "@/lib/caster/public-directory";
import { isCasterPublicSlug } from "@/lib/caster/publication";
import { getRequestLocale } from "@/lib/i18n/request";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

// This only shares one fresh authorization snapshot across metadata and page rendering.
const loadCasterForRequest = cache(async (slug: string) =>
  isCasterProgramEnabled() && isCasterPublicSlug(slug) ? loadPublicCasterProfile(slug) : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [locale, caster] = await Promise.all([getRequestLocale(), loadCasterForRequest(slug)]);
  const copy = getPublicCasterCopy(locale);
  if (!caster) return { title: copy.unavailable, robots: { index: false, follow: false } };

  return {
    title: `${caster.display_name} · ${copy.designation}`,
    description: copy.directoryDescription,
    ...(process.env.VERCEL_ENV !== "production" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function CasterProfilePage({ params }: Props) {
  const { slug } = await params;
  const [locale, caster] = await Promise.all([getRequestLocale(), loadCasterForRequest(slug)]);
  if (!caster) notFound();

  return <PublicCasterProfileView caster={caster} locale={locale} copy={getPublicCasterCopy(locale)} />;
}
