// The locked-in journal-illustration prompt (V2, with "readable but only barely"
// restored to the user's/ChatGPT's exact wording). Reuse in mining runs.
export const REFDESC = "The seven reference images are the user's own raw marker sketches on paper: a hanging fish mobile, a hand placing a loose puzzle piece, an open first-aid kit, a group of chess pieces, a hand reaching into a bowl of cereal, a small handheld viewfinder, and a little wagon of standing figures with a pull cord.";

export const FINAL_PROMPT = (c) =>
  `${REFDESC} Use them ONLY as style guidance — do not copy their content. Draw a NEW quick marker sketch `
  + 'on paper in the same spirit — NOT a clean doodle, NOT an icon, NOT clipart. Match the line quality '
  + 'exactly: wobbly, blunt, uneven, slightly shaky black lines with inconsistent thickness. Let proportions '
  + 'be clumsy and imperfect. Keep the forms extremely simple, sparse, awkward, and direct. Keep lots of '
  + 'blank white or off-white paper visible. Each object should be readable but only barely — like a quick '
  + 'concept sketch, not a finished illustration. Black pen only: no color, no shading, no solid fills, no '
  + 'smooth symmetry, no polished icon design, no cute decorative embellishment. NO whole people or stick '
  + `figures (a hand is fine). Make it feel like a photographed or scanned sketch page. Draw: ${c}.`;
