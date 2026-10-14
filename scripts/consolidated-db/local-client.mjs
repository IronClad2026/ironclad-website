import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "./package.mjs";

export const port = 56623;
export const database = "consolidated_rehearsal";
export async function connect() {
  const modulePath = process.env.CONSOLIDATED_PG_CLIENT_MODULE ?? path.join(root,".release-tooling/pg-client/node_modules/pg/lib/index.js");
  assert(path.isAbsolute(modulePath),"The disposable pg client must have an absolute path");
  const imported = await import(pathToFileURL(modulePath).href);
  const Client = imported.Client ?? imported.default?.Client;
  assert.equal(typeof Client,"function","Disposable pg client unavailable");
  // Every address/identity/database/security option is explicit. No inherited
  // PGHOST, PGSERVICE, PGPASSWORD, DATABASE_URL or app credentials are consumed.
  const client = new Client({host:"127.0.0.1",port,database,user:"postgres",password:"",ssl:false,
    application_name:"ironclad-consolidated-local",connectionTimeoutMillis:5000,
    options:"-c lock_timeout=5000 -c statement_timeout=180000 -c idle_in_transaction_session_timeout=180000"});
  await client.connect();
  const result=await client.query("select inet_server_addr()='127.0.0.1'::inet and inet_server_port()=56623 and current_database()='consolidated_rehearsal' as local_only;");
  assert.equal(result.rows[0].local_only,true,"Disposable endpoint verification failed");
  return client;
}
export function plainSql(value) {
  assert(!/^\\(?:connect|c|copy|include|i|ir|!)\b/im.test(value),"Database/file/shell redirection prohibited");
  return value.replace(/^\\(?:set|echo)\b.*$/gm,"");
}
export async function run(client, sql) { return client.query(plainSql(sql)); }
export async function scalar(client, sql) {
  const result=await client.query(sql);
  const last=Array.isArray(result)?result.at(-1):result;
  return Object.values(last.rows[0]??{})[0];
}
