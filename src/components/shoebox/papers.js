// The papers a Shoebox board can be pinned to. A board carries its own
// `bg` (Sophie: "add it as a new board background option — choose per
// board"), so two boards open in different rooms.
//
// Each paper owns three things: the CORK's own surface, the colour of the
// wall AROUND the board (what shows past the edges when she zooms out), and
// a swatch for the picker. `cls` is the class Shoebox.css hangs them on —
// a paper with no rule of that name would render as bare cork, so the test
// pins every id here against the stylesheet.
//
// A tiled paper is a DERIVED display copy: her original photo stays hers,
// and what ships is a mirrored, seamless webp (public/shoebox/*.webp) — the
// board repeats it forever, so the tile has to have no edges.

export const PAPERS = [
  {
    id: 'cork',
    name: 'Cork',
    cls: 'pp-cork',
    surface: '#c19a6b',
    wall: '#a5773f',
  },
  {
    id: 'stars',
    name: 'Star paper',
    cls: 'pp-stars',
    // Her navy paper with the cream stars, mirrored into a seamless tile.
    surface: '#16294a url(/shoebox/star-paper.webp) 0 0 / 1600px 1600px repeat',
    wall: '#101d33',
    asset: 'public/shoebox/star-paper.webp',
  },
];

export const DEFAULT_PAPER = 'cork';

// An unknown or missing paper is cork, never blank — a board saved by a
// newer page must still open on an older one.
export const paperOf = (id) => PAPERS.find((p) => p.id === id) || PAPERS[0];
