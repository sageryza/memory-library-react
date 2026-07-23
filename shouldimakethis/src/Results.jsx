import React, { useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { listenAggregates, listenAllSubmissions, setSubmissionStatus } from "./db";
import { BG, FONTS_IMPORT, GREEN, INK, LINE, MUTE, SERIF, SMBTN, TILE_BG, TITLE, seed } from "./catalog";

// The private payoff view — every product with its collected signal.
// Gated to Sophie's Google account (verified email in Firestore rules too);
// not linked from the public nav.
const ADMIN_EMAIL = "sageryza@gmail.com";
const DOWN = "#b04a3a";

const COLS = [
  { key: "up", label: "👍" },
  { key: "down", label: "👎" },
  { key: "net", label: "Net" },
  { key: "hearts", label: "Hearts" },
  { key: "preorders", label: "Preorders" },
  { key: "invested", label: "Invested" },
  { key: "investors", label: "Investors" },
];

export default function Results() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [aggs, setAggs] = useState({});
  const [subs, setSubs] = useState([]);
  const [sortKey, setSortKey] = useState("preorders");
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); }), []);
  const isAdmin = !!user && user.email === ADMIN_EMAIL;
  useEffect(() => {
    if (!isAdmin) return;
    const u1 = listenAggregates(setAggs);
    const u2 = listenAllSubmissions(setSubs);
    return () => { u1(); u2(); };
  }, [isAdmin]);

  const rows = useMemo(() => {
    const row = (id, title, thumb, source, status) => {
      const a = aggs[String(id)] || {};
      const up = a.voteUp || 0, down = a.voteDown || 0;
      return {
        id: String(id), title, thumb, source, status,
        up, down, net: up - down,
        hearts: a.hearts || 0,
        preorders: a.reserved || 0,
        invested: a.raised || 0,
        investors: a.investors || 0,
      };
    };
    return [
      ...seed.map((s) => row(s.id, s.title, s.imgs[0], "mine", null)),
      ...subs.map((s) => row(s.id, s.title, s.img, "submitted", s.status)),
    ].sort((x, y) => {
      const d = (x[sortKey] - y[sortKey]) * sortDir;
      if (d) return d;
      return (y.net - x.net) || (y.preorders - x.preorders);
    });
  }, [aggs, subs, sortKey, sortDir]);

  const sortBy = (key) => {
    if (key === sortKey) setSortDir((d) => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const exportCsv = () => {
    const header = ["id", "title", "source", "status", "thumbs_up", "thumbs_down", "net_vote", "hearts", "preorders", "invested_usd", "investors"];
    const lines = rows.map((r) => [r.id, r.title, r.source, r.status || "", r.up, r.down, r.net, r.hearts, r.preorders, r.invested, r.investors]);
    const csv = [header, ...lines]
      .map((l) => l.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `shouldimakethis-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const th = { fontFamily: TITLE, fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", color: MUTE, padding: "10px 10px", textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", fontSize: 14, textAlign: "right", borderTop: `1px solid ${LINE}`, whiteSpace: "nowrap" };

  return (
    <div style={{ background: BG, color: INK, minHeight: "100vh", fontFamily: SERIF }}>
      <style>{FONTS_IMPORT}</style>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="flex items-center justify-between mb-2">
          <h1 className="text-xl tracking-tight" style={{ fontWeight: 500 }}>ShouldiMakeThis<span style={{ color: MUTE }}>.com</span></h1>
          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => signOut(auth)} style={{ background: "none", border: "none", color: MUTE, fontFamily: SERIF, fontSize: 13, fontStyle: "italic", cursor: "pointer", padding: 0 }}>
                sign out
              </button>
              <button onClick={exportCsv} className="px-4 py-2" style={SMBTN}>Export CSV</button>
            </div>
          )}
        </header>
        <p className="text-sm mb-6" style={{ color: MUTE, fontStyle: "italic" }}>Results.</p>

        {!ready ? null : !user ? (
          <button onClick={() => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => console.warn(e))} className="px-4 py-2" style={SMBTN}>
            Sign in with Google
          </button>
        ) : !isAdmin ? (
          <p style={{ fontSize: 14, color: MUTE, fontStyle: "italic" }}>
            This page isn't public.{" "}
            <button onClick={() => signOut(auth)} style={{ background: "none", border: "none", color: MUTE, fontFamily: SERIF, fontSize: 14, fontStyle: "italic", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
              Sign out
            </button>
          </p>
        ) : (
          <div style={{ overflowX: "auto", border: `1px solid ${LINE}`, borderRadius: 6, background: "#fff" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>Item</th>
                  {COLS.map((c) => (
                    <th key={c.key} style={{ ...th, padding: 0 }}>
                      <button onClick={() => sortBy(c.key)}
                        style={{ ...th, background: "none", border: "none", cursor: "pointer", padding: "10px 10px", width: "100%",
                          color: sortKey === c.key ? INK : MUTE }}>
                        {c.label}{sortKey === c.key ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                      </button>
                    </th>
                  ))}
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, textAlign: "left" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 4, overflow: "hidden", background: TILE_BG, display: "inline-block" }}>
                          {r.thumb && <img src={r.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                        </span>
                        <span style={{ fontFamily: TITLE, fontSize: 14, textTransform: "lowercase", fontVariant: "small-caps", letterSpacing: ".03em" }}>{r.title}</span>
                      </span>
                    </td>
                    <td style={td}>{r.up}</td>
                    <td style={td}>{r.down}</td>
                    <td style={{ ...td, color: r.net > 0 ? GREEN : r.net < 0 ? DOWN : INK }}>{r.net}</td>
                    <td style={td}>{r.hearts}</td>
                    <td style={td}>{r.preorders}</td>
                    <td style={td}>${r.invested}</td>
                    <td style={td}>{r.investors}</td>
                    <td style={{ ...td, textAlign: "left" }}>
                      {r.source === "mine" ? (
                        <span style={{ color: MUTE, fontSize: 12, fontStyle: "italic" }}>catalog</span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, fontStyle: "italic", color: r.status === "approved" ? GREEN : r.status === "rejected" ? DOWN : MUTE }}>
                            {r.status}
                          </span>
                          {r.status !== "approved" && (
                            <button onClick={() => setSubmissionStatus(r.id, "approved")} className="px-2 py-1" style={{ ...SMBTN, fontSize: 12 }}>Approve</button>
                          )}
                          {r.status !== "rejected" && (
                            <button onClick={() => setSubmissionStatus(r.id, "rejected")} className="px-2 py-1" style={{ ...SMBTN, fontSize: 12 }}>Reject</button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
