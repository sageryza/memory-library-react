import crypto from 'node:crypto';

const KEY_ID = 'H469876M4M';
const ISSUER = 'c414ac1e-ee16-4094-b825-12c56aea3ae0';
const P8_B64 = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR1RBZ0VBTUJNR0J5cUdTTTQ5QWdFR0NDcUdTTTQ5QXdFSEJIa3dkd0lCQVFRZ3h6QXJXZldjaTgyZ3U3bXYKait5NHQyUWVSZzk0YjNkZm9VVFhXejY1ZytxZ0NnWUlLb1pJemowREFRZWhSQU5DQUFRY1lnKzg1OWNqUGl5RQowUWJ1NFlDTkVsb0JNdVI2bUlmOUtxYXZSMU9naHN2QTJzc2NXSkZIYUVqZVI3d2lNdmZ3RnE4Y2RVZEVZcE41CmVQaVNvbnN3Ci0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0=';
const PEM = Buffer.from(P8_B64, 'base64').toString('utf8');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const now = Math.floor(Date.now()/1000);
const header = { alg:'ES256', kid:KEY_ID, typ:'JWT' };
const payload = { iss:ISSUER, iat:now, exp:now+1200, aud:'appstoreconnect-v1' };
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: PEM, dsaEncoding:'ieee-p1363' });
const jwt = `${signingInput}.${b64url(sig)}`;

async function api(path) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const t = await r.text();
  if (!r.ok) { console.log('ERR', r.status, path, t.slice(0,400)); return null; }
  return JSON.parse(t);
}

const apps = await api('/v1/apps?filter[bundleId]=com.sageryza.miracles');
if (!apps) process.exit(1);
const app = apps.data?.[0];
console.log('APP:', app?.id, app?.attributes?.name, '| sku', app?.attributes?.sku);
if (!app) process.exit(1);

const builds = await api(`/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=10&fields[builds]=version,uploadedDate,processingState,expired,usesNonExemptEncryption`);
console.log('\nBUILDS (newest first):');
for (const b of builds?.data || []) {
  const a = b.attributes;
  console.log(`  build ${a.version} | proc=${a.processingState} | expired=${a.expired} | nonExemptEnc=${a.usesNonExemptEncryption} | uploaded=${a.uploadedDate} | id=${b.id}`);
}
