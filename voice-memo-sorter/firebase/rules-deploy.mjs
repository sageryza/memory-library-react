import fs from 'node:fs'; import crypto from 'node:crypto';
const sa = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rulesContent = fs.readFileSync(process.argv[3],'utf8');
const proj='membry-df528';
const release=`projects/${proj}/releases/firebase.storage/membry-df528.firebasestorage.app`;
const b64=(b)=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function token(scope){
  const now=Math.floor(Date.now()/1000);
  const head=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=b64(JSON.stringify({iss:sa.client_email,scope,aud:sa.token_uri,iat:now,exp:now+3600}));
  const jwt=head+'.'+claim+'.'+b64(crypto.sign('RSA-SHA256',Buffer.from(head+'.'+claim),sa.private_key));
  const r=await fetch(sa.token_uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  if(!r.ok) throw new Error('token '+r.status+' '+await r.text());
  return (await r.json()).access_token;
}
const tok=await token('https://www.googleapis.com/auth/firebase');
const cr=await fetch(`https://firebaserules.googleapis.com/v1/projects/${proj}/rulesets`,{
  method:'POST', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},
  body:JSON.stringify({ source:{ files:[{ name:'storage.rules', content: rulesContent }] } }) });
const crj=await cr.json();
if(!cr.ok){ console.log('CREATE RULESET FAIL',cr.status,JSON.stringify(crj)); process.exit(1); }
console.log('created ruleset:', crj.name);
const up=await fetch(`https://firebaserules.googleapis.com/v1/${release}`,{
  method:'PATCH', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},
  body:JSON.stringify({ release: { name: release, rulesetName: crj.name }, updateMask: 'rulesetName' }) });
const upj=await up.json();
if(!up.ok){ console.log('RELEASE UPDATE FAIL',up.status,JSON.stringify(upj)); process.exit(1); }
console.log('RELEASED', upj.name, '->', upj.rulesetName);
