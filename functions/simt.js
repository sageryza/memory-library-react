// ShouldiMakeThis.com — aggregate maintenance.
//
// Clients write only their own per-user docs under
// simtProducts/{pid}/simt{Votes,Hearts,Preorders,Investments}/{uid}; the
// aggregate doc simtProducts/{pid} is locked to clients (see firestore.rules)
// and maintained here with atomic increments, so counts can't be forged from
// the browser. pid is a catalog id or a simtSubmissions doc id.

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const data = (snap) => (snap && snap.exists ? snap.data() : null);

function bump(pid, inc) {
  const keys = Object.keys(inc);
  if (!keys.length) return null;
  const upd = {};
  for (const k of keys) upd[k] = FieldValue.increment(inc[k]);
  return getFirestore().doc(`simtProducts/${pid}`).set(upd, { merge: true });
}

exports.simtVoteAgg = onDocumentWritten('simtProducts/{pid}/simtVotes/{uid}', (event) => {
  const b = data(event.data.before);
  const a = data(event.data.after);
  const delta = (dir) => ((a && a.dir === dir) ? 1 : 0) - ((b && b.dir === dir) ? 1 : 0);
  const inc = {};
  const up = delta('up');
  const down = delta('down');
  if (up) inc.voteUp = up;
  if (down) inc.voteDown = down;
  return bump(event.params.pid, inc);
});

exports.simtHeartAgg = onDocumentWritten('simtProducts/{pid}/simtHearts/{uid}', (event) => {
  const d = (data(event.data.after) ? 1 : 0) - (data(event.data.before) ? 1 : 0);
  return bump(event.params.pid, d ? { hearts: d } : {});
});

exports.simtPreorderAgg = onDocumentWritten('simtProducts/{pid}/simtPreorders/{uid}', (event) => {
  const d = (data(event.data.after) ? 1 : 0) - (data(event.data.before) ? 1 : 0);
  return bump(event.params.pid, d ? { reserved: d } : {});
});

exports.simtInvestAgg = onDocumentWritten('simtProducts/{pid}/simtInvestments/{uid}', (event) => {
  const b = data(event.data.before);
  const a = data(event.data.after);
  const inc = {};
  const amt = ((a && a.amount) || 0) - ((b && b.amount) || 0);
  const n = (a ? 1 : 0) - (b ? 1 : 0);
  if (amt) inc.raised = amt;
  if (n) inc.investors = n;
  return bump(event.params.pid, inc);
});
