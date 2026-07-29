import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const EXPECTED_PROJECT_REF = "nsyjtqpvyxlzyujlbzos";
export const EXPECTED_PROJECT_NAME = "ironclad-v2";
export const EXPECTED_REFERENCED_LEGACY_OBJECTS = 6;
export const EXPECTED_ORPHANED_LEGACY_OBJECTS = 1;
const BUCKET = "tournament-banners";
const MAX_BYTES = 10 * 1024 * 1024;
const PUBLIC_URL_PATH = `/storage/v1/object/public/${BUCKET}/`;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LEGACY_PATH_PATTERN =
  /^drafts\/[a-zA-Z0-9_-]+\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const OPAQUE_PATH_PATTERN =
  /^banners\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const MIME_BY_EXTENSION = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
class RemediationFailure extends Error {
  constructor(code, stage, report) {
    super(code);
    this.code = code;
    this.stage = stage;
    this.report = report;
  }
}
function fail(code, stage, report) {
  throw new RemediationFailure(code, stage, report);
}

function extensionOf(path) {
  return path.slice(path.lastIndexOf(".") + 1);
}
function makeReport(mode) {
  return {
    mode,
    projectVerified: false,
    referencedLegacyObjects: 0,
    orphanedLegacyObjects: 0,
    legacyObjects: 0,
    copiedObjects: 0,
    updatedReferences: 0,
    deletedObjects: 0,
    remainingLegacyReferences: null,
    remainingLegacyObjects: null,
    resumeCleanup: false,
    compensationCompleted: false,
    legacyCleanupJobReferences: 0,
  };
}
function parseLegacyUrl(value, publicPrefix) {
  if (typeof value !== "string" || !value.startsWith(publicPrefix)) return null;
  const path = value.slice(publicPrefix.length);
  return LEGACY_PATH_PATTERN.test(path) && value === `${publicPrefix}${path}`
    ? path
    : null;
}
function parseOpaqueUrl(value, publicPrefix) {
  if (typeof value !== "string" || !value.startsWith(publicPrefix)) return null;
  const path = value.slice(publicPrefix.length);
  return OPAQUE_PATH_PATTERN.test(path) && value === `${publicPrefix}${path}`
    ? path
    : null;
}
function validateObjectInfo(path, info, stage, report) {
  const extension = extensionOf(path);
  if (
    !info ||
    !UUID_V4_PATTERN.test(info.id) ||
    !Number.isSafeInteger(info.size) ||
    info.size <= 0 ||
    info.size > MAX_BYTES
  ) {
    fail("OBJECT_SIZE_MISMATCH", stage, report);
  }
  if (info.contentType !== MIME_BY_EXTENSION[extension]) {
    fail("OBJECT_MIME_MISMATCH", stage, report);
  }
  return {
    contentType: info.contentType,
    id: info.id,
    size: info.size,
  };
}
function buildPlan(rows, legacyObjects, publicPrefix, report) {
  const referenced = rows.map((row) => {
    if (
      !row ||
      !UUID_V4_PATTERN.test(row.id) ||
      typeof row.bannerImageUrl !== "string"
    ) {
      fail("REFERENCE_SHAPE_MISMATCH", "preflight", report);
    }
    const sourcePath = parseLegacyUrl(row.bannerImageUrl, publicPrefix);
    if (!sourcePath) {
      fail("REFERENCE_CLASSIFICATION_MISMATCH", "preflight", report);
    }
    return {
      id: row.id,
      oldUrl: row.bannerImageUrl,
      sourcePath,
    };
  });
  const referencedPaths = new Set(referenced.map((item) => item.sourcePath));
  const legacyPathSet = new Set(legacyObjects);

  if (
    referenced.length !== EXPECTED_REFERENCED_LEGACY_OBJECTS ||
    referencedPaths.size !== EXPECTED_REFERENCED_LEGACY_OBJECTS
  ) {
    fail("REFERENCE_COUNT_MISMATCH", "preflight", report);
  }
  if (
    legacyObjects.length !==
      EXPECTED_REFERENCED_LEGACY_OBJECTS +
        EXPECTED_ORPHANED_LEGACY_OBJECTS ||
    legacyPathSet.size !== legacyObjects.length ||
    legacyObjects.some((path) => !LEGACY_PATH_PATTERN.test(path))
  ) {
    fail("OBJECT_COUNT_MISMATCH", "preflight", report);
  }
  const orphanPaths = legacyObjects.filter(
    (path) => !referencedPaths.has(path)
  );
  if (orphanPaths.length !== EXPECTED_ORPHANED_LEGACY_OBJECTS) {
    fail("ORPHAN_COUNT_MISMATCH", "preflight", report);
  }
  if (referenced.some((item) => !legacyPathSet.has(item.sourcePath))) {
    fail("REFERENCED_OBJECT_MISSING", "preflight", report);
  }

  report.referencedLegacyObjects = referenced.length;
  report.orphanedLegacyObjects = orphanPaths.length;
  report.legacyObjects = legacyObjects.length;
  return { orphanPaths, referenced };
}
async function compensate(adapter, copied, report) {
  const rows = await adapter.readBannerReferences();
  const rowsById = new Map(rows.map((row) => [row.id, row.bannerImageUrl]));
  if (copied.some((item) => rowsById.get(item.id) !== item.oldUrl)) {
    return false;
  }
  const createdPaths = copied
    .filter((item) => item.created)
    .map((item) => item.destinationPath);
  if (createdPaths.length > 0) {
    await adapter.deleteObjects(createdPaths);
  }
  report.compensationCompleted = true;
  return true;
}

