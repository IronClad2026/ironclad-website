import {connect} from './local-client.mjs';
import {capture,schemaObjectsSql} from './fingerprint.mjs';
const client=await connect();
try{
 if(process.argv.includes('--schema-objects')) {
  await client.query('begin transaction isolation level repeatable read read only');
  try{console.log(JSON.stringify((await client.query(schemaObjectsSql)).rows[0].value));}
  finally{await client.query('rollback');}
 }else console.log(JSON.stringify(await capture(client)));
}finally{await client.end();}
