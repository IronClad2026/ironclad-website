import {connect} from './local-client.mjs';
import {capture} from './fingerprint.mjs';
const client=await connect();
try{console.log(JSON.stringify(await capture(client)));}finally{await client.end();}
