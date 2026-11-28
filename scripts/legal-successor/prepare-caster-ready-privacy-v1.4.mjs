import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const folder = new URL("docs/legal-drafts/caster-ready-privacy-v1.4/", root);
const filename = "ironclad-privacy-policy-v1.4.pdf";
const source = new URL("content/legal-corpus.json", root);
const renderer = new URL("scripts/legal-successor/render-privacy-v1.4-review.py", root);
const manifest = new URL("review-manifest.json", folder);
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
const allowedSource = JSON.parse(readFileSync(source, "utf8"));
const policy = allowedSource.documents.find((document) => document.kind === "privacy");
assert.equal(allowedSource.schemaVersion, 1);
assert.equal(policy?.version, "1.3");
assert.equal(policy.status, "Effective");
assert.equal(policy.sections.length, 26);

const additions = {
  2: [
    "This Policy also covers the IronClad Caster Programme and the Ready assistant, including programme invitations, application review, published profiles and tournament recordings, and optional Ready functions where enabled.",
  ],
  3: [
    "Caster information can include your signed-in account identifier, verified email, display name, country, broadcasting languages, optional Discord details, biography, games, experience, channel links and uploaded images. It also includes the tournament, division or match you associate with a published recording, the recording link, title and optional description, and decisions staff make about applications, memberships and content.",
    "When you submit a Ready suggestion, we receive the text you enter, the topic if chosen, a random submission identifier, its time and status. Please avoid including personal information in free text. Ready outfit preferences, where available, are associated with your account.",
  ],
  5: [
    "We use caster information to administer invitations and applications, review suitability, manage memberships, deliver profiles and tournament recordings you choose to publish, verify historical coverage, moderate content and investigate abuse.",
    "Ready uses prepared answers and platform actions. Its optional usage analytics is a separate choice. When enabled and permitted by that choice, it measures deliberate interactions, displayed answers, destination categories and optional helpfulness votes. It excludes written suggestions, private match details, morale answers and contact details. You can use Ready with this choice off.",
  ],
  8: [
    "Caster account emails, private Discord details, reviewer information, unpublished revisions and private media are limited to authorised access. Country is private by default. We show it on an approved public caster profile only if you choose to display it. Caster membership is separate from competitive player permissions.",
  ],
  14: [
    "When you publish a tournament recording, its title, optional description, provider link and relevant competition details appear in Tournament Media and on your public caster profile. Unpublishing removes the recording from both IronClad views. An official caster's own publication is distinct from administrator-verified coverage.",
    "After account closure, verified historical coverage may retain the public label Former Caster with the relevant event and date when the event remains public. IronClad supplies no link to the former profile, personal handle, avatar, contact details or recording link from that credit. A historic event or a third party's own copy may still contain information outside that credit. Contact us to request a correction or removal.",
  ],
  15: [
    "Opening a YouTube or Twitch watch link takes you to that provider. If you choose to load an embedded player, the provider receives the information needed to deliver it, which may include network, device and browser information. The provider applies its own privacy terms.",
  ],
  17: [
    "We use a short-lived first-party invitation continuation to help you resume a caster invitation. We store a digest of its opaque value. Opted-in Ready usage analytics uses a random tab identifier and a separate private consent record. Ready usage events stay in the service database and are excluded from public-site analytics. Deliberately submitted Ready suggestions are kept separately from those events.",
  ],
  18: [
    "We review the continued need for Caster Programme information using the periods below. These periods start at the relevant event described in the schedule. Eligibility for disposal is separate from the date when disposal is completed. Before erasing or minimising records, an authorised operator checks linked records, current publication and any documented hold.",
    "Deadlines for access are separate from retention. An invitation can ordinarily be used for seven days, and its continuation lasts no more than 30 minutes. Revoking or claiming an invitation ends its use by another account.",
    "For programme records covered by the cleanup process, we restrict private access, remove no-longer-needed contents or direct identifiers, and retain only records needed for a continuing purpose. A hold is limited to the affected material and reviewed for as long as its purpose remains. Referenced uploads remain available to the authorised activity that still needs them.",
    "If retained copies are restored from backup, access and eligible erasure must be reconciled before affected data is returned to normal use. This Policy does not promise erasure of copies outside IronClad's control.",
    "When Ready engagement is enabled, the retention review considers detailed opted-in usage and voluntarily submitted suggestions at about 90 days, and daily totals without account or session identifiers at 12 months. The choice to withdraw stops new usage collection once saved. We apply existing account closure and withdrawal controls separately from routine retention.",
  ],
  19: [
    "Closing an account ends access to Caster Studio and withdraws the current public caster profile, its media delivery, directory and homepage promotion, and self-published tournament recordings. Minimal closure, legal, audit or verified event evidence may remain for the purposes and periods set out in this Policy.",
  ],
};