/**
 * @param {{
 *   adapter: any;
 *   mode?: "dry-run" | "apply";
 *   confirmedProjectRef?: string | null;
 * }} options
 */
export async function runRemediation({
  adapter,
  mode = "dry-run",
  confirmedProjectRef = null,
}) {
  const report = makeReport(mode);
  let stage = "project";
  const copied = [];
  let cutoverVerified = false;

  try {
    if (!["dry-run", "apply"].includes(mode)) {
      fail("MODE_INVALID", stage, report);
    }
    if (
      mode === "apply" &&
      confirmedProjectRef !== EXPECTED_PROJECT_REF
    ) {
      fail("APPLY_CONFIRMATION_MISMATCH", stage, report);
    }

    const project = await adapter.verifyProject();
    if (
      project?.ref !== EXPECTED_PROJECT_REF ||
      project?.name !== EXPECTED_PROJECT_NAME ||
      project?.bucket !== BUCKET ||
      project?.bucketPublic !== true ||
      project?.url !== `https://${EXPECTED_PROJECT_REF}.supabase.co`
    ) {
      fail("PROJECT_MISMATCH", stage, report);
    }
    report.projectVerified = true;

    const publicPrefix = `${project.url}${PUBLIC_URL_PATH}`;
    stage = "preflight";
    const rows = await adapter.readBannerReferences();
    const legacyObjects = await adapter.listLegacyObjects();
    const cleanupJobReferences =
      await adapter.countLegacyCleanupJobReferences();
    if (!Number.isSafeInteger(cleanupJobReferences)) {
      fail("CLEANUP_JOB_COUNT_MISMATCH", stage, report);
    }
    report.legacyCleanupJobReferences = cleanupJobReferences;
    if (cleanupJobReferences !== 0) {
      fail("LEGACY_CLEANUP_JOB_REFERENCE", stage, report);
    }
    const opaqueRows = rows.map((row) => ({
      ...row,
      path: parseOpaqueUrl(row.bannerImageUrl, publicPrefix),
    }));

    if (
      rows.length === EXPECTED_REFERENCED_LEGACY_OBJECTS &&
      opaqueRows.every((row) => UUID_V4_PATTERN.test(row.id) && row.path)
    ) {
      const opaquePaths = opaqueRows.map((row) => row.path);
      const sourceIds = opaquePaths.map((path) =>
        path.slice("banners/".length, path.lastIndexOf("."))
      );
      if (
        new Set(opaquePaths).size !== opaquePaths.length ||
        new Set(sourceIds).size !== sourceIds.length ||
        legacyObjects.length >
          EXPECTED_REFERENCED_LEGACY_OBJECTS +
            EXPECTED_ORPHANED_LEGACY_OBJECTS ||
        new Set(legacyObjects).size !== legacyObjects.length ||
        legacyObjects.some((path) => !LEGACY_PATH_PATTERN.test(path))
      ) {
        fail("RESUME_OBJECT_MISMATCH", stage, report);
      }
      const expectedSources = new Map();
      for (const row of opaqueRows) {
        const info = validateObjectInfo(
          row.path,
          await adapter.getObjectInfo(row.path),
          stage,
          report
        );
        if (!(await adapter.resolvePublicObject(row.bannerImageUrl, info))) {
          fail("RESUME_REFERENCE_MISMATCH", stage, report);
        }
        expectedSources.set(
          row.path.slice("banners/".length, row.path.lastIndexOf(".")),
          { extension: extensionOf(row.path), info }
        );
      }
      const seenLegacyIds = new Set();
      let orphanCount = 0;
      for (const path of legacyObjects) {
        const info = validateObjectInfo(
          path,
          await adapter.getObjectInfo(path),
          stage,
          report
        );
        if (seenLegacyIds.has(info.id)) {
          fail("RESUME_OBJECT_MISMATCH", stage, report);
        }
        seenLegacyIds.add(info.id);
        const expected = expectedSources.get(info.id);
        if (!expected) {
          orphanCount += 1;
        } else if (
          extensionOf(path) !== expected.extension ||
          info.size !== expected.info.size ||
          info.contentType !== expected.info.contentType
        ) {
          fail("RESUME_OBJECT_MISMATCH", stage, report);
        }
      }
      if (orphanCount > EXPECTED_ORPHANED_LEGACY_OBJECTS) {
        fail("RESUME_OBJECT_MISMATCH", stage, report);
      }
      report.projectVerified = true;
      report.resumeCleanup = true;
      report.legacyObjects = legacyObjects.length;
      report.orphanedLegacyObjects = orphanCount;
      report.remainingLegacyReferences = 0;
      report.remainingLegacyObjects = legacyObjects.length;
      if (mode === "dry-run") return report;

      stage = "delete";
      await adapter.deleteObjects(legacyObjects);
      report.deletedObjects = legacyObjects.length;
      const finalRows = await adapter.readBannerReferences();
      const finalObjects = await adapter.listLegacyObjects();
      const expectedUrls = new Map(
        opaqueRows.map((row) => [row.id, row.bannerImageUrl])
      );
      report.remainingLegacyReferences = finalRows.filter((row) =>
        parseLegacyUrl(row.bannerImageUrl, publicPrefix)
      ).length;
      report.remainingLegacyObjects = finalObjects.length;
      if (
        finalRows.length !== EXPECTED_REFERENCED_LEGACY_OBJECTS ||
        finalRows.some(
          (row) => expectedUrls.get(row.id) !== row.bannerImageUrl
        ) ||
        report.remainingLegacyReferences !== 0 ||
        finalObjects.length !== 0
      ) {
        fail("FINAL_PROOF_MISMATCH", "final-proof", report);
      }
      return report;
    }

    const plan = buildPlan(rows, legacyObjects, publicPrefix, report);

    for (const item of plan.referenced) {
      const info = await adapter.getObjectInfo(item.sourcePath);
      item.sourceInfo = validateObjectInfo(
        item.sourcePath,
        info,
        stage,
        report
      );
    }
    for (const orphanPath of plan.orphanPaths) {
      validateObjectInfo(
        orphanPath,
        await adapter.getObjectInfo(orphanPath),
        stage,
        report
      );
    }

    if (mode === "dry-run") {
      report.remainingLegacyReferences = report.referencedLegacyObjects;
      report.remainingLegacyObjects = report.legacyObjects;
      return report;
    }

    stage = "copy";
    for (const item of plan.referenced) {
      const extension = extensionOf(item.sourcePath);
      const destinationPath = `banners/${item.sourceInfo.id}.${extension}`;
      if (!OPAQUE_PATH_PATTERN.test(destinationPath)) {
        fail("DESTINATION_MISMATCH", stage, report);
      }

      const newUrl = `${publicPrefix}${destinationPath}`;
      const destinationExisted =
        await adapter.objectExists(destinationPath);
      copied.push({
        ...item,
        created: !destinationExisted,
        destinationPath,
        newUrl,
      });
      if (!destinationExisted) {
        await adapter.copyObject(item.sourcePath, destinationPath);
        report.copiedObjects += 1;
      }
      const destinationInfo = validateObjectInfo(
        destinationPath,
        await adapter.getObjectInfo(destinationPath),
        stage,
        report
      );
      if (
        destinationInfo.size !== item.sourceInfo.size ||
        destinationInfo.contentType !== item.sourceInfo.contentType
      ) {
        fail("COPY_VERIFICATION_MISMATCH", stage, report);
      }

      if (!(await adapter.resolvePublicObject(newUrl, item.sourceInfo))) {
        fail("COPY_RESOLUTION_MISMATCH", stage, report);
      }
    }

    stage = "update";
    let updateAccepted = false;
    try {
      updateAccepted = await adapter.updateReferences(
        copied.map(({ id, oldUrl, newUrl }) => ({ id, oldUrl, newUrl }))
      );
    } catch {
      updateAccepted = false;
    }
    const updatedRows = await adapter.readBannerReferences();
    const expectedById = new Map(copied.map((item) => [item.id, item]));
    const exactCutover =
      updatedRows.length === EXPECTED_REFERENCED_LEGACY_OBJECTS &&
      updatedRows.every((row) => {
        const expected = expectedById.get(row.id);
        return expected && row.bannerImageUrl === expected.newUrl;
      });
    if (!exactCutover) {
      fail(
        updateAccepted
          ? "UPDATED_REFERENCE_COUNT_MISMATCH"
          : "UPDATE_MISMATCH",
        stage,
        report
      );
    }
    report.updatedReferences = copied.length;
    cutoverVerified = true;

    stage = "cutover-verification";
    for (const row of updatedRows) {
      const expected = expectedById.get(row.id);
      if (
        !expected ||
        row.bannerImageUrl !== expected.newUrl ||
        parseOpaqueUrl(row.bannerImageUrl, publicPrefix) !==
          expected.destinationPath ||
        !(await adapter.resolvePublicObject(
          row.bannerImageUrl,
          expected.sourceInfo
        ))
      ) {
        fail("UPDATED_REFERENCE_VERIFICATION_MISMATCH", stage, report);
      }
    }

    stage = "delete";
    const exactSources = [
      ...copied.map((item) => item.sourcePath),
      ...plan.orphanPaths,
    ];
    await adapter.deleteObjects(exactSources);
    report.deletedObjects = exactSources.length;

    stage = "final-proof";
    const finalRows = await adapter.readBannerReferences();
    const remainingLegacyObjects = await adapter.listLegacyObjects();
    report.remainingLegacyReferences = finalRows.filter((row) =>
      parseLegacyUrl(row.bannerImageUrl, publicPrefix)
    ).length;
    report.remainingLegacyObjects = remainingLegacyObjects.length;

    if (
      finalRows.length !== EXPECTED_REFERENCED_LEGACY_OBJECTS ||
      finalRows.some(
        (row) => !parseOpaqueUrl(row.bannerImageUrl, publicPrefix)
      ) ||
      report.remainingLegacyReferences !== 0 ||
      report.remainingLegacyObjects !== 0
    ) {
      fail("FINAL_PROOF_MISMATCH", stage, report);
    }

    return report;
  } catch (error) {
    if (!cutoverVerified && copied.length > 0) {
      const restored = await compensate(adapter, copied, report).catch(
        () => false
      );
      if (!restored) {
        throw new RemediationFailure(
          "COMPENSATION_FAILED",
          "compensation",
          report
        );
      }
    }
    if (error instanceof RemediationFailure) throw error;
    throw new RemediationFailure("PROVIDER_OPERATION_FAILED", stage, report);
  }
}

