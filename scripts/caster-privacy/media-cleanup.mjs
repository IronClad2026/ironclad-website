import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const bucket = "caster-application-media";
const projects = new Set(["zzbnneprhjicmajpjkdg", "nsyjtqpvyxlzyujlbzos"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const subject = /^user_[a-zA-Z0-9_]{1,150}$/;

function validateSelection(actor, ids) {
  if (typeof actor !== "string" || !subject.test(actor) || !Array.isArray(ids) ||
      ids.length === 0 || ids.length > 25 || ids.some((id) => typeof id !== "string" || !uuid.test(id)) ||
      new Set(ids).size !== ids.length) {
    throw new Error("Use one valid privacy operator and 1–25 distinct reviewed asset IDs.");
  }
}

export async function runCasterMediaCleanup(client, actor, ids) {
  validateSelection(actor, ids);
  const { data: claim, error: claimError } = await client.rpc("caster_privacy_media_claim", {
    p_actor: actor, p_media_ids: ids,
  });
  if (claimError || claim?.status !== "ok") {
    throw new Error("Media cleanup claim was denied, disabled or unavailable.");
  }

  const assets = claim.assets;
  const requested = new Set(ids);
  const paths = new Set();
  if (!Array.isArray(assets) || assets.length > ids.length || assets.some((item) => {
    if (!item || !requested.delete(item.id) || typeof item.path !== "string" || paths.has(item.path)) return true;
    const [application, filename, extra] = item.path.split("/");
    if (!uuid.test(application) || filename !== `${item.id}.webp` || extra !== undefined) return true;
    paths.add(item.path);
    return false;
  })) {
    throw new Error("Unexpected claimed media metadata. No Storage request was made.");
  }

  for (const { id, path } of assets) {
    const { error: storageError } = await client.storage.from(bucket).remove([path]);
    if (storageError) throw new Error("Storage cleanup stopped. The batch can be retried with the same approval.");
    const { data: finalized, error: finalizeError } = await client.rpc("caster_privacy_media_finish", {
      p_actor: actor, p_media_id: id,
    });
    if (finalizeError || finalized?.status !== "ok") {
      throw new Error("Media cleanup stopped before finalization. Retry the same reviewed batch.");
    }
  }
  return { finalized: assets.length, alreadyFinalized: ids.length - assets.length };
}

async function main([mode, project, filename, confirmation, ...extra]) {
  if (!["review", "apply"].includes(mode) || !projects.has(project) || !filename || extra.length ||
      (mode === "review" ? confirmation !== undefined : !/^[0-9a-f]{64}$/.test(confirmation ?? ""))) {
    throw new Error("Use review <project> <private-batch.json> or apply <project> <private-batch.json> <approved-sha256>.");
  }
  const bytes = await readFile(filename);
  const reviewed = JSON.parse(bytes.toString("utf8"));
  if (!reviewed || reviewed.project !== project || Object.keys(reviewed).sort().join(",") !== "actor,ids,project") {
    throw new Error("Private batch must contain the exact project, actor and reviewed IDs.");
  }
  validateSelection(reviewed.actor, reviewed.ids);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (mode === "review") {
    console.log(JSON.stringify({ project, count: reviewed.ids.length, sha256: digest, applied: false }));
    return;
  }
  const origin = `https://${project}.supabase.co`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (confirmation !== digest || process.env.NEXT_PUBLIC_SUPABASE_URL !== origin || !serviceKey) {
    throw new Error("Reviewed batch or effective Supabase configuration did not match.");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const exactProjectOnly = (input, options) => {
    if (new URL(input instanceof Request ? input.url : input).origin !== origin) {
      throw new Error("Unexpected Storage or RPC destination.");
    }
    return fetch(input, { ...options, redirect: "error" });
  };
  const client = createClient(origin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: exactProjectOnly },
  });
  const result = await runCasterMediaCleanup(client, reviewed.actor, reviewed.ids);
  console.log(JSON.stringify({ project, ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main(process.argv.slice(2));
  } catch {
    console.error("Caster media cleanup stopped. Check authorised project, operator, reviewed batch and database maintenance control.");
    process.exitCode = 1;
  }
}
