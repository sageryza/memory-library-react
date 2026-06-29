import SwiftUI

/// The animated XI wordmark — an hourglass "X" whose sand drains from the top
/// chamber into the bottom over a 4-second loop, beside a serif "I". Faithful
/// port of the web `XI_LOGO` SVG (viewBox 48×66 for the X, 16×66 for the I).
struct XILogo: View {
    var height: CGFloat = 30
    private let ink = Color(red: 0.141, green: 0.114, blue: 0.094) // #241d18

    var body: some View {
        TimelineView(.animation) { tl in
            let p = phase(tl.date)
            HStack(alignment: .center, spacing: 1) {
                Canvas { ctx, size in drawX(ctx, size, p) }
                    .frame(width: height * 22 / 30, height: height)
                Canvas { ctx, size in drawI(ctx, size) }
                    .frame(width: height * 8 / 30, height: height)
            }
        }
        .frame(height: height)
    }

    private func phase(_ d: Date) -> CGFloat {
        let t = d.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4)
        return CGFloat(t / 4)
    }

    // Opacity of the falling-sand stream: ramp up, hold, ramp down (0;1;1;0).
    private func stream(_ p: CGFloat) -> Double {
        if p < 1.0 / 3 { return Double(p * 3) }
        if p < 2.0 / 3 { return 1 }
        return Double((1 - p) * 3)
    }

    private func drawX(_ ctx: GraphicsContext, _ size: CGSize, _ p: CGFloat) {
        let sx = size.width / 48, sy = size.height / 66
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
        func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
            CGRect(x: x * sx, y: y * sy, width: w * sx, height: h * sy)
        }

        // Sand — top chamber draining, bottom chamber filling, clipped to triangles.
        var top = Path(); top.move(to: pt(9, 9)); top.addLine(to: pt(39, 9)); top.addLine(to: pt(24, 33)); top.closeSubpath()
        var ct = ctx; ct.clip(to: top)
        ct.fill(Path(rect(9, 9 + 24 * p, 30, 24 * (1 - p))), with: .color(ink))

        var bot = Path(); bot.move(to: pt(24, 33)); bot.addLine(to: pt(9, 57)); bot.addLine(to: pt(39, 57)); bot.closeSubpath()
        var cb = ctx; cb.clip(to: bot)
        cb.fill(Path(rect(9, 57 - 24 * p, 30, 24 * p)), with: .color(ink))

        // Falling stream down the waist.
        if stream(p) > 0.01 {
            var line = Path(); line.move(to: pt(24, 33)); line.addLine(to: pt(24, 52))
            ctx.stroke(line, with: .color(ink.opacity(stream(p))), lineWidth: 1.3 * sx)
        }

        // Outline: top bar, bottom bar, the hourglass bowtie.
        var outline = Path()
        outline.move(to: pt(7, 8)); outline.addLine(to: pt(41, 8))
        outline.move(to: pt(7, 58)); outline.addLine(to: pt(41, 58))
        outline.move(to: pt(9, 9)); outline.addLine(to: pt(39, 9)); outline.addLine(to: pt(24, 33))
        outline.addLine(to: pt(39, 57)); outline.addLine(to: pt(9, 57)); outline.addLine(to: pt(24, 33)); outline.closeSubpath()
        ctx.stroke(outline, with: .color(ink),
                   style: StrokeStyle(lineWidth: 2.4 * sx, lineJoin: .round))
    }

    private func drawI(_ ctx: GraphicsContext, _ size: CGSize) {
        let sx = size.width / 16, sy = size.height / 66
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * sx, y: y * sy) }
        var p = Path()
        p.move(to: pt(3, 8)); p.addLine(to: pt(13, 8))
        p.move(to: pt(3, 58)); p.addLine(to: pt(13, 58))
        p.move(to: pt(8, 8)); p.addLine(to: pt(8, 58))
        ctx.stroke(p, with: .color(ink), style: StrokeStyle(lineWidth: 2.4 * sx))
    }
}
