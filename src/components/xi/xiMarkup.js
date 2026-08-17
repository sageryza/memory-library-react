// Exact screen markup from the standalone XI app (xi_app_v1.html). The in-app
// Library screen is restored (Firestore-backed via the engine) and given an
// "Open full archive" link; export/import controls are dropped (the shared
// archive handles backups). Injected as raw HTML so the hand-tuned SVGs
// (animated XI logo, nav icons) stay pixel-identical and the imperative engine
// can bind to the same node ids it expects.
// The XI wordmark — wide-tracked Marcellus caps over a gilt rule broken by an
// oxblood lozenge (the 2a masthead). Lives in a persistent header above the
// screens so it shows on EVERY XI screen, not just Today.
//
// This replaces the animated sand-timer "X": the redesign drops it in all four
// directions, and the design tool had reproduced it faithfully in its
// "current screens" recreation, so the swap is a decision rather than an
// oversight. The old SVG is one `git show` away if it's wanted back.
const XI_LOGO = `<div class="logo"><span class="logo-xi">XI</span><span class="logo-rule" aria-hidden="true"><i></i><b></b><i></i></span></div>`;

export const XI_MARKUP = `<header class="xi-brand">${XI_LOGO}<div id="brandToggles" class="brand-toggles" style="display:none"></div></header>
<div class="screen wrap" id="screen-today">
  <header class="today-head" id="center"></header>
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
<div class="screen wrap" id="screen-library" style="display:none">
  <div class="libhead"><div class="eyebrow">Library</div><button class="linkbtn" id="openArchive" style="margin-top:0">Open full archive &rarr;</button></div>
  <div id="librarySlot"></div>
</div>
<nav class="botnav">
  <button id="navCurate"><svg viewBox="0 0 24 24"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z"/></svg></button>
  <button id="navToday" class="on"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></button>
  <button id="navBoard"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg></button>
  <button id="navGallery"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button>
  <button id="navLibrary"><svg viewBox="0 0 24 24"><path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/></svg></button>
</nav>
<button class="navhandle" id="navHandle" aria-label="Show menu"><span></span></button>`;
export default XI_MARKUP;
