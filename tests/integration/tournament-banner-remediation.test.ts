import { describe, expect, it, vi } from "vitest";
import {
  buildReferenceUpdateQuery,
  createLiveAdapter,
  EXPECTED_PROJECT_NAME,
  EXPECTED_PROJECT_REF,
  runRemediation,
} from "@/scripts/remediate-tournament-banner-paths.mjs";

const projectUrl = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const publicPrefix =
  `${projectUrl}/storage/v1/object/public/tournament-banners/`;
const privateProviderValue =
  "drafts/user_private/token.png Bearer credential provider-detail";

type FailureOptions = {
  bucketPublic?: boolean;
  copy?: number;
  delete?: boolean;
  mime?: boolean;
  objectCount?: boolean;
  orphanCount?: boolean;
  postDeleteReferenceDrift?: boolean;
  project?: boolean;
  projectName?: boolean;
  referenceCount?: boolean;
  resolution?: number;
  size?: boolean;
  update?: boolean;
  cleanupJobReferences?: number;
};

function fixtureUuid(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function createAdapter(failures: FailureOptions = {}) {
  const referencedPaths = Array.from(
    { length: 6 },
    (_, index) => `drafts/user_private_${index}/${fixtureUuid(index + 1)}.png`
  );
  const orphanPath = `drafts/user_private_orphan/${fixtureUuid(7)}.png`;
  const unrelatedPath = `banners/${fixtureUuid(99)}.png`;
  const rows = new Map(
    referencedPaths.map((path, index) => [
      fixtureUuid(index + 101),
      `${publicPrefix}${path}`,
    ])
  );
  if (failures.referenceCount) {
    rows.delete(fixtureUuid(106));
  }
  const objects = new Map<
    string,
    { contentType: string; id: string; size: number }
  >(
    [...referencedPaths, orphanPath, unrelatedPath].map((path, index) => [
      path,
      {
        contentType: "image/png",
        id: fixtureUuid(index + 201),
        size: 1024,
      },
    ])
  );
  if (failures.objectCount) {
    objects.delete(orphanPath);
  }
  if (failures.orphanCount) {
    objects.delete(referencedPaths[5]);
    objects.set(
      `drafts/user_private_extra/${fixtureUuid(8)}.png`,
      {
        contentType: "image/png",
        id: fixtureUuid(208),
        size: 1024,
      }
    );
  }
  const events: string[] = [];
  const deletedPaths: string[][] = [];
  let copyCalls = 0;
  let resolveCalls = 0;

  const adapter = {
    async verifyProject() {
      return {
        ref: failures.project ? "wrong-project" : EXPECTED_PROJECT_REF,
        name: failures.projectName ? "wrong-name" : EXPECTED_PROJECT_NAME,
        bucket: "tournament-banners",
        bucketPublic: failures.bucketPublic !== false,
        url: projectUrl,
      };
    },
    async readBannerReferences() {
      return [...rows].map(([id, bannerImageUrl]) => ({ id, bannerImageUrl }));
    },
    async listLegacyObjects() {
      return [...objects.keys()].filter((path) => path.startsWith("drafts/"));
    },
    async countLegacyCleanupJobReferences() {
      return failures.cleanupJobReferences ?? 0;
    },
    async getObjectInfo(path: string) {
      const info = objects.get(path);
      if (!info) throw new Error(privateProviderValue);
      if (path === referencedPaths[0] && failures.mime) {
        return { ...info, contentType: "image/jpeg" };
      }
      if (path === referencedPaths[0] && failures.size) {
        return { ...info, size: 10 * 1024 * 1024 + 1 };
      }
      return { ...info };
    },
    async objectExists(path: string) {
      return objects.has(path);
    },
    async copyObject(sourcePath: string, destinationPath: string) {
      copyCalls += 1;
      events.push("copy");
      if (failures.copy === copyCalls) {
        throw new Error(privateProviderValue);
      }
      const info = objects.get(sourcePath);
      if (!info) throw new Error(privateProviderValue);
      objects.set(destinationPath, { ...info });
    },
    async resolvePublicObject() {
      resolveCalls += 1;
      events.push("resolve");
      return failures.resolution !== resolveCalls;
    },
    async updateReferences(
      changes: { id: string; oldUrl: string; newUrl: string }[]
    ) {
      events.push("update");
      if (failures.update) return false;
      if (changes.some(({ id, oldUrl }) => rows.get(id) !== oldUrl)) {
        return false;
      }
      for (const { id, newUrl } of changes) rows.set(id, newUrl);
      return true;
    },
    async deleteObjects(paths: string[]) {
      events.push("delete");
      deletedPaths.push([...paths]);
      if (failures.delete) throw new Error(privateProviderValue);
      for (const path of paths) objects.delete(path);
      if (
        failures.postDeleteReferenceDrift &&
        paths.some((path) => path.startsWith("drafts/"))
      ) {
        rows.set(
          fixtureUuid(101),
          `${publicPrefix}${referencedPaths[0]}`
        );
      }
    },
  };

  return {
    adapter,
    deletedPaths,
    events,
    objects,
    orphanPath,
    referencedPaths,
    rows,
    unrelatedPath,
    destinationPaths: referencedPaths.map(
      (_path, index) => `banners/${fixtureUuid(index + 201)}.png`
    ),
  };
}

describe("tournament banner remediation guard", () => {
  it("reports the accepted six references and one orphan in dry-run without writes", async () => {
    const fixture = createAdapter();

    await expect(
      runRemediation({ adapter: fixture.adapter, mode: "dry-run" })
    ).resolves.toMatchObject({
      mode: "dry-run",
      projectVerified: true,
      referencedLegacyObjects: 6,
      orphanedLegacyObjects: 1,
      legacyObjects: 7,
      copiedObjects: 0,
      updatedReferences: 0,
      deletedObjects: 0,
    });
    expect(fixture.events).toEqual([]);
    expect(fixture.deletedPaths).toEqual([]);
  });

  it("copies, verifies, updates six references, and deletes only seven exact sources", async () => {
    const fixture = createAdapter();

    const report = await runRemediation({
      adapter: fixture.adapter,
      mode: "apply",
      confirmedProjectRef: EXPECTED_PROJECT_REF,
    });

    expect(report).toMatchObject({
      copiedObjects: 6,
      updatedReferences: 6,
      deletedObjects: 7,
      remainingLegacyReferences: 0,
      remainingLegacyObjects: 0,
    });
    expect(fixture.objects.has(fixture.unrelatedPath)).toBe(true);
    const deleted = fixture.deletedPaths.at(-1) ?? [];
    expect(new Set(deleted)).toEqual(
      new Set([...fixture.referencedPaths, fixture.orphanPath])
    );
    expect(fixture.objects.has(fixture.unrelatedPath)).toBe(true);
    expect(fixture.events.indexOf("update")).toBeGreaterThan(
      fixture.events.lastIndexOf("copy")
    );
    expect(fixture.events.lastIndexOf("delete")).toBeGreaterThan(
      fixture.events.lastIndexOf("update")
    );
    expect(
      [...fixture.rows.values()].every((url) =>
        url.startsWith(`${publicPrefix}banners/`)
      )
    ).toBe(true);
  });

  it.each([
    ["project", { project: true }, "PROJECT_MISMATCH"],
    ["project name", { projectName: true }, "PROJECT_MISMATCH"],
    ["bucket visibility", { bucketPublic: false }, "PROJECT_MISMATCH"],
    ["reference count", { referenceCount: true }, "REFERENCE_COUNT_MISMATCH"],
    ["object count", { objectCount: true }, "OBJECT_COUNT_MISMATCH"],
    ["orphan count", { orphanCount: true }, "ORPHAN_COUNT_MISMATCH"],
    ["MIME", { mime: true }, "OBJECT_MIME_MISMATCH"],
    ["size", { size: true }, "OBJECT_SIZE_MISMATCH"],
    ["copy", { copy: 2 }, "PROVIDER_OPERATION_FAILED"],
    ["resolution", { resolution: 2 }, "COPY_RESOLUTION_MISMATCH"],
    ["update", { update: true }, "UPDATE_MISMATCH"],
    [
      "cleanup job reference",
      { cleanupJobReferences: 1 },
      "LEGACY_CLEANUP_JOB_REFERENCE",
    ],
  ])(
    "stops safely on a %s mismatch",
    async (_name, failures, expectedCode) => {
      const fixture = createAdapter(failures);

      await expect(
        runRemediation({
          adapter: fixture.adapter,
          mode: "apply",
          confirmedProjectRef: EXPECTED_PROJECT_REF,
        })
      ).rejects.toMatchObject({ code: expectedCode });
      const sourceDeletes = fixture.deletedPaths
        .flat()
        .filter((path) => path.startsWith("drafts/"));
      expect(sourceDeletes).toEqual([]);
      expect(
        [...fixture.rows.values()].every((url) =>
          url.startsWith(`${publicPrefix}drafts/`)
        )
      ).toBe(true);
      if (["copy", "resolution", "update"].includes(String(_name))) {
        expect(
          fixture.destinationPaths.some((path) => fixture.objects.has(path))
        ).toBe(false);
      }
    }
  );

  it("preserves an atomic cutover for safe resume when verification fails", async () => {
    const failures = { resolution: 7 };
    const fixture = createAdapter(failures);

    await expect(
      runRemediation({
        adapter: fixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      })
    ).rejects.toMatchObject({
      code: "UPDATED_REFERENCE_VERIFICATION_MISMATCH",
    });
    expect(
      [...fixture.rows.values()].every((url) =>
        url.startsWith(`${publicPrefix}banners/`)
      )
    ).toBe(true);
    expect(
      fixture.destinationPaths.every((path) => fixture.objects.has(path))
    ).toBe(true);
    expect(fixture.referencedPaths.every((path) => fixture.objects.has(path)))
      .toBe(true);
    expect(fixture.objects.has(fixture.orphanPath)).toBe(true);
    expect(fixture.objects.has(fixture.unrelatedPath)).toBe(true);

    failures.resolution = 0;
    await expect(
      runRemediation({
        adapter: fixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      })
    ).resolves.toMatchObject({
      resumeCleanup: true,
      remainingLegacyObjects: 0,
    });
  });

  it("resumes exact legacy cleanup after a post-cutover delete failure", async () => {
    const failures = { delete: true };
    const fixture = createAdapter(failures);

    await expect(
      runRemediation({
        adapter: fixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_OPERATION_FAILED",
      stage: "delete",
    });
    expect(
      [...fixture.rows.values()].every((url) =>
        url.startsWith(`${publicPrefix}banners/`)
      )
    ).toBe(true);
    expect(fixture.referencedPaths.every((path) => fixture.objects.has(path)))
      .toBe(true);

    failures.delete = false;
    await expect(
      runRemediation({
        adapter: fixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      })
    ).resolves.toMatchObject({
      resumeCleanup: true,
      remainingLegacyReferences: 0,
      remainingLegacyObjects: 0,
      deletedObjects: 7,
    });
    expect(fixture.objects.has(fixture.unrelatedPath)).toBe(true);
  });

  it("refuses resume cleanup when a legacy object lacks destination provenance", async () => {
    const failures = { delete: true };
    const fixture = createAdapter(failures);
    await expect(
      runRemediation({
        adapter: fixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      })
    ).rejects.toMatchObject({ stage: "delete" });

    failures.delete = false;
    const sourceInfo = fixture.objects.get(fixture.referencedPaths[0]);
    fixture.objects.set(fixture.referencedPaths[0], {
      ...sourceInfo!,
      id: fixtureUuid(999),
    });
    await expect(
      runRemediation({
        adapter: fixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      })
    ).rejects.toMatchObject({ code: "RESUME_OBJECT_MISMATCH" });
    expect(fixture.referencedPaths.every((path) => fixture.objects.has(path)))
      .toBe(true);
    expect(fixture.objects.has(fixture.unrelatedPath)).toBe(true);
  });

  it("fails final proof if a legacy reference appears during deletion", async () => {
    const fixture = createAdapter({ postDeleteReferenceDrift: true });

    await expect(
      runRemediation({
        adapter: fixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      })
    ).rejects.toMatchObject({
      code: "FINAL_PROOF_MISMATCH",
      stage: "final-proof",
      report: { remainingLegacyReferences: 1 },
    });
    expect(fixture.objects.has(fixture.unrelatedPath)).toBe(true);
  });

  it("keeps identity-bearing legacy URLs out of atomic SQL text", () => {
    const fixture = createAdapter();
    const changes = [...fixture.rows].map(([id, oldUrl], index) => ({
      id,
      oldUrl,
      newUrl: `${publicPrefix}${fixture.destinationPaths[index]}`,
    }));
    const query = buildReferenceUpdateQuery(changes, publicPrefix);

    expect(query).toContain("t.banner_image_url ~");
    expect(query).toContain("[.]png");
    expect(query).not.toContain("user_private");
    expect(query).not.toContain(changes[0].oldUrl);
    expect(
      buildReferenceUpdateQuery(
        changes.map(({ id, oldUrl, newUrl }) => ({
          id,
          oldUrl: newUrl,
          newUrl: oldUrl,
        })),
        publicPrefix
      )
    ).toBeNull();
  });

  it("accepts the canonical live project URL guard without contacting it", () => {
    expect(() =>
      createLiveAdapter({
        NEXT_PUBLIC_SUPABASE_URL: projectUrl,
        NODE_ENV: "test",
        SUPABASE_ACCESS_TOKEN: "test-management-token",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      })
    ).not.toThrow();
    expect(() =>
      createLiveAdapter({
        NEXT_PUBLIC_SUPABASE_URL: `${projectUrl}/foreign-prefix`,
        NODE_ENV: "test",
        SUPABASE_ACCESS_TOKEN: "test-management-token",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      })
    ).toThrow("PROJECT_URL_MISMATCH");
  });

  it("requires the exact apply confirmation and keeps provider values out of output", async () => {
    const confirmationFixture = createAdapter();
    await expect(
      runRemediation({
        adapter: confirmationFixture.adapter,
        mode: "apply",
        confirmedProjectRef: "wrong-project",
      })
    ).rejects.toMatchObject({ code: "APPLY_CONFIRMATION_MISMATCH" });

    const providerFixture = createAdapter({ copy: 1 });
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let visibleFailure = "";
    try {
      await runRemediation({
        adapter: providerFixture.adapter,
        mode: "apply",
        confirmedProjectRef: EXPECTED_PROJECT_REF,
      });
    } catch (error) {
      visibleFailure = JSON.stringify(error);
    }

    expect(visibleFailure).not.toContain("user_private");
    expect(visibleFailure).not.toContain("Bearer");
    expect(visibleFailure).not.toContain("credential");
    expect(visibleFailure).not.toContain("provider-detail");
    expect(logSpy).not.toHaveBeenCalled();
  });
});
