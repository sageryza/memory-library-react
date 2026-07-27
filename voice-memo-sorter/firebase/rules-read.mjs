import fs from 'node:fs'; import crypto from 'node:crypto';
const sa = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const b64=(b)=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function token(scope){
  const now=Math.floor(Date.now()/1000);
  const head=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=b64(JSON.stringify({iss:sa.client_email,scope,aud:sa.token_uri,iat:now,exp:now+3600}));
  const jwt=head+'.'+claim+'.'+b64(crypto.sign('RSA-SHA256',Buffer.from(head+'.'+claim),sa.private_key));
  const r=await fetch(sa.token_uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  if(!r.ok){throw new Error('token '+r.status+' '+await r.text());}
  return (await r.json()).access_token;
}
const tok=await token('https://www.googleapis.com/auth/firebase.readonly');
const proj='membry-df528';
const rel=await fetch(`https://firebaserules.googleapis.com/v1/projects/${proj}/releases`,{headers:{Authorization:'Bearer '+tok}});
const rj=await rel.json();
if(!rel.ok){console.log('releases FAIL',rel.status,JSON.stringify(rj));process.exit(0);}
const storageRels=(rj.releases||[]).filter(r=>r.name.includes('firebase.storage'));
console.log('storage releases:');
for(const r of storageRels){ console.log(' ', r.name, '->', r.rulesetName); }
if(storageRels[0]){
  const rs=await fetch(`https://firebaserules.googleapis.com/v1/${storageRels[0].rulesetName}`,{headers:{Authorization:'Bearer '+tok}});
  const rsj=await rs.json();
  if(rs.ok){ console.log('\n--- LIVE storage.rules ---\n'+(rsj.source?.files?.[0]?.content||'(none)')); }
  else console.log('ruleset FAIL',rs.status,JSON.stringify(rsj));
}
