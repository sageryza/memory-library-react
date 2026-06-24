// Public SMS-consent page (/sms) — a single, self-contained page that tells the
// whole opt-in story for Twilio toll-free verification: a visual of the opt-in
// checkbox plus what we send, how often, and how to opt out (STOP/HELP). No auth,
// no app chrome — it must be reachable by anyone (including a Twilio reviewer).
const C = {
  bg: '#efe7d6', card: '#fbf7ec', ink: '#241d18', soft: '#5b4f44',
  faint: '#8a7d6e', accent: '#800020', line: '#e2d8c2', field: '#fbf8f1',
  serif: "'EB Garamond', Georgia, serif",
};

export default function SmsConsent() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: C.serif,
      padding: '32px 18px 64px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontVariant: 'small-caps', letterSpacing: '.06em', fontSize: 22, marginBottom: 6 }}>
          XI · Versus
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 14px' }}>Text Notifications</h1>

        <p style={{ fontSize: 17, lineHeight: 1.5, color: C.soft, margin: '0 0 22px' }}>
          XI · Versus is a turn-based memory game at{' '}
          <a href="https://incaseofamnesia.com/xi/versus" style={{ color: C.accent }}>incaseofamnesia.com</a>.
          When you start or join a game, you can choose to get a text message when it becomes
          your turn — so you don't keep the other players waiting.
        </p>

        {/* A faithful, static rendition of the actual in-app opt-in. */}
        <div style={{ fontSize: 13, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          How you opt in (shown when you start or join a game)
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6,
          padding: '14px 16px', maxWidth: 320, marginBottom: 26 }}>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Don't keep your friends waiting.</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span aria-hidden style={{ width: 18, height: 18, borderRadius: 4, background: C.accent, color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flex: 'none', marginTop: 2 }}>✓</span>
            <span style={{ fontSize: 15.5 }}>Text me when it's my turn</span>
          </div>
          <div style={{ marginTop: 9, border: `1px solid #cbbfa6`, borderRadius: 6, background: C.field,
            padding: '9px 11px', color: C.faint, fontSize: 15.5 }}>Mobile number</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: C.faint }}>We'll never text you anything else.</div>
        </div>

        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
          {[
            ['What we send', 'A turn alert — “XI · Versus — it’s your move” — with a link to your game. Nothing else: no marketing, no promotions.'],
            ['How often', 'Only when it becomes your turn in a game you’re actively playing — typically a handful of messages per game.'],
            ['Opt out anytime', 'Reply STOP to any message to stop receiving texts. Reply HELP for help.'],
            ['Cost', 'Message and data rates may apply, depending on your mobile plan.'],
            ['Your number', 'Used only to send your own turn alerts. We never sell or share it, and you can remove it anytime.'],
          ].map(([h, body]) => (
            <div key={h} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 3 }}>{h}</div>
              <div style={{ fontSize: 15.5, lineHeight: 1.5, color: C.soft }}>{body}</div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 14, color: C.faint, marginTop: 24 }}>
          Questions? Visit{' '}
          <a href="https://incaseofamnesia.com/xi/versus" style={{ color: C.accent }}>incaseofamnesia.com</a>.
        </p>
      </div>
    </div>
  );
}
