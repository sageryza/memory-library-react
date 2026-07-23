import React, { useEffect, useMemo, useRef, useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "./firebase";
import {
  createSubmission, invest, listenAggregates, listenApprovedSubmissions,
  listenMine, preorder, setVote, toggleHeart,
} from "./db";
import {
  BG, CATS, FONTS_IMPORT, GREEN, INK, LINE, MUTE, SERIF, SMBTN, TILE_BG, TITLE,
  pctOf, seed, targetOf,
} from "./catalog";

export default function App() {
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [cat, setCat] = useState("All");

  const [user, setUser] = useState(null);
  const [signinOpen, setSigninOpen] = useState(false);
  const pendingRef = useRef(null);

  const [aggs, setAggs] = useState({});
  const [mine, setMine] = useState({ votes: {}, hearts: {}, preorders: {}, investments: {} });
  const [subs, setSubs] = useState([]);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => listenAggregates(setAggs), []);
  useEffect(() => listenApprovedSubmissions(setSubs), []);
  useEffect(() => {
    if (!user) { setMine({ votes: {}, hearts: {}, preorders: {}, investments: {} }); return; }
    return listenMine(user.uid, (type, m) => setMine((p) => ({ ...p, [type]: m })));
  }, [user?.uid]);

  // Catalog + approved submissions, overlaid with stored aggregates and the
  // signed-in user's own state. Counts come from Firestore, never local state.
  const items = useMemo(() => {
    const subItems = subs.map((s) => ({
      id: s.id, cat: s.cat, imgs: s.img ? [s.img] : [], title: s.title,
      retail: s.retail, cost: s.cost, goal: s.goal, desc: s.desc,
    }));
    return [...seed, ...subItems].map((raw) => {
      const pid = String(raw.id);
      const a = aggs[pid] || {};
      return {
        ...raw,
        reserved: a.reserved || 0,
        raised: a.raised || 0,
        liked: !!mine.hearts[pid],
        vote: mine.votes[pid]?.dir || null,
        preordered: !!mine.preorders[pid],
      };
    });
  }, [subs, aggs, mine]);

  // Any interaction from an anonymous visitor opens the sign-in modal and
  // completes after they sign in.
  const requireAuth = (fn) => {
    if (user) fn(user);
    else { pendingRef.current = fn; setSigninOpen(true); }
  };
  const doSignIn = async () => {
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      setSigninOpen(false);
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) p(cred.user);
    } catch (e) {
      console.warn("sign-in failed", e);
    }
  };

  const heart = (id) => requireAuth((u) => toggleHeart(u.uid, String(id), !!mine.hearts[String(id)]));
  const castVote = (id, dir) => requireAuth((u) => setVote(u.uid, String(id), dir, mine.votes[String(id)]?.dir || null));
  const reserve = (id, variant) => requireAuth((u) => preorder(u.uid, String(id), variant));
  const investIn = (id, amt, pay) => requireAuth((u) => invest(u.uid, String(id), amt, pay));
  const submitItem = (f) => requireAuth(async (u) => {
    setPosting(true);
    try {
      await createSubmission(u.uid, f);
      setShowForm(false);
      setPosted(true);
    } catch (e) {
      console.warn("submit failed", e);
    }
    setPosting(false);
  });

  const open = items.find((it) => it.id === openId);
  const cats = CATS.filter((c) => c === "All" || items.some((it) => it.cat === c));
  const shown = cat === "All" ? items : items.filter((it) => it.cat === cat);

  return (
    <div style={{ background: BG, color: INK, minHeight: "100vh", fontFamily: SERIF }}>
      <style>{FONTS_IMPORT}</style>
      <div className="max-w-5xl mx-auto px-6 py-10">
        {open ? (
          <Detail key={open.id} item={open} onBack={() => setOpenId(null)} signedIn={!!user} onReserve={(variant) => reserve(open.id, variant)} onInvest={(amt, pay) => investIn(open.id, amt, pay)} liked={open.liked} onHeart={() => heart(open.id)} vote={open.vote} onVote={(d) => castVote(open.id, d)} />
        ) : (
          <>
            <header className="flex items-center justify-between mb-2">
              <h1 className="text-xl tracking-tight" style={{ fontWeight: 500 }}>ShouldiMakeThis<span style={{ color: MUTE }}>.com</span></h1>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {user && (
                  <button onClick={() => signOut(auth)} style={{ background: "none", border: "none", color: MUTE, fontFamily: SERIF, fontSize: 13, fontStyle: "italic", cursor: "pointer", padding: 0 }}>
                    sign out
                  </button>
                )}
                <button onClick={() => { setShowForm((s) => !s); setPosted(false); }} className="px-4 py-2" style={SMBTN}>
                  {showForm ? "Close" : "Post item"}
                </button>
              </div>
            </header>
            <p className="text-sm mb-6" style={{ color: MUTE, fontStyle: "italic" }}>
              Invest in what you think should exist.
            </p>

            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 24 }}>
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} className="px-3 py-1"
                  style={{ flexShrink: 0, fontFamily: TITLE, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase",
                    borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${cat === c ? INK : LINE}`,
                    background: cat === c ? INK : "transparent", color: cat === c ? "#fff" : INK }}>
                  {c}
                </button>
              ))}
            </div>

            {showForm && <NewItemForm onSubmit={submitItem} busy={posting} />}
            {posted && !showForm && (
              <p style={{ fontSize: 13, color: GREEN, fontStyle: "italic", margin: "0 0 24px" }}>
                Posted — it'll appear once it's approved.
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
              {shown.map((it) => (
                <Tile key={it.id} item={it} onOpen={() => setOpenId(it.id)} onHeart={() => heart(it.id)} onVote={(d) => castVote(it.id, d)} />
              ))}
            </div>
          </>
        )}
      </div>
      {signinOpen && <SignInModal onClose={() => { setSigninOpen(false); pendingRef.current = null; }} onSignIn={doSignIn} />}
    </div>
  );
}

const STAGE = {
  production: { label: "In production", color: "#b9893f" },
  made: { label: "Made", color: GREEN },
};
function StageBadge({ stage }) {
  const s = STAGE[stage];
  if (!s) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: TITLE, fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", color: s.color }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function Bar({ pct, funded, label }) {
  return (
    <div>
      <div style={{ height: 4, background: "rgba(0,0,0,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: 4, width: `${pct}%`, background: funded ? GREEN : INK }} />
      </div>
      {label && <p style={{ fontSize: 11, color: funded ? GREEN : MUTE, marginTop: 4 }}>{label}</p>}
    </div>
  );
}

function VoteButtons({ vote, onVote, size }) {
  const big = size === "lg";
  const DOWN = "#b04a3a";
  const base = { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", borderRadius: 999, padding: big ? "8px 14px" : "5px 9px", fontFamily: TITLE, fontSize: big ? 12 : 11, letterSpacing: ".04em", textTransform: "uppercase", background: "transparent" };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={(e) => { e.stopPropagation(); onVote("up"); }} aria-label="This should exist"
        style={{ ...base, border: `1px solid ${vote === "up" ? GREEN : LINE}`, color: vote === "up" ? GREEN : INK }}>
        <ThumbsUp size={big ? 16 : 15} fill={vote === "up" ? GREEN : "none"} stroke={vote === "up" ? GREEN : INK} strokeWidth={1.6} />
        {big && <span>should exist</span>}
      </button>
      <button onClick={(e) => { e.stopPropagation(); onVote("down"); }} aria-label="This shouldn't exist"
        style={{ ...base, border: `1px solid ${vote === "down" ? DOWN : LINE}`, color: vote === "down" ? DOWN : INK }}>
        <ThumbsDown size={big ? 16 : 15} fill={vote === "down" ? DOWN : "none"} stroke={vote === "down" ? DOWN : INK} strokeWidth={1.6} />
        {big && <span>shouldn't</span>}
      </button>
    </div>
  );
}

function Tile({ item, onOpen, onHeart, onVote }) {
  const funded = item.raised >= targetOf(item);
  const pct = pctOf(item);
  return (
    <div onClick={onOpen} style={{ cursor: "pointer" }}>
      <div style={{ position: "relative", aspectRatio: "1 / 1", background: TILE_BG, borderRadius: 6, overflow: "hidden" }}>
        {item.imgs[0] && <img src={item.imgs[0]} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        <button onClick={(e) => { e.stopPropagation(); onHeart(); }} aria-label="Like" style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
          <HeartIcon filled={item.liked} />
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        {STAGE[item.stage] ? <StageBadge stage={item.stage} /> : <Bar pct={pct} funded={funded} />}
      </div>
      <h2 style={{ fontFamily: TITLE, fontSize: 16, fontWeight: 500, marginTop: 8, lineHeight: 1.05, textTransform: "lowercase", fontVariant: "small-caps", letterSpacing: ".04em" }}>{item.title}</h2>
      <p style={{ fontSize: 12, color: MUTE, fontStyle: "italic", marginTop: 4 }}>${item.cost} cost to produce</p>
      <p style={{ fontSize: 17, fontWeight: 600, marginTop: 1 }}>${item.retail}</p>
      <div style={{ marginTop: 8 }}>
        <VoteButtons vote={item.vote} onVote={onVote} />
      </div>
    </div>
  );
}

function Detail({ item, onBack, onReserve, onInvest, liked, onHeart, vote, onVote, signedIn }) {
  const stage = item.stage || "backing";
  const isMade = stage === "made";
  const done = item.preordered;

  const pct = pctOf(item);
  const funded = item.raised >= targetOf(item);

  const [sel, setSel] = useState(0);
  const [variant, setVariant] = useState(item.variants ? item.variants[0] : null);
  const [amt, setAmt] = useState(5);
  const [customStr, setCustomStr] = useState("");
  const [pay, setPay] = useState("now");
  const [msg, setMsg] = useState("");
  const presets = [1, 5, 10];

  const click = () => { if (!done) onReserve(variant); };

  const back = () => {
    onInvest(amt, pay);
    if (signedIn) {
      setMsg(pay === "now"
        ? `Locked in — $${amt} invested.`
        : `Saved — charged $${amt} only if "${item.title}" is chosen for printing.`);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm mb-6" style={{ color: MUTE, fontFamily: SERIF, background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4 items-start">
        <div>
          <div style={{ position: "relative", aspectRatio: "1 / 1", background: TILE_BG, borderRadius: 8, overflow: "hidden" }}>
            {item.imgs[sel] && <img src={item.imgs[sel]} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
            <button onClick={onHeart} aria-label="Like" style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <HeartIcon filled={liked} />
            </button>
          </div>

          {item.imgs.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {item.imgs.map((src, i) => (
                <button key={i} onClick={() => setSel(i)} style={{ width: 52, height: 52, borderRadius: 5, overflow: "hidden", padding: 0, cursor: "pointer", border: `2px solid ${sel === i ? INK : "transparent"}`, background: TILE_BG }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            {STAGE[stage] ? <StageBadge stage={stage} /> : <Bar pct={pct} funded={funded} label={funded ? "Funded" : `${Math.round(pct)}% backed`} />}
          </div>
        </div>

        <div>
          <h1 style={{ fontFamily: TITLE, fontSize: 24, fontWeight: 500, lineHeight: 1.05, textTransform: "lowercase", fontVariant: "small-caps", letterSpacing: ".04em" }}>
            {item.titlePrefix ? `${item.titlePrefix}${variant}` : item.title}
          </h1>
          <p style={{ fontSize: 13, color: MUTE, fontStyle: "italic", marginTop: 10 }}>${item.cost} cost to produce</p>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 2 }}>
            <p style={{ fontSize: 22, fontWeight: 600 }}>${item.retail}</p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <button onClick={click} className="px-4 py-2" style={{ ...SMBTN, ...(done ? { background: "#fff" } : {}) }}>
                {done ? (isMade ? "Added ✓" : "Reserved ✓") : (isMade ? `Buy · $${item.retail}` : `Preorder · $${item.cost}`)}
              </button>
              {!done && !isMade && <span style={{ fontFamily: TITLE, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: MUTE }}>i want this</span>}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <p style={{ fontFamily: TITLE, fontSize: 11, textTransform: "uppercase", letterSpacing: ".07em", color: MUTE, marginBottom: 8 }}>Should this exist?</p>
            <VoteButtons vote={vote} onVote={onVote} size="lg" />
          </div>

          {item.variants && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12, color: MUTE, fontStyle: "italic", marginBottom: 8 }}>{item.variantLabel || "Choose an option"}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {item.variants.map((v) => (
                  <button key={v} onClick={() => setVariant(v)} className="px-3 py-1.5"
                    style={{ fontFamily: SERIF, fontSize: 13, borderRadius: 999, cursor: "pointer",
                      border: `1px solid ${variant === v ? INK : LINE}`,
                      background: variant === v ? "#e0d9ca" : "#fff", color: INK }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {stage === "backing" && (
          <div style={{ marginTop: 30, paddingTop: 22, borderTop: `1px solid ${LINE}` }}>
            <p style={{ fontSize: 14, color: "#3a352f", lineHeight: 1.5 }}>
              Invest in this and get a percentage of the profit.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 52 }}>
                {presets.map((p) => {
                  const seld = amt === p && !customStr;
                  return (
                    <button key={p} onClick={() => { setAmt(p); setCustomStr(""); }}
                      style={{ fontFamily: SERIF, fontSize: 13, borderRadius: 6, padding: "8px 0", cursor: "pointer",
                        border: `1px solid ${seld ? INK : LINE}`,
                        background: seld ? "#e0d9ca" : "#fff", color: INK }}>
                      ${p}
                    </button>
                  );
                })}
              </div>

              <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
                <PayRow selected={pay === "now"} onClick={() => setPay("now")} label="Charge me now" sub="lock in your investment" />
                <div style={{ height: 1, background: LINE }} />
                <PayRow selected={pay === "later"} onClick={() => setPay("later")} label="Charge me later" sub="only if it's chosen for printing" />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", boxSizing: "border-box", width: 52, padding: "8px 8px", borderRadius: 6, background: "#fff", border: `1px solid ${customStr ? INK : LINE}` }}>
                <span style={{ color: MUTE, fontSize: 13, marginRight: 4 }}>$</span>
                <input value={customStr} onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, ""); setCustomStr(d); setAmt(Number(d) || 0); }} inputMode="numeric" aria-label="Other amount"
                  style={{ border: "none", outline: "none", background: "transparent", width: "100%", fontFamily: SERIF, fontSize: 13, color: INK, padding: 0 }} />
              </div>
              <span style={{ fontStyle: "italic", fontSize: 13, color: MUTE }}>other amount</span>
            </div>

            <button onClick={back} className="mt-4 px-4 py-2" style={SMBTN} disabled={!amt}>
              I think this will sell
            </button>
            {msg && <p style={{ fontSize: 12, color: GREEN, marginTop: 8 }}>{msg}</p>}

          </div>
          )}

          <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 26, color: "#3a352f" }}>{item.desc}</p>
        </div>
      </div>
    </div>
  );
}

function PayRow({ selected, onClick, label, sub }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", padding: "11px 13px", background: selected ? "rgba(28,27,25,0.04)" : "#fff" }}>
      <span style={{ width: 14, height: 14, borderRadius: "50%", marginTop: 3, flexShrink: 0, border: `1px solid ${INK}`, background: selected ? INK : "transparent" }} />
      <span>
        <span style={{ fontSize: 14, display: "block" }}>{label}</span>
        <span style={{ fontSize: 11, color: MUTE, fontStyle: "italic" }}>{sub}</span>
      </span>
    </div>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#c0533f" : "none"} stroke={filled ? "#c0533f" : INK} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function SignInModal({ onClose, onSignIn }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "28px 24px", maxWidth: 340, width: "100%", textAlign: "center", border: `1px solid ${LINE}`, fontFamily: SERIF }}>
        <p style={{ fontFamily: TITLE, fontSize: 18, textTransform: "lowercase", fontVariant: "small-caps", letterSpacing: ".04em", marginBottom: 6 }}>Save your favorites</p>
        <p style={{ fontSize: 14, color: MUTE, marginBottom: 20 }}>Sign in to like products and keep track of the ones you back.</p>
        <button onClick={onSignIn} className="px-4 py-2" style={{ ...SMBTN, width: "100%" }}>Continue with Google</button>
        <button onClick={onClose} style={{ marginTop: 10, background: "none", border: "none", color: MUTE, fontFamily: SERIF, fontSize: 13, cursor: "pointer" }}>Not now</button>
      </div>
    </div>
  );
}

function NewItemForm({ onSubmit, busy }) {
  const [f, setF] = useState({ file: null, title: "", retail: "", cost: "", goal: "", desc: "", cat: "Curios" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    if (!f.title.trim() || busy) return;
    onSubmit(f);
  };
  const input = { background: "#fff", border: `1px solid ${LINE}`, color: INK, borderRadius: 6, fontFamily: SERIF };

  return (
    <div className="mb-10 p-5 rounded-lg" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={f.title} onChange={set("title")} placeholder="Item name" className="px-3 py-2 text-sm" style={input} />
        <label className="px-3 py-2 text-sm" style={{ ...input, cursor: "pointer", color: f.file ? INK : MUTE, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {f.file ? f.file.name : "Photo"}
          <input type="file" accept="image/*" onChange={(e) => setF({ ...f, file: e.target.files[0] || null })} style={{ display: "none" }} />
        </label>
        <input value={f.retail} onChange={set("retail")} type="number" placeholder="Retail price" className="px-3 py-2 text-sm" style={input} />
        <input value={f.cost} onChange={set("cost")} type="number" placeholder="Cost to produce" className="px-3 py-2 text-sm" style={input} />
        <input value={f.goal} onChange={set("goal")} type="number" placeholder="Run size (units to produce)" className="px-3 py-2 text-sm" style={input} />
        <select value={f.cat} onChange={set("cat")} className="px-3 py-2 text-sm" style={input}>
          {CATS.filter((c) => c !== "All").map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <textarea value={f.desc} onChange={set("desc")} placeholder="Description" rows={2} className="w-full mt-3 px-3 py-2 text-sm" style={{ ...input, resize: "none" }} />
      <button onClick={submit} className="mt-4 px-4 py-2" style={SMBTN}>{busy ? "Posting…" : "Post item"}</button>
    </div>
  );
}
