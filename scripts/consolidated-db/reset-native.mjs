// LOCAL ONLY. Reset the one explicitly authorized disposable schema rehearsal.
import assert from 'node:assert/strict';
import {connect} from './local-client.mjs';
assert.equal(process.env.CONSOLIDATED_PROVIDER_MODE??'native-compatibility','native-compatibility','Never reset a real provider rehearsal through this helper');
const c=await connect();
try{
 if((await c.query("select to_regclass('public.players') is not null ok")).rows[0].ok)
  assert.equal((await c.query("select count(*)::integer n from public.players where clerk_user_id not like 'local-consolidated-%'")).rows[0].n,0,'Non-synthetic identity found; reset refused');
 await c.query('drop schema if exists public,ironclad_private,auth,storage,extensions,vault,net,cron,realtime,supabase_migrations cascade; create schema public; grant all on schema public to postgres; grant usage on schema public to public;');
 console.log('PASS reset authorized disposable localhost schema only');
}finally{await c.end();}
