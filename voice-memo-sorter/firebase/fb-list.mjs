import fs from 'node:fs'; import crypto from 'node:crypto';
const sa = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const BUCKET='membry-df528.firebasestorage.app';
const b64=(b)=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const now=Math.floor(Date.now()/1000);
const head=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
const claim=b64(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/devstorage.read_only',aud:sa.token_uri,iat:now,exp:now+3600}));
const jwt=head+'.'+claim+'.'+b64(crypto.sign('RSA-SHA256',Buffer.from(head+'.'+claim),sa.private_key));
const tr=await fetch(sa.token_uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
if(!tr.ok){console.log('AUTH FAIL',tr.status,await tr.text());process.exit(0);}
const tok=(await tr.json()).access_token;
let pageToken='', total=0, m4a=0, hasManifest=false, sample=[];
do{
  const url=`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=memo-audio/&maxResults=1000`+(pageToken?`&pageToken=${pageToken}`:'');
  const r=await fetch(url,{headers:{Authorization:'Bearer '+tok}});
  if(!r.ok){console.log('LIST FAIL',r.status,await r.text());process.exit(0);}
  const j=await r.json();
  for(const o of (j.items||[])){ total++; if(o.name.endsWith('.m4a'))m4a++; if(o.name.endsWith('manifest.json'))hasManifest=true; if(sample.length<3)sample.push(o.name); }
  pageToken=j.nextPageToken||'';
}while(pageToken);
console.log('objects under memo-audio/:',total,'| .m4a:',m4a,'| manifest:',hasManifest);
console.log('sample:',sample);
