import SwiftUI
import UIKit

struct BookView: View {
    @ObservedObject var store: MiraclesStore
    var onBackToCover: () -> Void = {}
    @State private var distill = true
    @State private var editingDate = false

    private let columns = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]
    private let pageMargin: CGFloat = 22
    private var neighborShift: CGFloat { pageMargin + 16 } // enough to bleed off-screen

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea() // cream all around

            // The page sheet hugs its content (a real page, not a full-screen
            // panel). It sits centered; the scroll view exists so that when the
            // keyboard is up, the focused caption can scroll into view — with a
            // short page there's nothing to scroll and it just stays centered.
            GeometryReader { geo in
                ScrollView {
                    pageBody
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: geo.size.height, alignment: .center)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            // Tapping anywhere that isn't a control puts the redraw controls
            // away (drawings and buttons consume their own taps first).
            .contentShape(Rectangle())
            .onTapGesture { store.activeBoxID = nil }

            // Faint turn arrows on either side (replaces the old nav row).
            HStack {
                turnArrow("arrowtriangle.backward.fill", enabled: true) {
                    if store.index > 0 { store.turnBack() } else { onBackToCover() }
                }
                Spacer()
                turnArrow("arrowtriangle.forward.fill", enabled: store.canTurnForward) { store.turnForward() }
            }
            .padding(.horizontal, 4)
        }
        // ONE keyboard "Done" for the whole page (not one per box).
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { dismissKeyboard() }
            }
        }
        .sheet(isPresented: $editingDate) { dateEditor }
    }

    // A single page: a square-cornered white sheet (like a real book page).
    private var pageSheet: some View {
        Rectangle()
            .fill(Color.white)
            .overlay(Rectangle().stroke(Theme.line.opacity(0.6), lineWidth: 1))
            .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 3)
    }

    // Still only ONE neighbor at a time — but it alternates sides with every
    // turn, like a real book: even pages read as right-hand pages (the rest of
    // the book peeks on the right), odd pages as left-hand pages (the page you
    // just turned peeks on the left). At either end, fall back to whichever
    // side actually has pages.
    @ViewBuilder private var neighborSheet: some View {
        if store.index % 2 == 1 {
            if store.index > 0 { pageSheet.offset(x: -neighborShift) }
            else if store.canTurnForward { pageSheet.offset(x: neighborShift) }
        } else {
            if store.canTurnForward { pageSheet.offset(x: neighborShift) }
            else if store.index > 0 { pageSheet.offset(x: -neighborShift) }
        }
    }

    // The white sheet + its content, sized to the content — with ONE neighbor
    // page bleeding off the screen edge so it reads like a real book
    // (two pages, never three).
    private var pageBody: some View {
        VStack(spacing: 16) {
            if store.page.hasContent { dateRow }

            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(store.page.boxes) { box in
                    BoxView(store: store, box: box, distill: $distill)
                }
            }
        }
        .padding(20)
        .frame(maxWidth: 560)
        .background { pageSheet }
        .background { neighborSheet }
        .padding(.horizontal, pageMargin)
        .padding(.vertical, 24)
    }

    // Date — right-aligned, printed "DATE:" label then the handwritten date.
    // Only appears once the page has content; tap the date to edit it.
    private var dateRow: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Spacer()
            Text("DATE:")
                .font(.custom(Theme.serif, size: 12))
                .tracking(1)
                .foregroundStyle(Theme.muted)
            Button { editingDate = true } label: {
                Text(store.page.date, format: .dateTime.month(.wide).day())
                    .font(.custom(Theme.handwriting, size: 22))
                    .foregroundStyle(Theme.dateInk)
                    .padding(.bottom, 2)
                    .overlay(Rectangle().frame(height: 1).foregroundStyle(Theme.dateUnderline), alignment: .bottom)
            }
            .buttonStyle(.plain)
        }
    }

    // A small date picker sheet bound to the current page's date.
    private var dateEditor: some View {
        NavigationStack {
            DatePicker(
                "Date",
                selection: Binding(get: { store.page.date }, set: { store.setDate($0) }),
                displayedComponents: .date
            )
            .datePickerStyle(.graphical)
            .padding()
            .navigationTitle("Date")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { editingDate = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    // Faint filled triangle to turn a page; invisible + inert at the ends.
    private func turnArrow(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 22))
                .foregroundStyle(Theme.muted.opacity(enabled ? 0.45 : 0))
                .frame(width: 30, height: 64)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .allowsHitTesting(enabled)
    }

    private func dismissKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil
        )
    }
}
