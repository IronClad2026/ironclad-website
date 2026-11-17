import { isReadyCategoryId, type ReadyCategoryId } from "./catalogue";

export const READY_SUGGESTION_MAX_LENGTH = 500;

type ReadySuggestion = {
  submissionId: string;
  description: string;
  categoryId: ReadyCategoryId | null;
};

export function readReadySuggestion(value: unknown): ReadySuggestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((key) => !["submissionId", "description", "categoryId"].includes(key))) return null;
  const { submissionId, description, categoryId } = value as Record<string, unknown>;
  if (typeof submissionId !== "string" || submissionId.length !== 36 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(submissionId) ||
    typeof description !== "string" || description.length > READY_SUGGESTION_MAX_LENGTH ||
    !description.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(description) ||
    (categoryId != null && !isReadyCategoryId(categoryId))) return null;

  const cleaned = description.replace(/\r\n?/g, "\n").trim();
  return cleaned ? { submissionId, description: cleaned, categoryId: categoryId ?? null } : null;
}
