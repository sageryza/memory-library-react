import SwiftUI

/// The paper-doll base figure — sticker-book style art (white cami or ribbed
/// tank + lace-hem bloomers) that outfits get placed onto. Two bases for now:
/// girl and boy, committed in Assets.xcassets.
struct FigureView: View {
    let figure: Figure
    var scale: CGFloat = 1

    var body: some View {
        Image(figure.isBoy ? "doll-boy" : "doll-girl")
            .resizable()
            .scaledToFit()
            .frame(height: 220 * scale)
    }
}

/// The doll actually WEARING an outfit — garments layered over the base art at
/// per-doll body anchors (fractions of the doll's displayed size), like
/// stickers placed on the figure in a sticker book. Draw order: dress, bottom,
/// top, jacket, accessory.
struct DressedFigureView: View {
    @EnvironmentObject var store: ClosetStore
    let figure: Figure
    var top: UUID?
    var bottom: UUID?
    var full: UUID?
    var jacket: UUID?
    var accessory: UUID?
    var scale: CGFloat = 1

    /// A garment's placement: width as a fraction of doll width, top edge as a
    /// fraction of doll height, horizontal center as a fraction of doll width.
    private struct Zone { var w: CGFloat; var y: CGFloat; var x: CGFloat = 0.5 }

    // Tuned against the committed doll art; the boy is broader-shouldered so
    // his garments render larger. Accessories float by the shoulder.
    private var zones: [Category.Slot: Zone] {
        figure.isBoy
            ? [.upper: Zone(w: 0.80, y: 0.195), .lower: Zone(w: 0.68, y: 0.43),
               .full: Zone(w: 0.84, y: 0.19), .layer: Zone(w: 0.92, y: 0.18),
               .extra: Zone(w: 0.36, y: 0.04, x: 0.88)]
            : [.upper: Zone(w: 0.68, y: 0.21), .lower: Zone(w: 0.58, y: 0.435),
               .full: Zone(w: 0.74, y: 0.20), .layer: Zone(w: 0.82, y: 0.19),
               .extra: Zone(w: 0.34, y: 0.04, x: 0.88)]
    }

    /// Pixel aspect of the committed doll assets (width / height).
    private var aspect: CGFloat { figure.isBoy ? 382.0 / 900.0 : 409.0 / 900.0 }

    var body: some View {
        let h = 220 * scale
        let w = h * aspect
        ZStack(alignment: .topLeading) {
            Image(figure.isBoy ? "doll-boy" : "doll-girl")
                .resizable()
                .scaledToFit()
            garment(full, .full, w, h)
            garment(bottom, .lower, w, h)
            garment(top, .upper, w, h)
            garment(jacket, .layer, w, h)
            garment(accessory, .extra, w, h)
        }
        .frame(width: w, height: h)
    }

    @ViewBuilder
    private func garment(_ id: UUID?, _ slot: Category.Slot, _ w: CGFloat, _ h: CGFloat) -> some View {
        if let id, let img = store.item(id)?.image, let z = zones[slot] {
            Image(uiImage: img)
                .resizable()
                .scaledToFit()
                .frame(width: z.w * w)
                .offset(x: (z.x - z.w / 2) * w, y: z.y * h)
        }
    }
}
