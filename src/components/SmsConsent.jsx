// Public SMS terms page (/sms) — a real, customer-facing page describing the
// turn-alert texts: what we send, how often, how to opt out (STOP/HELP), cost,
// and privacy. Linked from the opt-in checkbox, and used as the written-terms
// URL for Twilio toll-free verification. No auth — reachable by anyone.
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
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 14px' }}>Text Message Terms</h1>

        <p style={{ fontSize: 17, lineHeight: 1.5, color: C.soft, margin: '0 0 24px' }}>
          XI · Versus is a turn-based memory game at{' '}
          <a href="https://incaseofamnesia.com/xi/versus" style={{ color: C.accent }}>incaseofamnesia.com</a>.
          When you start or join a game, you can check <b style={{ color: C.ink }}>“Text me when it's my
          turn”</b> and enter your mobile number to receive a text each time it becomes your turn. Opting
          in is entirely optional — the game works the same without it.
        </p>

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
