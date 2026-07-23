// Emphasis-preserving cleaner. Unlike the old one it does NOT throw away *italic*
// / **bold** or the `---` page breaks — it converts them to real markup the
// timeline renders: <em>/<strong> and a @@PB@@ page-break token.
export function clean(raw) {
  let s = raw
    .replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\\t/g, "  ");
  // unescape ALL markdown backslash-escapes: this dump double-escapes, so an
  // escaped bracket lands as "\\[" (two backslashes) — collapse "\\"→"\" first,
  // then turn a backslash before any ASCII punctuation into the punctuation
  // itself (covers \$ \[ \] \( \) \~ \{ \} \| \^ \& \# \- \_ \* \" and the rest).
  // Do this BEFORE stripping structural markup so "\$20" survives as "$20".
  s = s.replace(/\\\\/g, "\\").replace(/\\([!-\/:-@\[-`{-~])/g, "$1");
  // structural markup we never want (kept from the old cleaner)
  s = s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "(pic)")             // embedded drawings
    .replace(/\s*\{[a-zA-Z_][\w-]*=[^}\n]*\}/g, "")       // notion attribute braces ({color=…}, {toggle=…}); keeps literal {implication}
    .replace(/\t/g, " ")
    .replace(/<\/?[a-z_][a-z0-9_-]*(?:\s[^>\n]*)?\/?>/gi, "") // notion tags (synced_block, columns, empty-block…)
    .replace(/^\s*#{1,6}\s+/gm, "").replace(/\s*#{1,6}\s*$/gm, "")
    .replace(/^.*(?:color\{gray\}|\\rule\{)[^\n]*$/gm, "") // latex hr dividers
    .replace(/`\$|\$`/g, "")                               // latex code-math delimiters only (keep literal $)
    .replace(/\[?https?:\/\/\S+?\]?(?=\s|$)/g, "");        // bare urls
  // page breaks -> token on their own line
  s = s.replace(/^\s*---\s*$/gm, "\n@@PB@@\n");
  // now escape real HTML so literal <>& in the journal are safe...
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // ...then turn the paired asterisks into real emphasis tags (only tags we emit)
  s = s.replace(/\*\*([^\n*][^*]*?)\*\*/g, "<strong>$1</strong>")
       .replace(/\*([^\n*][^*]*?)\*/g, "<em>$1</em>");
  // any asterisks left are orphaned emphasis markers (e.g. a **bold** header the
  // page-splitter cut through) — drop them so no raw ** or * leaks into the UI.
  s = s.replace(/\*+/g, "");
  // any backslash with nothing meaningful after it (trailing hard-break marker,
  // stray "\\" at a slice edge) is an artifact — drop it.
  s = s.replace(/\\(?=\s|$)/g, "");
  // collapse whitespace, tidy the PB token lines, trim
  s = s.replace(/[ \t]{2,}/g, " ")
       .replace(/[ \t]+\n/g, "\n")
       .replace(/\n{3,}/g, "\n\n")
       .replace(/\n*@@PB@@\n*/g, "\n@@PB@@\n")
       .trim()
       .replace(/^@@PB@@\n?/, "").replace(/\n?@@PB@@$/, ""); // no leading/trailing divider
  return s;
}
