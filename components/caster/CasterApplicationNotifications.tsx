import { CASTER_STUDIO_PATH } from "@/lib/caster/routes";
import type { Locale } from "@/lib/i18n/config";
import { toIntlLocale } from "@/lib/i18n/config";
import { loadCasterApplicationNotifications } from "@/lib/notifications";

type ReviewUpdate = "submitted" | "approved" | "changes_requested" | "rejected";
const messages: Record<Locale, Record<ReviewUpdate | "title", string>> = {
  en: { title: "Application updates", submitted: "Application submitted", approved: "Application approved", changes_requested: "Changes requested", rejected: "Application rejected" },
  es: { title: "Novedades de la solicitud", submitted: "Solicitud enviada", approved: "Solicitud aprobada", changes_requested: "Cambios solicitados", rejected: "Solicitud rechazada" },
  fr: { title: "Suivi de la candidature", submitted: "Candidature envoyée", approved: "Candidature approuvée", changes_requested: "Modifications demandées", rejected: "Candidature rejetée" },
  it: { title: "Aggiornamenti sulla candidatura", submitted: "Candidatura inviata", approved: "Candidatura approvata", changes_requested: "Modifiche richieste", rejected: "Candidatura respinta" },
  ko: { title: "지원서 업데이트", submitted: "지원서 제출됨", approved: "지원서 승인됨", changes_requested: "수정 요청됨", rejected: "지원서 거절됨" },
  "pt-BR": { title: "Atualizações da inscrição", submitted: "Inscrição enviada", approved: "Inscrição aprovada", changes_requested: "Alterações solicitadas", rejected: "Inscrição recusada" },
  ru: { title: "Обновления заявки", submitted: "Заявка отправлена", approved: "Заявка одобрена", changes_requested: "Запрошены изменения", rejected: "Заявка отклонена" },
  "zh-CN": { title: "申请动态", submitted: "申请已提交", approved: "申请已批准", changes_requested: "需要修改", rejected: "申请未通过" },
};

function isReviewUpdate(status: unknown): status is ReviewUpdate {
  return status === "submitted" || status === "approved" || status === "changes_requested" || status === "rejected";
}

export default async function CasterApplicationNotifications({ actor, locale }: { actor: string; locale: Locale }) {
  const notifications = await loadCasterApplicationNotifications(actor);
  const updates = notifications.flatMap((notification) => {
    const status = notification.metadata?.status;
    return isReviewUpdate(status) ? [{ ...notification, status }] : [];
  });
  if (!updates.length) return null;

  const copy = messages[locale];
  const formatter = new Intl.DateTimeFormat(toIntlLocale(locale), { dateStyle: "medium" });
  return (
    <section className="mt-8 border-t border-white/10 pt-5" aria-labelledby="caster-notifications-heading">
      <h2 id="caster-notifications-heading" className="text-lg font-black">{copy.title}</h2>
      <ul className="mt-3 divide-y divide-white/10">
        {updates.map((update) => (
          <li key={update.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <a href={`${CASTER_STUDIO_PATH}#application`} className="font-bold text-orange-200 underline focus-visible:outline-2">
              {copy[update.status]}
            </a>
            <time dateTime={update.created_at} className="text-zinc-400">{formatter.format(new Date(update.created_at))}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