async function listAllFiles(storage, startPath) {
  const folders = [startPath];
  const files = [];

  while (folders.length > 0) {
    const folder = folders.shift();
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(folder, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error || !data) throw new Error("LIST_FAILED");

      for (const entry of data) {
        const path = `${folder}/${entry.name}`;
        if (entry.id === null || entry.metadata === null) {
          folders.push(path);
        } else {
          files.push(path);
        }
      }
      if (data.length < 100) break;
    }
  }
  return files;
}
export function buildReferenceUpdateQuery(changes, publicPrefix) {
  const expectedPrefix =
    `https://${EXPECTED_PROJECT_REF}.supabase.co${PUBLIC_URL_PATH}`;
  if (
    publicPrefix !== expectedPrefix ||
    changes.length !== EXPECTED_REFERENCED_LEGACY_OBJECTS ||
    changes.some(
      ({ id, oldUrl, newUrl }) =>
        !UUID_V4_PATTERN.test(id) ||
        !parseLegacyUrl(oldUrl, publicPrefix) ||
        !parseOpaqueUrl(newUrl, publicPrefix)
    )
  ) {
    return null;
  }
  const values = changes
    .map(({ id, oldUrl, newUrl }) => {
      const oldPath = parseLegacyUrl(oldUrl, publicPrefix);
      const oldFile = oldPath
        .slice(oldPath.lastIndexOf("/") + 1)
        .replace(".", "[.]");
      return `('${id}'::uuid, '${oldFile}', '${newUrl}')`;
    })
    .join(", ");
  const legacyPattern =
    `${expectedPrefix.replaceAll(".", "[.]")}drafts/[A-Za-z0-9_-]+/`;
  return `do $ironclad$ declare v_matches integer; v_updated integer;
begin
  with changes(id, old_file, new_url) as (values ${values})
  select count(*) into v_matches from changes c join public.tournaments t
    on t.id = c.id and t.banner_image_url ~ ('^${legacyPattern}' || c.old_file || '$');
  if v_matches <> 6 then raise exception 'reference mismatch'; end if;
  with changes(id, old_file, new_url) as (values ${values})
  update public.tournaments t set banner_image_url = c.new_url
  from changes c where t.id = c.id
    and t.banner_image_url ~ ('^${legacyPattern}' || c.old_file || '$');
  get diagnostics v_updated = row_count;
  if v_updated <> 6 then raise exception 'update mismatch'; end if;
end $ironclad$;`;
}
export function createLiveAdapter(env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  if (!url || !serviceRoleKey || !accessToken) {
    throw new RemediationFailure(
      "ENVIRONMENT_MISSING",
      "startup",
      makeReport("unknown")
    );
  }

  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co` ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new RemediationFailure(
      "PROJECT_URL_MISMATCH",
      "startup",
      makeReport("unknown")
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const storage = supabase.storage.from(BUCKET);

  return {
    async verifyProject() {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${EXPECTED_PROJECT_REF}`,
        {
          redirect: "error",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const project = response.ok ? await response.json() : null;
      const { data: bucket, error } =
        await supabase.storage.getBucket(BUCKET);
      if (error || !bucket) throw new Error("PROJECT_CHECK_FAILED");
      return {
        ref: project?.id,
        name: project?.name,
        bucket: bucket.id,
        bucketPublic: bucket.public,
        url,
      };
    },
    async readBannerReferences() {
      const { data, error } = await supabase
        .from("tournaments")
        .select("id, banner_image_url")
        .not("banner_image_url", "is", null);
      if (error || !data) throw new Error("REFERENCE_READ_FAILED");
      return data.map((row) => ({
        id: String(row.id),
        bannerImageUrl: String(row.banner_image_url),
      }));
    },
    async listLegacyObjects() {
      return listAllFiles(storage, "drafts");
    },
    async countLegacyCleanupJobReferences() {
      let count = 0;
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("tournament_deletion_jobs")
          .select("banner_paths")
          .range(from, from + 999);
        if (error || !data) throw new Error("CLEANUP_JOB_READ_FAILED");
        count += data.flatMap((job) =>
          Array.isArray(job.banner_paths) ? job.banner_paths : []
        ).filter(
          (path) => typeof path === "string" && path.startsWith("drafts/")
        ).length;
        if (data.length < 1000) return count;
      }
    },
    async getObjectInfo(path) {
      const { data, error } = await storage.info(path);
      if (error || !data) throw new Error("OBJECT_INFO_FAILED");
      return {
        contentType: data.contentType,
        id: data.id,
        size: data.size,
      };
    },
    async objectExists(path) {
      const fileName = path.slice("banners/".length);
      const { data, error } = await storage.list("banners", {
        limit: 10,
        search: fileName,
      });
      if (error || !data) throw new Error("OBJECT_EXISTS_CHECK_FAILED");
      return data.some((object) => object.name === fileName);
    },
    async copyObject(sourcePath, destinationPath) {
      const { error } = await storage.copy(sourcePath, destinationPath);
      if (error) throw new Error("COPY_FAILED");
    },
    async resolvePublicObject(publicUrl, expectedInfo) {
      const response = await fetch(publicUrl, {
        cache: "no-store",
        headers: { Range: "bytes=0-15" },
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim();
      return response.ok && contentType === expectedInfo.contentType;
    },
    async updateReferences(changes) {
      const publicPrefix = `${url}${PUBLIC_URL_PATH}`;
      const query = buildReferenceUpdateQuery(changes, publicPrefix);
      if (!query) return false;
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${EXPECTED_PROJECT_REF}/database/query`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        }
      );
      return response.ok;
    },
    async deleteObjects(paths) {
      if (paths.length === 0) return;
      const { error } = await storage.remove(paths);
      if (error) throw new Error("DELETE_FAILED");
    },
  };
}
function readCliOptions(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run");
  if (apply && dryRun) {
    throw new RemediationFailure(
      "MODE_INVALID",
      "startup",
      makeReport("unknown")
    );
  }
  const confirmation = argv
    .find((value) => value.startsWith("--confirm-project-ref="))
    ?.slice("--confirm-project-ref=".length);
  return {
    confirmedProjectRef: confirmation ?? null,
    mode: apply ? "apply" : "dry-run",
  };
}
function safeFailure(error) {
  if (error instanceof RemediationFailure) {
    return {
      ok: false,
      code: error.code,
      stage: error.stage,
      report: error.report,
    };
  }
  return {
    ok: false,
    code: "UNEXPECTED_FAILURE",
    stage: "startup",
    report: makeReport("unknown"),
  };
}
async function main() {
  try {
    const options = readCliOptions(process.argv.slice(2));
    const report = await runRemediation({
      adapter: createLiveAdapter(),
      ...options,
    });
    console.log(JSON.stringify({ ok: true, report }));
  } catch (error) {
    console.error(JSON.stringify(safeFailure(error)));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
