import UIKit

/// Renders a full constellation board — every card, string, insight, and pin,
/// laid out exactly as arranged — into one image, so a shared board can be SEEN
/// at a glance in a text message (the picture rides the share link's preview).
enum BoardImage {
    private static let cardW: CGFloat = 188
    private static let cardH: CGFloat = 128
    private static let beige = UIColor(red: 0.980, green: 0.973, blue: 0.914, alpha: 1)      // #faf8e9
    private static let beigeBorder = UIColor(red: 0.910, green: 0.902, blue: 0.835, alpha: 1) // #e8e6d5
    private static let crimson = UIColor(red: 0.862, green: 0.078, blue: 0.235, alpha: 1)     // #dc143c
    private static let slate = UIColor(red: 0.184, green: 0.310, blue: 0.310, alpha: 1)       // #2F4F4F
    private static let bodyGrey = UIColor(red: 0.40, green: 0.40, blue: 0.40, alpha: 1)

    struct Card {
        let id: String
        let title: String
        let snippet: String
    }

    /// JPEG of the whole board, longest side ≤ maxSide, compressed to fit a
    /// Firestore field (< ~700KB). nil when the board is empty.
    static func render(cards: [Card],
                       positions: [String: CGPoint],
                       pins: [(id: String, text: String)],
                       connections: [(a: String, b: String, insight: String)],
                       maxSide: CGFloat = 1600) -> Data? {
        // Content bounds: every placed card + pin, padded.
        var rects: [CGRect] = []
        for c in cards {
            guard let p = positions[c.id] else { continue }
            rects.append(CGRect(x: p.x - cardW / 2, y: p.y - cardH / 2, width: cardW, height: cardH))
        }
        for pin in pins {
            guard let p = positions[pin.id] else { continue }
            rects.append(CGRect(x: p.x - 70, y: p.y - 30, width: 140, height: 60))
        }
        guard var bounds = rects.first else { return nil }
        for r in rects.dropFirst() { bounds = bounds.union(r) }
        bounds = bounds.insetBy(dx: -60, dy: -60)

        let scale = min(1, maxSide / max(bounds.width, bounds.height))
        let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        let img = renderer.image { ctx in
            let g = ctx.cgContext
            UIColor.white.setFill()
            g.fill(CGRect(origin: .zero, size: size))
            g.translateBy(x: -bounds.minX * scale, y: -bounds.minY * scale)
            g.scaleBy(x: scale, y: scale)

            // Strings first (behind the cards), with their insight tags.
            for conn in connections {
                guard let pa = anchor(conn.a, positions: positions, pins: pins),
                      let pb = anchor(conn.b, positions: positions, pins: pins) else { continue }
                g.setStrokeColor(crimson.cgColor)
                g.setLineWidth(2)
                g.move(to: pa); g.addLine(to: pb); g.strokePath()
                let insight = conn.insight.trimmingCharacters(in: .whitespacesAndNewlines)
                if !insight.isEmpty {
                    let mid = CGPoint(x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2)
                    tag(insight, at: mid, in: g)
                }
            }

            // Cards.
            for c in cards {
                guard let p = positions[c.id] else { continue }
                let rect = CGRect(x: p.x - cardW / 2, y: p.y - cardH / 2, width: cardW, height: cardH)
                let path = UIBezierPath(roundedRect: rect, cornerRadius: 6)
                beige.setFill(); path.fill()
                beigeBorder.setStroke(); path.lineWidth = 1.5; path.stroke()
                draw(c.title, in: rect.insetBy(dx: 12, dy: 10),
                     font: .systemFont(ofSize: 15, weight: .semibold), color: slate, maxLines: 2)
                let titleH: CGFloat = 40
                var body = rect.insetBy(dx: 12, dy: 10); body.origin.y += titleH; body.size.height -= titleH
                draw(c.snippet, in: body, font: .systemFont(ofSize: 12), color: bodyGrey, maxLines: 4)
                // Push-pin, top-right — same spot strings anchor to.
                pinHead(at: CGPoint(x: rect.maxX - 10, y: rect.minY + 9), in: g)
            }

            // Concept pins: pin head + label beneath.
            for pin in pins {
                guard let p = positions[pin.id] else { continue }
                pinHead(at: p, in: g)
                let label = pin.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !label.isEmpty {
                    tag(label, at: CGPoint(x: p.x, y: p.y + 24), in: g)
                }
            }
        }

        // Fit under Firestore's document budget, degrading gracefully.
        for quality in [0.72, 0.55, 0.4, 0.3] {
            if let data = img.jpegData(compressionQuality: quality), data.count < 700_000 {
                return data
            }
        }
        return img.jpegData(compressionQuality: 0.25)
    }

    /// Where a string attaches: a card's push-pin (top-right) or a pin's head.
    private static func anchor(_ id: String, positions: [String: CGPoint],
                               pins: [(id: String, text: String)]) -> CGPoint? {
        guard let c = positions[id] else { return nil }
        if pins.contains(where: { $0.id == id }) { return c }
        return CGPoint(x: c.x + cardW / 2 - 10, y: c.y - cardH / 2 + 9)
    }

    private static func pinHead(at p: CGPoint, in g: CGContext) {
        g.setFillColor(crimson.cgColor)
        g.fillEllipse(in: CGRect(x: p.x - 6, y: p.y - 6, width: 12, height: 12))
        g.setFillColor(UIColor.white.withAlphaComponent(0.35).cgColor)
        g.fillEllipse(in: CGRect(x: p.x - 3.5, y: p.y - 3.5, width: 4, height: 4))
    }

    /// A small beige label centered on a point (insights, pin names).
    private static func tag(_ text: String, at mid: CGPoint, in g: CGContext) {
        let font = UIFont.systemFont(ofSize: 11)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: slate]
        let clipped = text.count > 60 ? String(text.prefix(57)) + "…" : text
        let str = NSAttributedString(string: clipped, attributes: attrs)
        var box = str.size()
        box.width = min(box.width, 220)
        let rect = CGRect(x: mid.x - box.width / 2 - 6, y: mid.y - box.height / 2 - 3,
                          width: box.width + 12, height: box.height + 6)
        let path = UIBezierPath(roundedRect: rect, cornerRadius: 4)
        beige.setFill(); path.fill()
        beigeBorder.setStroke(); path.lineWidth = 1; path.stroke()
        str.draw(with: CGRect(x: rect.minX + 6, y: rect.minY + 3, width: box.width, height: box.height),
                 options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
    }

    private static func draw(_ text: String, in rect: CGRect, font: UIFont, color: UIColor, maxLines: Int) {
        guard !text.isEmpty else { return }
        let para = NSMutableParagraphStyle()
        para.lineBreakMode = .byTruncatingTail
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .paragraphStyle: para]
        var clipped = rect
        clipped.size.height = min(rect.height, font.lineHeight * CGFloat(maxLines) + 2)
        NSAttributedString(string: text, attributes: attrs)
            .draw(with: clipped, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
    }
}
