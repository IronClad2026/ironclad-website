import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const dbOrigin = "http://127.0.0.1:56977";
const siteOrigin = "http://127.0.0.1:4312";
const system = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(?:PATH|SystemRoot|windir|PATHEXT|USERPROFILE|LOCALAPPDATA|APPDATA|TEMP|TMP|COMSPEC|SystemDrive|HOMEPATH|HOMEDRIVE|OS|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|PROGRAMDATA|ALLUSERSPROFILE|PUBLIC|PROGRAMFILES(?:\(X86\))?|COMMONPROGRAMFILES(?:\(X86\))?|LANG|LC_ALL|PGCLIENTENCODING)$/i.test(key)));

function signed(role, key) {
  const base = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")+"."+
    Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000)+1800 })).toString("base64url");
  return `${base}.${createHmac("sha256",key).update(base).digest("base64url")}`;
}

async function reachable(label, url, child, headers) {
  let lastStatus;
  for (let attempt=0; attempt<70; attempt+=1) {
    if (child.exitCode!==null) throw new Error(`Disposable ${label} exited ${child.exitCode}`);
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(2500),redirect:"manual"}).catch(()=>null);
    if (response && response.status<500) return response;
    lastStatus=response?.status ?? lastStatus;
    await response?.body?.cancel();
    await delay(500);
  }
  throw new Error(`Disposable ${label} did not become ready${lastStatus ? ` (last HTTP ${lastStatus})` : ""}`);
}

export async function checkRecoveryBuild({root,database,port,binary}) {
  assert.match(database,/^p03_combined_upgrade_\d+$/);
  assert.equal(port,56624);
  assert(isAbsolute(binary)&&/[/\\]postgrest(?:\.exe)?$/i.test(binary));
  const key=randomBytes(36).toString("hex");
  const service=signed("service_role",key);
  const anon=signed("anon",key);
  let rest,site;
  try {
    rest=spawn(binary,[],{cwd:root,env:{...system,
      PGRST_SERVER_HOST:"127.0.0.1",PGRST_SERVER_PORT:"56977",
      PGRST_DB_URI:`postgresql://postgres@127.0.0.1:${port}/${database}`,PGRST_DB_SCHEMAS:"public",
      PGRST_DB_ANON_ROLE:"anon",PGRST_DB_PRE_REQUEST:"public.require_public_gaming_profile_notice_for_api",PGRST_JWT_SECRET:key,
    },stdio:"ignore",windowsHide:true});
    rest.on("error",()=>{});
    const sample=await reachable("PostgREST",dbOrigin+"/tournaments?select=title&slug=eq.caster-coverage-test",rest,{Authorization:`Bearer ${service}`});
    assert.equal(sample.status,200);
    assert.deepEqual(await sample.json(),[{title:"Caster Coverage Test"}]);

    // Local providers and flags only. The production opt-in probe never runs.
    site=spawn(process.execPath,[fileURLToPath(new URL("node_modules/next/dist/bin/next",root)),
      "dev","--webpack","--hostname","127.0.0.1","--port","4312"],{cwd:root,env:{...system,
      NEXT_TELEMETRY_DISABLED:"1",NEXT_PUBLIC_SUPABASE_URL:dbOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:anon,
      SUPABASE_SERVICE_ROLE_KEY:service,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:"pk_test_Y2xlcmsudGVzdCQ=",
      CLERK_SECRET_KEY:"sk_test_not-a-real-secret",TRANSACTIONAL_EMAIL_MODE:"disabled",
      CASTER_PROGRAM_ENABLED:"false",READY_PROGRAM_ENABLED:"false",PATCH2_PUBLIC_PROFILE_NOTICE_ENABLED:"true",
    },stdio:"ignore",windowsHide:true});
    site.on("error",()=>{});
    const tournament=await reachable("Next.js",siteOrigin+"/tournaments",site);
    assert.equal(tournament.status,200);
    const publicHtml=await tournament.text();
    assert.match(publicHtml,/IronClad/i);
    assert.match(publicHtml,/Caster Coverage Test/);
    const invitation=await fetch(siteOrigin+"/casters/invitation",{redirect:"manual",signal:AbortSignal.timeout(25000)});
    assert.equal(invitation.status,404);
    const ready=await fetch(siteOrigin+"/api/ready",{method:"POST",headers:{"content-type":"application/json",Origin:siteOrigin},body:"{}",signal:AbortSignal.timeout(25000)});
    assert.equal(ready.status,404);
    return {tournament:tournament.status,casterInvite:invitation.status,ready:ready.status,fixtureReadThroughPostgrest:true,
      environment:"loopback Next.js with disposable PostgREST and PostgreSQL"};
  } finally {
    site?.kill();
    rest?.kill();
  }
}
