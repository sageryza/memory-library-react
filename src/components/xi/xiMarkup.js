// Exact screen markup from the standalone XI app (xi_app_v1.html), verbatim
// except the in-app Library screen was removed — the bottom-nav "Library"
// button navigates to the real archive instead. Injected as raw HTML so the
// hand-tuned SVGs (animated XI logo, nav icons) stay pixel-identical and the
// imperative engine can bind to the same node ids it expects.
export const XI_MARKUP = `<div class="screen wrap" id="screen-today">
  <header class="topbar">
    <div class="tb-side"><div class="logo"><svg class="hg hg-x" viewBox="0 0 48 66" aria-hidden="true"><g fill="#241d18"><clipPath id="ht"><polygon points="9,9 39,9 24,33"/></clipPath><clipPath id="hb"><polygon points="24,33 9,57 39,57"/></clipPath><rect clip-path="url(#ht)" x="9" width="30" y="9" height="24"><animate attributeName="y" values="9;33" dur="4s" repeatCount="indefinite"/><animate attributeName="height" values="24;0" dur="4s" repeatCount="indefinite"/></rect><rect clip-path="url(#hb)" x="9" width="30" y="57" height="0"><animate attributeName="y" values="57;33" dur="4s" repeatCount="indefinite"/><animate attributeName="height" values="0;24" dur="4s" repeatCount="indefinite"/></rect><line x1="24" y1="33" x2="24" y2="52" stroke="#241d18" stroke-width="1.3"><animate attributeName="opacity" values="0;1;1;0" dur="4s" repeatCount="indefinite"/></line></g><g fill="none" stroke="#241d18" stroke-width="2.4" stroke-linejoin="round"><line x1="7" y1="8" x2="41" y2="8"/><line x1="7" y1="58" x2="41" y2="58"/><path d="M9,9 L39,9 L24,33 L39,57 L9,57 L24,33 Z"/></g></svg><svg class="logo-i" viewBox="0 0 16 66" aria-hidden="true"><g fill="none" stroke="#241d18" stroke-width="2.4"><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="58" x2="13" y2="58"/><line x1="8" y1="8" x2="8" y2="58"/></g></svg></div></div>
    <div class="center-wrap" id="center"></div>
    <div class="tb-side"></div>
  </header>
  <div id="cardSlot"></div>
</div>
<div class="screen wrap" id="screen-curate" style="display:none">
  <div id="curateSlot"></div>
</div>
<div class="screen wrap" id="screen-gallery" style="display:none">
  <div class="eyebrow" style="margin-bottom:10px">Past cards</div>
  <div id="gallerySlot"></div>
</div>
<div class="screen wrap" id="screen-board" style="display:none">
  <div class="boardtop"><div class="eyebrow">The Board</div><button class="newb" id="newBoard">New board</button></div>
  <div class="bgrid" id="boardSlot"></div>
  <div class="bpanel" id="boardPanel"></div>
</div>
<nav class="botnav">
  <button id="navCurate"><svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z"/></svg><span class="nlab">Curate</span></button>
  <button id="navToday" class="on"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><span class="nlab">Today</span></button>
  <button id="navBoard"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg><span class="nlab">Board</span></button>
  <button id="navGallery"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span class="nlab">Past</span></button>
  <button id="navLibrary"><svg viewBox="0 0 24 24"><path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/></svg><span class="nlab">Library</span></button>
</nav>`;
export default XI_MARKUP;
