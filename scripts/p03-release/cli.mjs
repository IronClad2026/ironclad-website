import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import path from "node:path";
import { backup, checkRestoreRuntime, restore, restorePreflight, verifyBackup } from "./backup.mjs";
import { capture, compare, connection, invariant, readJson, saveJson } from "./core.mjs";
import { gate, seal } from "./gate.mjs";

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    out: { type: "string" }, config: { type: "string" }, seal: { type: "string" }, "backup-dir": { type: "string" },
    tournaments: { type: "string" }, "candidate-sha": { type: "string" }, "project-ref": { type: "string" },
    before: { type: "string" }, after: { type: "string" }, help: { type: "boolean" },
  } });
  const command = positionals[0];
  const repository = fileURLToPath(new URL("../../", import.meta.url));
  if (values.help || !command) {
    console.log("P03 release tools (no database mutations except explicit loopback-only restore)\nCommands: fingerprint --tournaments UUID[,UUID] --candidate-sha SHA --project-ref REF --out FILE; compare --before FILE --after FILE; backup --tournaments UUID --candidate-sha SHA --project-ref REF --out PRIVATE_NEW_DIRECTORY; verify-backup --backup-dir DIRECTORY; restore --backup-dir DIRECTORY; seal --config FILE --out FILE; gate --seal FILE --backup-dir DIRECTORY --out FILE\nConnection: P03_DATABASE_URL; restore only: P03_RESTORE_DATABASE_URL; binaries: P03_PG_BIN; TLS: P03_SSL_ROOT_CERT. Gate also uses gh authentication and VERCEL_TOKEN. Never put credentials in arguments.");
    return;
  }
  try {
    if (command === "fingerprint") {
      invariant(values.out && values["project-ref"], "--out and --project-ref required.");
      const db = connection();
      invariant(db.projectRef === values["project-ref"], "Fingerprint project mismatch.");
      const result = capture(db, values.tournaments?.split(","), { candidateSha: values["candidate-sha"] });
      saveJson(values.out, result);
      console.log(`FINGERPRINT: PASS ${result.competitionSha256}`);
    } else if (command === "compare") {
      const result = compare(readJson(values.before), readJson(values.after));
      if (values.out) saveJson(values.out, result);
      console.log(`PRE-MIGRATION fingerprint: ${result.before}\nPOST-MIGRATION fingerprint: ${result.after}\nFINGERPRINT: ${result.pass ? "PASS" : "FAIL"}`);
      for (const reason of result.differences.slice(0, 100)) console.log(reason);
      if (!result.pass) process.exitCode = 1;
    } else if (command === "backup") {
      invariant(values.out && values["candidate-sha"] && values["project-ref"], "--out, --candidate-sha and --project-ref required.");
      backup({ repository, directory: values.out, tournamentIds: values.tournaments?.split(","), candidateSha: values["candidate-sha"], expectedProjectRef: values["project-ref"] });
      console.log("BACKUP: PASS (restore validation still required)");
    } else if (command === "restore-runtime") { checkRestoreRuntime(readJson(values.config).extensions); console.log("RESTORE RUNTIME: PASS");
    } else if (command === "restore-preflight") { restorePreflight(values["backup-dir"]); console.log("RESTORE RUNTIME: PASS");
    } else if (command === "restore") { restore({ directory: values["backup-dir"] }); console.log("RESTORE VALIDATION: PASS");
    } else if (command === "verify-backup") { verifyBackup(values["backup-dir"]); console.log("BACKUP CHECKSUMS: PASS");
    } else if (command === "seal") { seal({ repository, config: readJson(values.config), output: values.out }); console.log("RELEASE SEAL: CREATED");
    } else if (command === "gate") {
      const result = await gate({ repository, sealFile: values.seal, backupDirectory: values["backup-dir"], output: values.out });
      console.log(`RELEASE GATE: ${result.verdict}`);
      for (const reason of result.reasons) console.log(`- ${reason}`);
      if (result.verdict !== "PASS") process.exitCode = 1;
    } else throw new Error("Unknown command; run --help.");
  } catch (error) {
    console.log(command === "gate" ? "RELEASE GATE: STOP" : `${command.toUpperCase()}: STOP`);
    console.log(error.message);
    process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
