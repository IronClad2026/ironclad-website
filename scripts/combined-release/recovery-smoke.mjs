import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { createServer, request } from "node:http";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const dbOrigin = "http://127.0.0.1:56977";
const siteOrigin = "http://localhost:4312";
const restPort = 56978;
const publicBuildKey = "test-only-publishable-key";
const system = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(?:PATH|SystemRoot|windir|PATHEXT|USERPROFILE|LOCALAPPDATA|APPDATA|TEMP|TMP|COMSPEC|SystemDrive|HOMEPATH|HOMEDRIVE|OS|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|PROGRAMDATA|ALLUSERSPROFILE|PUBLIC|PROGRAMFILES(?:\(X86\))?|COMMONPROGRAMFILES(?:\(X86\))?|LANG|LC_ALL|PGCLIENTENCODING)$/i.test(key)));

function signed(role, key) {
  const base = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")+"."+
    Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now()/1000)+1800 })).toString("base64url");
  return `${base}.${createHmac("sha256",key).update(base).digest("base64url")}`;
}

async function reachable(label, url, child, headers) {
  let lastStatus;
  const deadline = Date.now() + 65000;
  while (Date.now() < deadline) {
    if (child.exitCode!==null) throw new Error(`Disposable ${label} exited ${child.exitCode}`);
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(10000),redirect:"manual"}).catch(()=>null);
    if (response && response.status<500) return response;
    lastStatus=response?.status ?? lastStatus;
    await response?.body?.cancel();
    await delay(500);
  }
  throw new Error(`Disposable ${label} did not become ready${lastStatus ? ` (last HTTP ${lastStatus})` : ""}`);
}

async function startLocalGateway(anonymousToken) {
  const prefix = "/rest/v1";
  const gateway = createServer((incoming, outgoing) => {
    const url = new URL(incoming.url, dbOrigin);
    if (url.origin !== dbOrigin || !url.pathname.startsWith(`${prefix}/`)) {
      outgoing.writeHead(404).end();
      return;
    }
    const headers = { ...incoming.headers };
    // Resolve the compiled publishable fixture key to the anonymous database role.
    // Other requests retain their original authorization and undergo normal PostgREST checks.
    if (headers.apikey === publicBuildKey && headers.authorization === `Bearer ${publicBuildKey}`) {
      headers.authorization = `Bearer ${anonymousToken}`;
    }
    const upstream = request({ host: "127.0.0.1", port: restPort, method: incoming.method,
      path: url.pathname.slice(prefix.length) + url.search, headers }, (response) => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  gateway.listen(56977, "127.0.0.1");
  await once(gateway, "listening");
  return gateway;
}

export async function checkRecoveryBuild({root,database,port,binary}) {
  assert.match(database,/^p03_combined_upgrade_\d+$/);
  assert.equal(port,56624);
  assert(isAbsolute(binary)&&/[/\\]postgrest(?:\.exe)?$/i.test(binary));
  assert(existsSync(new URL(".next/BUILD_ID", root)), "Build the candidate locally with the disposable recovery settings first");
  const localhost = await lookup("localhost", { all: true });
  assert(localhost.length && localhost.every(({ address }) => address === "127.0.0.1" || address === "::1"),
    "Recovery localhost must resolve exclusively to loopback");
  const key=randomBytes(36).toString("hex");
  const service=signed("service_role",key);
  const anon=signed("anon",key);
  let rest,site,gateway;
  try {
    rest=spawn(binary,["+RTS","-N2","-RTS"],{cwd:root,env:{...system,
      PGRST_SERVER_HOST:"127.0.0.1",PGRST_SERVER_PORT:String(restPort),
      PGRST_DB_URI:`postgresql://postgres@127.0.0.1:${port}/${database}`,PGRST_DB_SCHEMAS:"public",
      PGRST_DB_ANON_ROLE:"anon",PGRST_DB_PRE_REQUEST:"public.require_public_gaming_profile_notice_for_api",PGRST_JWT_SECRET:key,
    },stdio:"ignore",windowsHide:true});
    rest.on("error",()=>{});
    // Supabase clients use /rest/v1. Bare PostgREST mounts the same requests at /.
    gateway = await startLocalGateway(anon);
    const sample=await reachable("PostgREST",dbOrigin+"/rest/v1/tournaments?select=title&slug=eq.caster-coverage-test",rest,{Authorization:`Bearer ${service}`});
    assert.equal(sample.status,200);
    assert.deepEqual(await sample.json(),[{title:"Caster Coverage Test"}]);

    // Local providers and flags only. The production opt-in probe never runs.
    site=spawn(process.execPath,[fileURLToPath(new URL("node_modules/next/dist/bin/next",root)),
      // Next uses localhost as its canonical loopback hostname for proxied routes.
      "start","--hostname","localhost","--port","4312"],{cwd:root,env:{...system,
      NEXT_TELEMETRY_DISABLED:"1",NEXT_PUBLIC_SUPABASE_URL:dbOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:anon,
      SUPABASE_SERVICE_ROLE_KEY:service,CLERK_API_URL:dbOrigin,NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED:"1",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:"pk_live_"+Buffer.from("clerk.recovery-fixture.invalid$").toString("base64"),
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
    gateway?.close();
    gateway?.closeAllConnections();
    rest?.kill();
  }
}
