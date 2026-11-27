import type { ReadyQuestionId } from "./catalogue";
import { readyQuestionCatalogue } from "./catalogue";
import { answerKnowledgeTopic } from "./knowledge";
import type { ReadyDocumentVersions } from "./knowledge-sources";

export function readyQuestionPreview(id: ReadyQuestionId, versions?: ReadyDocumentVersions) {
  return answerKnowledgeTopic(readyQuestionCatalogue[id].topic, versions ? {
    kind: "known", eventTitle: "the selected event", versions,
  } : { kind: "general" });
}