const schedule = [
  ["Unused invitations", "Review a revoked or expired unused invitation 90 days after its revocation or expiry. Remove identifying references and obsolete invitation records where eligible."],
  ["Private applications", "Review an unsubmitted application or an application returned for changes after 120 days without activity. Review a rejected application 90 days after the rejection decision. Keep necessary active review or appeal material while it is in use."],
  ["Private and replaced uploads", "Review uploads after at least 30 days without a retained reference. Keep files required by current drafts, reviews or publications. Remove eligible objects through private Storage maintenance."],
  ["Revisions and tournament recordings", "Review superseded revisions and withdrawn or moderated recordings after 90 days from replacement or the relevant decision. Preserve current publications and records required for active review, correction or a hold."],
  ["Inactive membership", "After 90 days from inactivity or a final suspension, review the private profile for reactivation, appeal and any continuing purpose. Preserve the minimum membership evidence needed for governed history."],
  ["Staff and moderation evidence", "Review identifiable audit details 12 months after the recorded action and retain minimal timing, action and accountability evidence where needed. Private feedback is collected for the application and its review."],
  ["Account closure and verified history", "After 30 days from closure, review Caster Programme contacts, private contents and links to identify eligible erasure. Necessary internal closure and historical tournament facts may remain, subject to applicable holds and separate requirements."],
];

for (const section of policy.sections) {
  if (additions[section.number]) {
    section.blocks.push(...additions[section.number].map((text) => ({ type: "paragraph", text })));
  }
  if (section.number === "18") {
    section.blocks.push({ type: "table", headers: ["Programme record", "Retention review"], rows: schedule });
  }
}
Object.assign(policy, {
  version: "1.4", status: "Review Draft", effectiveDate: null, filename, publicPath: `/documents-rules-ppa/${filename}`,
});

function buildManifest() {
  const pdf = readFileSync(new URL(filename, folder));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert(!existsSync(new URL(`public/documents-rules-ppa/${filename}`, root)));
  return {
    version: "1.4", status: "Review Draft", effectiveDate: null, predecessor: "1.3",
    draftTextSha256: checksum(JSON.stringify(policy)),
    pdfSha256: checksum(pdf),
    noticeSha256: checksum(readFileSync(new URL("caster-programme-notice.md", folder), "utf8").replaceAll("\r\n", "\n")),
  };
}

if (process.argv[2] === "--check") {
  assert.deepEqual(buildManifest(), JSON.parse(readFileSync(manifest, "utf8")));
  console.log("Privacy 1.4 review artifacts match. Privacy 1.3 remains effective in the release corpus.");
} else {
  const draftPath = new URL(".privacy-1.4-render-input.json", folder);
  mkdirSync(folder, { recursive: true });
  writeFileSync(draftPath, JSON.stringify(policy, null, 2) + "\n", { flag: "wx" });
  try {
    const python = process.argv[2] ?? (process.platform === "win32" ? "python" : "python3");
    const render = spawnSync(python, [fileURLToPath(renderer)], {
      cwd: fileURLToPath(root), stdio: "inherit",
    });
    if (render.error || render.status !== 0) throw render.error ?? new Error("Review draft generation failed.");
    const metadata = buildManifest();
    writeFileSync(manifest, JSON.stringify(metadata, null, 2) + "\n");
    console.log(JSON.stringify(metadata));
  } finally {
    unlinkSync(draftPath);
  }
}
