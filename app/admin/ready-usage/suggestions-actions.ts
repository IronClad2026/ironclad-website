"use server";

import { redirect } from "next/navigation";

import { mutateReadySuggestion, readySuggestionFilters } from "@/lib/ready/suggestions-admin";

export async function reviewReadyTopicSuggestion(formData: FormData) {
  const notice = await mutateReadySuggestion(
    formData.get("id"),
    formData.get("status"),
    formData.get("operation"),
  );
  if (notice === "unauthorized") redirect("/");

  const { status, page } = readySuggestionFilters(formData.get("filterStatus"), formData.get("page"));
  const query = new URLSearchParams({ view: "suggestions", notice });
  if (status) query.set("suggestionStatus", status);
  if (page > 1) query.set("suggestionPage", String(page));

  redirect(`/admin/ready-usage?${query}#ready-suggestions-heading`);
}
