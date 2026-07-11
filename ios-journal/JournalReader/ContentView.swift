import SwiftUI
import PDFKit
import Speech
import AVFoundation
import Combine

struct TranscriptionEntry: Identifiable, Codable {
    let id: UUID
    let pdfName: String
    let pageNumber: Int
    let transcription: String
    let date: Date
    
    init(pdfName: String, pageNumber: Int, transcription: String) {
        self.id = UUID()
        self.pdfName = pdfName
        self.pageNumber = pageNumber
        self.transcription = transcription
        self.date = Date()
    }
    
    init(id: UUID, pdfName: String, pageNumber: Int, transcription: String, date: Date) {
        self.id = id
        self.pdfName = pdfName
        self.pageNumber = pageNumber
        self.transcription = transcription
        self.date = date
    }
}

struct Category: Identifiable, Codable {
    let id: UUID
    let color: String
    let name: String

    init(color: String, name: String = "") {
        // Derive a STABLE id from the name so that page tags (which store these
        // ids) keep matching across app launches. Previously this used a fresh
        // UUID() every launch, so every relaunch orphaned all your tags.
        self.id = Category.stableID(for: name)
        self.color = color
        self.name = name
    }

    var swiftUIColor: Color {
        Color(hex: color)
    }

    /// Deterministic UUID from a category name (FNV-1a hash → 16 bytes), so the
    /// same name always yields the same id — on this launch and every future one.
    static func stableID(for name: String) -> UUID {
        let key = name.lowercased()
        func fnv(_ seed: UInt64) -> UInt64 {
            var hash: UInt64 = seed
            for b in key.utf8 { hash = (hash ^ UInt64(b)) &* 1099511628211 }
            return hash
        }
        let lo = fnv(1469598103934665603)          // FNV offset basis
        let hi = fnv(1099511628211 &* 2654435761)  // different seed for the top half
        func byte(_ v: UInt64, _ i: Int) -> UInt8 { UInt8((v >> (8 * UInt64(i))) & 0xff) }
        return UUID(uuid: (
            byte(lo,0), byte(lo,1), byte(lo,2), byte(lo,3),
            byte(lo,4), byte(lo,5), byte(lo,6), byte(lo,7),
            byte(hi,0), byte(hi,1), byte(hi,2), byte(hi,3),
            byte(hi,4), byte(hi,5), byte(hi,6), byte(hi,7)
        ))
    }
}

struct PageCategory: Codable {
    let pdfName: String
    let pageNumber: Int
    let categoryIds: [UUID]
}

struct BookmarkItem: Identifiable {
    let id = UUID()
    let label: String
    let page: Int?
    let date: Date?
    var children: [BookmarkItem]
}

struct CategoryPageMetadata: Codable {
    let categoryName: String
    let pageIndex: Int
    let date: Date
    let sourcePDF: String
    let sourcePageNumber: Int
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (r, g, b, a) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF, 255)
        default:
            (r, g, b, a) = (0, 0, 0, 255)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

extension View {
    @ViewBuilder func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}

struct ContentView: View {
    @StateObject private var speechRecognizer = SpeechRecognizer()
    @State private var selectedPDF: URL?
    @State private var showingFilePicker = false
    @State private var isRecording = false
    @State private var currentPage = 0
    @State private var previousPage = 0
    @State private var totalPages = 0
    @State private var transcriptions: [TranscriptionEntry] = []
    @State private var showingSavedTranscriptions = false
    @State private var currentTranscription = ""
    @State private var showingPageJump = false
    @State private var pageJumpText = ""
    @State private var currentPDFDates: [Int: Date] = [:]
    @State private var bookmarkHierarchy: [BookmarkItem] = []
    @FocusState private var isTextEditorFocused: Bool
    @Environment(\.scenePhase) private var scenePhase
    
    // Category system
    @State private var categories: [Category] = [
        Category(color: "e3cbfe", name: "Dreams"),      // Lilac
        Category(color: "fee5e4", name: "Speeches"),    // Pink
        Category(color: "d6e9cb", name: "Meta"),        // Light green
        Category(color: "ffea61", name: "IRL")          // Yellow
    ]
    @State private var pageCategories: [PageCategory] = []
    @State private var categoryPDFMetadata: [CategoryPageMetadata] = []
    @State private var showingCategoryFilter = false
    @State private var selectedFilterCategory: Category?
    @State private var showingBookmarks = false
    @State private var showingSettings = false
    @State private var isReadMode = false
    @State private var showReadModeUI = true

    let pastelPink = Color(red: 1.0, green: 0.7, blue: 0.8)
    
    var displayedText: String {
        if isRecording {
            return currentTranscription + (currentTranscription.isEmpty ? "" : " ") + speechRecognizer.transcript
        } else {
            return currentTranscription
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Top bar - hide in read mode when UI is hidden
            if !isReadMode || showReadModeUI {
                HStack {
                    // Settings button
                    Button(action: {
                        showingSettings = true
                    }) {
                        Image(systemName: "gearshape.fill")
                            .foregroundColor(.gray)
                    }

                    // Read mode toggle
                    Button(action: {
                        isReadMode.toggle()
                        showReadModeUI = true  // Show UI when toggling modes
                    }) {
                        Image(systemName: isReadMode ? "book.fill" : "square.and.pencil")
                            .foregroundColor(.gray)
                    }

                    if selectedPDF != nil {
                        Button(action: {
                            showingPageJump = true
                        }) {
                            Text("\(currentPage + 1)/\(totalPages)")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                    }

                    Spacer()

                    // Category squares
                    if selectedPDF != nil {
                        HStack(spacing: 6) {
                            ForEach(categories) { category in
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(category.swiftUIColor)
                                    .frame(width: 30, height: 30)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 4)
                                            .stroke(Color.gray, lineWidth: isCategorySelected(category.id) ? 3 : 0)
                                    )
                                    .onTapGesture {
                                        toggleCategory(category.id)
                                    }
                                    .onLongPressGesture {
                                        selectedFilterCategory = category
                                        showingCategoryFilter = true
                                    }
                            }
                        }
                    }
                }
                .padding()
                .background(Color.white)
            }
            
            // PDF viewer
            if let pdfURL = selectedPDF {
                PDFPageViewer(
                    url: pdfURL,
                    currentPage: $currentPage,
                    totalPages: $totalPages,
                    isReadMode: isReadMode,
                    showReadModeUI: $showReadModeUI
                )
                .if(!isReadMode) { view in
                    view.border(Color.gray.opacity(0.3), width: 1)
                }
                .onChange(of: currentPage) { oldPage, newPage in
                    // Save to the PREVIOUS page before switching
                    saveToPreviousPage()
                    
                    // Update previous page tracker
                    previousPage = newPage
                    
                    // Load new page content
                    loadTranscriptionForCurrentPage()
                    saveLastPage()
                }
            } else {
                Spacer()
                Button("Import PDF") {
                    showingFilePicker = true
                }
                .font(.title2)
                .foregroundColor(pastelPink)
                .padding()
                Spacer()
            }
            
            // Only show divider if not in read mode
            if !isReadMode {
                Divider()
            }
            
            // Transcription area - only show if not in read mode
            if !isReadMode {
                VStack(spacing: 12) {
                    HStack {
                        if isTextEditorFocused {
                        Button("Done") {
                            autoSaveTranscription()
                            isTextEditorFocused = false
                        }
                        .foregroundColor(pastelPink)
                        .font(.subheadline)
                    }
                    
                    Spacer()
                    
                    Button(isRecording ? "Stop" : "Record") {
                        if isRecording {
                            // Stop recording and append the transcript
                            speechRecognizer.stopTranscribing()
                            if !speechRecognizer.transcript.isEmpty {
                                currentTranscription += (currentTranscription.isEmpty ? "" : " ") + speechRecognizer.transcript
                                speechRecognizer.transcript = ""
                            }
                            autoSaveTranscription()
                        } else {
                            speechRecognizer.startTranscribing()
                        }
                        isRecording.toggle()
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(pastelPink)
                    .foregroundColor(.white)
                    .cornerRadius(8)
                }
                .padding(.horizontal)
                
                ZStack {
                    Color.white
                    if isRecording {
                        // Show combined text with auto-scroll
                        ScrollViewReader { proxy in
                            ScrollView {
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(displayedText)
                                        .foregroundColor(.black)
                                        .frame(maxWidth: .infinity, alignment: .topLeading)
                                        .padding(8)
                                    
                                    // Invisible anchor at bottom
                                    Color.clear
                                        .frame(height: 1)
                                        .id("bottom")
                                }
                            }
                            .onChange(of: speechRecognizer.transcript) {
                                withAnimation {
                                    proxy.scrollTo("bottom", anchor: .bottom)
                                }
                            }
                        }
                    } else {
                        // Allow editing when not recording
                        TextEditor(text: $currentTranscription)
                            .foregroundColor(.black)
                            .scrollContentBackground(.hidden)
                            .padding(8)
                            .focused($isTextEditorFocused)
                    }
                }
                .cornerRadius(8)
                .padding(.horizontal)
            }
            .padding(.top)
            .frame(height: 200)
            .background(Color.white)
            }  // End of read mode check
        }
        .background(Color.white)
        .fileImporter(
            isPresented: $showingFilePicker,
            allowedContentTypes: [.pdf]
        ) { result in
            if case .success(let url) = result {
                openPDF(url, saveBookmark: true)
            }
        }
        .sheet(isPresented: $showingSavedTranscriptions) {
            SavedTranscriptionsView(transcriptions: transcriptions)
        }
        .fullScreenCover(isPresented: $showingCategoryFilter) {
            if let category = selectedFilterCategory, let pdfURL = selectedPDF {
                CategoryFilterView(
                    category: category,
                    pdfURL: pdfURL,
                    pdfName: pdfURL.lastPathComponent,
                    pageCategories: pageCategories,
                    transcriptions: transcriptions
                )
            }
        }
        .sheet(isPresented: $showingBookmarks) {
            BookmarkNavigatorView(
                bookmarks: bookmarkHierarchy,
                currentPage: $currentPage,
                isPresented: $showingBookmarks
            )
        }
        .fullScreenCover(isPresented: $showingSettings) {
            SettingsView(
                isPresented: $showingSettings,
                selectedPDF: $selectedPDF,
                showingBookmarks: $showingBookmarks,
                bookmarkHierarchy: bookmarkHierarchy,
                currentPage: currentPage,
                onReload: {
                    loadTranscriptions()
                    loadTranscriptionForCurrentPage()
                },
                onPageSelected: { pageIndex in
                    currentPage = pageIndex
                }
            )
        }
        .alert("Jump to Page", isPresented: $showingPageJump) {
            TextField("Page number", text: $pageJumpText)
                .keyboardType(.numberPad)
            Button("Go") {
                if let pageNum = Int(pageJumpText), pageNum > 0, pageNum <= totalPages {
                    currentPage = pageNum - 1
                }
                pageJumpText = ""
            }
            Button("Cancel", role: .cancel) {
                pageJumpText = ""
            }
        } message: {
            Text("Enter a page number (1-\(totalPages))")
        }
        .onAppear {
            speechRecognizer.requestPermissions()
            loadTranscriptions()
            loadPageCategories()
            loadCategoryPDFMetadata()
            restoreLastPDF()
        }
        .onChange(of: scenePhase) { oldPhase, newPhase in
            if newPhase == .background || newPhase == .inactive {
                // Save when app goes to background or becomes inactive
                autoSaveTranscription()
            }
        }
    }
    
    /// Open a PDF, loading its pages/dates/bookmarks. When `saveBookmark` is
    /// true, persist a security-scoped bookmark so the same file reopens on the
    /// next launch (previously the app forgot the PDF and made you re-import it
    /// every time).
    private func openPDF(_ url: URL, saveBookmark: Bool) {
        guard url.startAccessingSecurityScopedResource() else { return }
        if saveBookmark,
           let data = try? url.bookmarkData(options: .minimalBookmark,
                                            includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(data, forKey: "lastPDFBookmark")
        }
        selectedPDF = url
        currentPage = 0
        previousPage = 0

        // Do ALL heavy work in background.
        DispatchQueue.global(qos: .userInitiated).async {
            guard let document = PDFDocument(url: url) else { return }
            let pageCount = document.pageCount
            let dates = self.extractBookmarkDates(from: document)
            let hierarchy = self.extractBookmarkHierarchy(from: document)
            DispatchQueue.main.async {
                self.totalPages = pageCount
                self.loadLastPage()
                self.currentPDFDates = dates
                self.bookmarkHierarchy = hierarchy
                self.loadTranscriptionForCurrentPage()
            }
        }
    }

    /// On launch, silently reopen the last PDF from its saved bookmark. Any
    /// failure just falls back to the Import button, so it can never block start-up.
    private func restoreLastPDF() {
        guard selectedPDF == nil,
              let data = UserDefaults.standard.data(forKey: "lastPDFBookmark") else { return }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [],
                                 relativeTo: nil, bookmarkDataIsStale: &stale) else { return }
        openPDF(url, saveBookmark: true)   // re-saving heals a stale bookmark
    }

    func loadTranscriptionForCurrentPage() {
        guard let pdfURL = selectedPDF else { return }

        let pdfName = pdfURL.lastPathComponent
        
        // Find transcription for current page
        if let entry = transcriptions.first(where: {
            $0.pdfName == pdfName && $0.pageNumber == currentPage + 1
        }) {
            currentTranscription = entry.transcription
        } else {
            currentTranscription = ""
        }
    }
    
    func saveLastPage() {
        guard let pdfURL = selectedPDF else { return }
        let pdfName = pdfURL.lastPathComponent
        UserDefaults.standard.set(currentPage, forKey: "lastPage_\(pdfName)")
    }
    
    func loadLastPage() {
        guard let pdfURL = selectedPDF else { return }
        let pdfName = pdfURL.lastPathComponent
        let lastPage = UserDefaults.standard.integer(forKey: "lastPage_\(pdfName)")
        if lastPage > 0 && lastPage < totalPages {
            currentPage = lastPage
            previousPage = lastPage
        }
    }
    
    func autoSaveTranscription() {
        guard let pdfURL = selectedPDF else { return }
        
        // Only save if there's text
        if currentTranscription.isEmpty { return }
        
        let pdfName = pdfURL.lastPathComponent
        
        // Remove existing entry for this page if it exists
        transcriptions.removeAll {
            $0.pdfName == pdfName && $0.pageNumber == currentPage + 1
        }
        
        // Get date from bookmarks or use current date
        let entryDate = currentPDFDates[currentPage + 1] ?? Date()
        
        // Add new entry with bookmark date
        let entry = TranscriptionEntry(
            id: UUID(),
            pdfName: pdfName,
            pageNumber: currentPage + 1,
            transcription: currentTranscription,
            date: entryDate
        )
        
        transcriptions.append(entry)
        saveTranscriptions()
    }
    
    func saveToPreviousPage() {
        guard let pdfURL = selectedPDF else { return }
        
        // Only save if there's text
        if currentTranscription.isEmpty { return }
        
        let pdfName = pdfURL.lastPathComponent
        
        // Remove existing entry for PREVIOUS page if it exists
        transcriptions.removeAll {
            $0.pdfName == pdfName && $0.pageNumber == previousPage + 1
        }
        
        // Get date from bookmarks or use current date
        let entryDate = currentPDFDates[previousPage + 1] ?? Date()
        
        // Add new entry for PREVIOUS page with bookmark date
        let entry = TranscriptionEntry(
            id: UUID(),
            pdfName: pdfName,
            pageNumber: previousPage + 1,
            transcription: currentTranscription,
            date: entryDate
        )
        
        transcriptions.append(entry)
        saveTranscriptions()
    }
    
    func saveTranscriptions() {
        if let encoded = try? JSONEncoder().encode(transcriptions) {
            UserDefaults.standard.set(encoded, forKey: "transcriptions")
        }
    }
    
    func loadTranscriptions() {
        if let data = UserDefaults.standard.data(forKey: "transcriptions"),
           let decoded = try? JSONDecoder().decode([TranscriptionEntry].self, from: data) {
            transcriptions = decoded
        }
    }
    
    // MARK: - Category Functions
    
    func toggleCategory(_ categoryId: UUID) {
        guard let pdfURL = selectedPDF else {
            return
        }
        let pdfName = pdfURL.lastPathComponent
        let pageNum = currentPage + 1
        
        var wasTagged = false
        var isNowTagged = false
        
        if let index = pageCategories.firstIndex(where: {
            $0.pdfName == pdfName && $0.pageNumber == pageNum
        }) {
            var categoryIds = pageCategories[index].categoryIds
            wasTagged = categoryIds.contains(categoryId)
            
            if let catIndex = categoryIds.firstIndex(of: categoryId) {
                categoryIds.remove(at: catIndex)
                isNowTagged = false
            } else {
                categoryIds.append(categoryId)
                isNowTagged = true
            }
            
            if categoryIds.isEmpty {
                pageCategories.remove(at: index)
            } else {
                pageCategories[index] = PageCategory(
                    pdfName: pdfName,
                    pageNumber: pageNum,
                    categoryIds: categoryIds
                )
            }
        } else {
            pageCategories.append(PageCategory(
                pdfName: pdfName,
                pageNumber: pageNum,
                categoryIds: [categoryId]
            ))
            isNowTagged = true
        }
        
        savePageCategories()

        // Keep the compiled category PDF in sync with the tag change.
        if !wasTagged && isNowTagged {
            addPageToCategoryPDF(categoryId: categoryId, pdfURL: pdfURL, pageNumber: pageNum)
        } else if wasTagged && !isNowTagged {
            removePageFromCategoryPDF(categoryId: categoryId, pdfURL: pdfURL, pageNumber: pageNum)
        }
    }

    /// Remove a page from a category's compiled PDF when it's un-tagged. Without
    /// this, un-tagging left the page in the category PDF forever (and re-tagging
    /// could duplicate it).
    func removePageFromCategoryPDF(categoryId: UUID, pdfURL: URL, pageNumber: Int) {
        guard let category = categories.first(where: { $0.id == categoryId }) else { return }
        let pdfName = pdfURL.lastPathComponent

        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let categoryPDFURL = documentsURL.appendingPathComponent("\(category.name).pdf")
        guard FileManager.default.fileExists(atPath: categoryPDFURL.path),
              let categoryPDF = PDFDocument(url: categoryPDFURL) else { return }

        // Find this page's slot in the category PDF via our metadata.
        guard let metaIndex = categoryPDFMetadata.firstIndex(where: {
            $0.categoryName == category.name &&
            $0.sourcePDF == pdfName &&
            $0.sourcePageNumber == pageNumber
        }) else { return }

        let removedIndex = categoryPDFMetadata[metaIndex].pageIndex
        if removedIndex < categoryPDF.pageCount {
            categoryPDF.removePage(at: removedIndex)
        }

        // Drop the metadata entry and shift everything after it down by one.
        categoryPDFMetadata.remove(at: metaIndex)
        for i in 0..<categoryPDFMetadata.count {
            if categoryPDFMetadata[i].categoryName == category.name && categoryPDFMetadata[i].pageIndex > removedIndex {
                let old = categoryPDFMetadata[i]
                categoryPDFMetadata[i] = CategoryPageMetadata(
                    categoryName: old.categoryName,
                    pageIndex: old.pageIndex - 1,
                    date: old.date,
                    sourcePDF: old.sourcePDF,
                    sourcePageNumber: old.sourcePageNumber
                )
            }
        }
        saveCategoryPDFMetadata()

        // If the category PDF is now empty, delete the file; otherwise rewrite it.
        if categoryPDF.pageCount == 0 {
            try? FileManager.default.removeItem(at: categoryPDFURL)
        } else {
            _ = categoryPDF.write(to: categoryPDFURL)
        }
    }

    func addPageToCategoryPDF(categoryId: UUID, pdfURL: URL, pageNumber: Int) {
        guard let category = categories.first(where: { $0.id == categoryId }) else {
            print("ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Category not found")
            return
        }
        
        guard let sourcePDF = PDFDocument(url: pdfURL) else {
            print("ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Could not load source PDF")
            return
        }
        
        guard let pageToExtract = sourcePDF.page(at: pageNumber - 1) else {
            print("ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Could not get page at index \(pageNumber - 1)")
            return
        }
        
        let categoryFileName = "\(category.name).pdf"
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let categoryPDFURL = documentsURL.appendingPathComponent(categoryFileName)
        
        // Get date for this page
        let pageDate = currentPDFDates[pageNumber] ?? Date.distantPast
        if currentPDFDates[pageNumber] == nil {
            print("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â No date found for page \(pageNumber)")
            print("   Available date pages: \(currentPDFDates.keys.sorted())")
        }
        
        // Load or create category PDF
        let categoryPDF: PDFDocument
        if FileManager.default.fileExists(atPath: categoryPDFURL.path) {
            categoryPDF = PDFDocument(url: categoryPDFURL) ?? PDFDocument()
        } else {
            categoryPDF = PDFDocument()
        }
        
        // Find insertion index (sorted by date) using our metadata
        var insertIndex = categoryPDF.pageCount
        
        let categoryMetadata = categoryPDFMetadata.filter { $0.categoryName == category.name }.sorted { $0.pageIndex < $1.pageIndex }
        
        for meta in categoryMetadata {
            if pageDate < meta.date {
                insertIndex = meta.pageIndex
                break
            }
        }
        
        // Insert page at sorted position
        categoryPDF.insert(pageToExtract, at: insertIndex)
        
        // Update metadata indices (shift everything after insertion point)
        for i in 0..<categoryPDFMetadata.count {
            if categoryPDFMetadata[i].categoryName == category.name && categoryPDFMetadata[i].pageIndex >= insertIndex {
                let old = categoryPDFMetadata[i]
                categoryPDFMetadata[i] = CategoryPageMetadata(
                    categoryName: old.categoryName,
                    pageIndex: old.pageIndex + 1,
                    date: old.date,
                    sourcePDF: old.sourcePDF,
                    sourcePageNumber: old.sourcePageNumber
                )
            }
        }
        
        // Add metadata for new page
        let newMetadata = CategoryPageMetadata(
            categoryName: category.name,
            pageIndex: insertIndex,
            date: pageDate,
            sourcePDF: pdfURL.lastPathComponent,
            sourcePageNumber: pageNumber
        )
        categoryPDFMetadata.append(newMetadata)
        saveCategoryPDFMetadata()
        
        // Save category PDF
        if categoryPDF.write(to: categoryPDFURL) {
            print("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Added page \(pageNumber) to \(categoryFileName) (date: \(pageDate))")
        } else {
            print("ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ FAILED to write \(categoryFileName)")
        }
    }
    
    func saveCategoryPDFMetadata() {
        if let encoded = try? JSONEncoder().encode(categoryPDFMetadata) {
            UserDefaults.standard.set(encoded, forKey: "categoryPDFMetadata")
        }
    }
    
    func loadCategoryPDFMetadata() {
        if let data = UserDefaults.standard.data(forKey: "categoryPDFMetadata"),
           let decoded = try? JSONDecoder().decode([CategoryPageMetadata].self, from: data) {
            categoryPDFMetadata = decoded
        }
    }
    
    func isCategorySelected(_ categoryId: UUID) -> Bool {
        guard let pdfURL = selectedPDF else { return false }
        let pdfName = pdfURL.lastPathComponent
        let pageNum = currentPage + 1
        
        return pageCategories.first(where: {
            $0.pdfName == pdfName && $0.pageNumber == pageNum
        })?.categoryIds.contains(categoryId) ?? false
    }
    
    func savePageCategories() {
        if let encoded = try? JSONEncoder().encode(pageCategories) {
            UserDefaults.standard.set(encoded, forKey: "pageCategories")
        }
    }
    
    func loadPageCategories() {
        if let data = UserDefaults.standard.data(forKey: "pageCategories"),
           let decoded = try? JSONDecoder().decode([PageCategory].self, from: data) {
            pageCategories = decoded
        }
    }
    
    // MARK: - Bookmark Date Extraction
    
    func extractBookmarkDates(from pdfDocument: PDFDocument) -> [Int: Date] {
        var pageDates: [Int: Date] = [:]
        
        print("ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€¦Ã‚Â¡ Extracting bookmark dates...")
        
        guard let outline = pdfDocument.outlineRoot else {
            print("ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ No bookmarks found in PDF")
            return pageDates
        }
        
        var dateBookmarks: [(page: Int, date: Date)] = []
        extractDateBookmarksRecursive(outline, pdfDocument, &dateBookmarks)
        
        print("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Found \(dateBookmarks.count) date bookmarks")
        
        dateBookmarks.sort { $0.page < $1.page }
        
        for i in 0..<dateBookmarks.count {
            let startPage = dateBookmarks[i].page
            let date = dateBookmarks[i].date
            let endPage = (i < dateBookmarks.count - 1) ? dateBookmarks[i + 1].page - 1 : pdfDocument.pageCount
            
            // Safety check: ensure valid range
            guard startPage <= endPage else {
                print("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Skipping invalid bookmark range: \(startPage)...\(endPage)")
                continue
            }
            
            print("  Bookmark: page \(startPage) = \(date)")
            
            for page in startPage...endPage {
                pageDates[page] = date
            }
        }
        
        print("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Assigned dates to \(pageDates.count) pages")
        
        return pageDates
    }
    
    private func extractDateBookmarksRecursive(_ outline: PDFOutline, _ pdfDocument: PDFDocument, _ results: inout [(page: Int, date: Date)]) {
        
        for i in 0..<outline.numberOfChildren {
            guard let child = outline.child(at: i) else { continue }
            
            if let title = child.label,
               let date = parseBookmarkDate(title),
               let destination = child.destination,
               let page = destination.page {
                
                let pageIndex = pdfDocument.index(for: page)
                results.append((page: pageIndex + 1, date: date))
            }
            
            if child.numberOfChildren > 0 {
                extractDateBookmarksRecursive(child, pdfDocument, &results)
            }
        }
    }
    
    private func parseBookmarkDate(_ title: String) -> Date? {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        
        if let dayDate = parseDayBookmark(trimmed) {
            return dayDate
        }
        
        if trimmed.contains("'") {
            return nil
        }
        
        return nil
    }
    
    private func parseDayBookmark(_ title: String) -> Date? {
        let cleaned = title.replacingOccurrences(of: "st|nd|rd|th", with: "", options: .regularExpression)
        
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        
        if let date = formatter.date(from: cleaned) {
            let calendar = Calendar.current
            var components = calendar.dateComponents([.month, .day], from: date)
            // Smart year: a bookmark whose month is LATER than the current month
            // is almost certainly from last year (matches the Notion importer's
            // logic). Previously this always stamped the current year, so pages
            // that crossed a year boundary sorted into the wrong place.
            let currentMonth = calendar.component(.month, from: Date())
            let currentYear = calendar.component(.year, from: Date())
            if let parsedMonth = components.month, parsedMonth > currentMonth {
                components.year = currentYear - 1
            } else {
                components.year = currentYear
            }

            return calendar.date(from: components)
        }

        return nil
    }
    
    func extractBookmarkHierarchy(from pdfDocument: PDFDocument) -> [BookmarkItem] {
        guard let outline = pdfDocument.outlineRoot else {
            return []
        }
        
        return extractBookmarkItemsRecursive(outline, pdfDocument)
    }
    
    private func extractBookmarkItemsRecursive(_ outline: PDFOutline, _ pdfDocument: PDFDocument) -> [BookmarkItem] {
        var items: [BookmarkItem] = []
        
        for i in 0..<outline.numberOfChildren {
            guard let child = outline.child(at: i),
                  let label = child.label else { continue }
            
            let page: Int?
            if let destination = child.destination,
               let destPage = destination.page {
                page = pdfDocument.index(for: destPage) + 1
            } else {
                page = nil
            }
            
            let date = parseBookmarkDate(label)
            let children = child.numberOfChildren > 0 ? extractBookmarkItemsRecursive(child, pdfDocument) : []
            
            let item = BookmarkItem(
                label: label,
                page: page,
                date: date,
                children: children
            )
            items.append(item)
        }
        
        return items
    }
}

struct PDFPageViewer: UIViewRepresentable {
    let url: URL
    @Binding var currentPage: Int
    @Binding var totalPages: Int
    let isReadMode: Bool
    @Binding var showReadModeUI: Bool

    func makeUIView(context: Context) -> UIView {
        // Create container view
        let containerView = UIView()
        containerView.backgroundColor = .white
        
        // Create PDF view
        let pdfView = PDFView()
        pdfView.document = PDFDocument(url: url)
        pdfView.autoScales = true
        pdfView.displayMode = .singlePage
        pdfView.displayDirection = .horizontal
        pdfView.backgroundColor = .white
        pdfView.maxScaleFactor = 4.0
        
        // Center the PDF content
        pdfView.displaysPageBreaks = false
        pdfView.displayBox = .cropBox
        
        // Set the scaling to maintain aspect ratio and center
        if let document = pdfView.document, document.pageCount > 0 {
            pdfView.scaleFactor = pdfView.scaleFactorForSizeToFit
        }
        
        // CRITICAL: Disable all user interaction on PDFView
        pdfView.isUserInteractionEnabled = false
        
        // Add PDF view to container
        containerView.addSubview(pdfView)
        pdfView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            pdfView.topAnchor.constraint(equalTo: containerView.topAnchor),
            pdfView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor),
            pdfView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
            pdfView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor)
        ])
        
        // Create transparent overlay that captures all touches
        let overlayView = UIView()
        overlayView.backgroundColor = .clear
        containerView.addSubview(overlayView)
        overlayView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            overlayView.topAnchor.constraint(equalTo: containerView.topAnchor),
            overlayView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor),
            overlayView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor)
        ])
        
        // Add tap gesture to overlay
        let tapGesture = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap))
        overlayView.addGestureRecognizer(tapGesture)
        
        // Add swipe gestures to overlay
        let swipeLeft = UISwipeGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleSwipeLeft))
        swipeLeft.direction = .left
        overlayView.addGestureRecognizer(swipeLeft)
        
        let swipeRight = UISwipeGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleSwipeRight))
        swipeRight.direction = .right
        overlayView.addGestureRecognizer(swipeRight)
        
        // Add pinch gesture to overlay, manually forward to PDFView
        let pinchGesture = UIPinchGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePinch))
        pinchGesture.delegate = context.coordinator
        overlayView.addGestureRecognizer(pinchGesture)
        
        // Add pan gesture for moving around when zoomed
        let panGesture = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePan))
        panGesture.delegate = context.coordinator
        overlayView.addGestureRecognizer(panGesture)
        
        context.coordinator.pdfView = pdfView
        context.coordinator.containerView = containerView
        context.coordinator.overlayView = overlayView
        context.coordinator.parent = self
        
        return containerView
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        guard let pdfView = context.coordinator.pdfView else { return }
        
        if let document = pdfView.document,
           currentPage < document.pageCount,
           let page = document.page(at: currentPage) {
            
            // Go to the new page
            pdfView.go(to: page)
            
            // Force proper scaling and centering
            DispatchQueue.main.async {
                // Reset to auto-scale which centers the content
                pdfView.autoScales = true

                // Fit the WHOLE page in both modes. (A previous build fit
                // record mode to width, which made portrait pages taller than
                // the viewport with the bottom cropped off and unreachable —
                // minScaleFactor was pinned to the width-fit so you couldn't
                // zoom out or scroll to it. Fitting the whole page avoids that;
                // pinch-to-zoom still lets you get closer when you want.)
                let fitScale = pdfView.scaleFactorForSizeToFit

                // Apply the scale
                pdfView.scaleFactor = fitScale
                pdfView.minScaleFactor = fitScale
                
                // Center the page in the view
                if let currentPage = pdfView.currentPage {
                    let pageBounds = currentPage.bounds(for: pdfView.displayBox)
                    let viewBounds = pdfView.bounds
                    
                    // Calculate centering offset if needed
                    let scaledWidth = pageBounds.width * pdfView.scaleFactor
                    let scaledHeight = pageBounds.height * pdfView.scaleFactor
                    
                    if scaledWidth < viewBounds.width || scaledHeight < viewBounds.height {
                        // The page is smaller than the view, ensure it's centered
                        pdfView.go(to: currentPage)
                    }
                }
                
                // Force a layout update
                pdfView.setNeedsLayout()
                pdfView.layoutIfNeeded()
            }
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: PDFPageViewer
        weak var pdfView: PDFView?
        weak var containerView: UIView?
        weak var overlayView: UIView?
        
        init(_ parent: PDFPageViewer) {
            self.parent = parent
        }
        
        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let overlayView = overlayView else { return }
            let location = gesture.location(in: overlayView)
            let leftZone = location.x < overlayView.bounds.width / 3
            let rightZone = location.x > overlayView.bounds.width * 2 / 3

            // Read mode is e-reader style: tap the left/right thirds to page,
            // tap the center third to show/hide the toolbar. (A previous build
            // made ANY tap toggle the UI, which removed tap-to-turn entirely.)
            if parent.isReadMode {
                if leftZone {
                    if parent.currentPage > 0 {
                        DispatchQueue.main.async { self.parent.currentPage -= 1 }
                    }
                } else if rightZone {
                    if parent.currentPage < parent.totalPages - 1 {
                        DispatchQueue.main.async { self.parent.currentPage += 1 }
                    }
                } else {
                    DispatchQueue.main.async { self.parent.showReadModeUI.toggle() }
                }
                return
            }

            // Normal mode: left third = previous page, right third = next page.
            if leftZone {
                if parent.currentPage > 0 {
                    DispatchQueue.main.async { self.parent.currentPage -= 1 }
                }
            } else if rightZone {
                if parent.currentPage < parent.totalPages - 1 {
                    DispatchQueue.main.async { self.parent.currentPage += 1 }
                }
            }
        }
        
        @objc func handleSwipeLeft(_ gesture: UISwipeGestureRecognizer) {
            guard let pdfView = pdfView else { return }

            // Only allow page changes when not zoomed in
            if pdfView.scaleFactor <= pdfView.minScaleFactor {
                // Swipe left = next page
                if parent.currentPage < parent.totalPages - 1 {
                    DispatchQueue.main.async {
                        self.parent.currentPage += 1
                    }
                }
            }
        }

        @objc func handleSwipeRight(_ gesture: UISwipeGestureRecognizer) {
            guard let pdfView = pdfView else { return }

            // Only allow page changes when not zoomed in
            if pdfView.scaleFactor <= pdfView.minScaleFactor {
                // Swipe right = previous page
                if parent.currentPage > 0 {
                    DispatchQueue.main.async {
                        self.parent.currentPage -= 1
                    }
                }
            }
        }
        
        @objc func handlePinch(_ gesture: UIPinchGestureRecognizer) {
            guard let pdfView = pdfView else { return }
            
            // Manually enable interaction temporarily to allow zoom
            pdfView.isUserInteractionEnabled = true
            
            if gesture.state == .began || gesture.state == .changed {
                let currentScale = pdfView.scaleFactor
                let newScale = currentScale * gesture.scale
                
                // Clamp scale between min and max
                let minScale = pdfView.minScaleFactor
                let maxScale = pdfView.maxScaleFactor
                pdfView.scaleFactor = min(max(newScale, minScale), maxScale)
                
                gesture.scale = 1.0
            }
            
            if gesture.state == .ended || gesture.state == .cancelled {
                // Disable interaction again
                pdfView.isUserInteractionEnabled = false
                
                // If we're back at minimum scale, ensure the page is centered
                if pdfView.scaleFactor <= pdfView.minScaleFactor {
                    DispatchQueue.main.async {
                        pdfView.scaleFactor = pdfView.scaleFactorForSizeToFit
                        if let currentPage = pdfView.currentPage {
                            pdfView.go(to: currentPage)
                        }
                    }
                }
            }
        }
        
        @objc func handlePan(_ gesture: UIPanGestureRecognizer) {
            guard let pdfView = pdfView else { return }
            
            // Only allow panning when zoomed in
            if pdfView.scaleFactor > pdfView.minScaleFactor {
                let translation = gesture.translation(in: pdfView)
                
                // Get current scroll position and adjust it
                var newOffset = pdfView.documentView?.frame.origin ?? .zero
                newOffset.x -= translation.x
                newOffset.y -= translation.y
                
                // Scroll by adjusting the content offset directly
                if let scrollView = pdfView.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView {
                    var currentOffset = scrollView.contentOffset
                    currentOffset.x -= translation.x
                    currentOffset.y -= translation.y
                    scrollView.contentOffset = currentOffset
                }
                
                gesture.setTranslation(.zero, in: pdfView)
            }
        }
        
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            return true
        }
    }
}

struct SavedTranscriptionsView: View {
    let transcriptions: [TranscriptionEntry]
    @Environment(\.dismiss) var dismiss
    
    let pastelPink = Color(red: 1.0, green: 0.7, blue: 0.8)
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.white.ignoresSafeArea()
                
                List {
                    ForEach(transcriptions.sorted(by: { $0.date > $1.date })) { entry in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(entry.pdfName) - Page \(entry.pageNumber)")
                                .font(.headline)
                                .foregroundColor(.black)
                            Text(entry.transcription)
                                .font(.body)
                                .foregroundColor(.black)
                                .lineLimit(3)
                            Text(entry.date, style: .date)
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Color.white)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("All Transcriptions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(pastelPink)
                }
            }
        }
    }
}

struct CategoryFilterView: View {
    let category: Category
    let pdfURL: URL
    let pdfName: String
    let pageCategories: [PageCategory]
    let transcriptions: [TranscriptionEntry]
    @Environment(\.dismiss) var dismiss
    
    @State private var currentFilteredIndex = 0
    @State private var currentTranscription = ""
    @State private var isRecording = false
    @FocusState private var isTextEditorFocused: Bool
    @StateObject private var speechRecognizer = SpeechRecognizer()
    
    let pastelPink = Color(red: 1.0, green: 0.7, blue: 0.8)
    
    var filteredPageNumbers: [Int] {
        pageCategories
            .filter { $0.pdfName == pdfName && $0.categoryIds.contains(category.id) }
            .map { $0.pageNumber }
            .sorted()
    }
    
    var currentPageNumber: Int {
        guard !filteredPageNumbers.isEmpty, currentFilteredIndex < filteredPageNumbers.count else { return 0 }
        return filteredPageNumbers[currentFilteredIndex]
    }
    
    var displayedText: String {
        if isRecording {
            return currentTranscription + (currentTranscription.isEmpty ? "" : " ") + speechRecognizer.transcript
        } else {
            return currentTranscription
        }
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Top bar
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "house.fill")
                            .foregroundColor(.white)
                            .font(.system(size: 18))
                    }
                    
                    Spacer()
                    
                    // Category name
                    Text(category.name)
                        .font(.headline)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    // Page counter
                    if !filteredPageNumbers.isEmpty {
                        Text("\(currentFilteredIndex + 1)/\(filteredPageNumbers.count)")
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                }
                .padding()
                .background(category.swiftUIColor)
                
                // PDF viewer with filtered pages
                if !filteredPageNumbers.isEmpty {
                    FilteredPDFViewer(
                        url: pdfURL,
                        pageNumbers: filteredPageNumbers,
                        currentIndex: $currentFilteredIndex
                    )
                    .border(Color.gray.opacity(0.3), width: 1)
                    .onAppear {
                        loadTranscriptionForCurrentPage()
                    }
                    .onChange(of: currentFilteredIndex) {
                        loadTranscriptionForCurrentPage()
                    }
                } else {
                    Spacer()
                    Text("No pages tagged with this category")
                        .foregroundColor(.gray)
                    Spacer()
                }
                
                Divider()
                
                // Transcription area
                VStack(spacing: 12) {
                    HStack {
                        if isTextEditorFocused {
                            Button("Done") {
                                isTextEditorFocused = false
                            }
                            .foregroundColor(pastelPink)
                            .font(.subheadline)
                        }
                        
                        Spacer()
                        
                        Button(isRecording ? "Stop" : "Record") {
                            if isRecording {
                                speechRecognizer.stopTranscribing()
                                if !speechRecognizer.transcript.isEmpty {
                                    currentTranscription += (currentTranscription.isEmpty ? "" : " ") + speechRecognizer.transcript
                                    speechRecognizer.transcript = ""
                                }
                            } else {
                                speechRecognizer.startTranscribing()
                            }
                            isRecording.toggle()
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(pastelPink)
                        .foregroundColor(.white)
                        .cornerRadius(8)
                    }
                    .padding(.horizontal)
                    
                    ZStack {
                        Color.white
                        if isRecording {
                            ScrollViewReader { proxy in
                                ScrollView {
                                    VStack(alignment: .leading, spacing: 0) {
                                        Text(displayedText)
                                            .foregroundColor(.black)
                                            .frame(maxWidth: .infinity, alignment: .topLeading)
                                            .padding(8)
                                        
                                        Color.clear
                                            .frame(height: 1)
                                            .id("bottom")
                                    }
                                }
                                .onChange(of: speechRecognizer.transcript) {
                                    withAnimation {
                                        proxy.scrollTo("bottom", anchor: .bottom)
                                    }
                                }
                            }
                        } else {
                            TextEditor(text: $currentTranscription)
                                .foregroundColor(.black)
                                .scrollContentBackground(.hidden)
                                .padding(8)
                                .focused($isTextEditorFocused)
                        }
                    }
                    .cornerRadius(8)
                    .padding(.horizontal)
                }
                .frame(height: 200)
                .background(Color.white)
            }
            .navigationBarHidden(true)
        }
    }
    
    func loadTranscriptionForCurrentPage() {
        if let entry = transcriptions.first(where: {
            $0.pdfName == pdfName && $0.pageNumber == currentPageNumber
        }) {
            currentTranscription = entry.transcription
        } else {
            currentTranscription = ""
        }
    }
}

struct FilteredPDFViewer: UIViewRepresentable {
    let url: URL
    let pageNumbers: [Int]
    @Binding var currentIndex: Int
    
    func makeUIView(context: Context) -> UIView {
        let containerView = UIView()
        containerView.backgroundColor = .white
        
        let pdfView = PDFView()
        pdfView.document = PDFDocument(url: url)
        pdfView.autoScales = true
        pdfView.displayMode = .singlePage
        pdfView.displayDirection = .horizontal
        pdfView.backgroundColor = .white
        pdfView.maxScaleFactor = 4.0
        pdfView.isUserInteractionEnabled = false
        
        containerView.addSubview(pdfView)
        pdfView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            pdfView.topAnchor.constraint(equalTo: containerView.topAnchor),
            pdfView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor),
            pdfView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
            pdfView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor)
        ])
        
        let overlayView = UIView()
        overlayView.backgroundColor = .clear
        containerView.addSubview(overlayView)
        overlayView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            overlayView.topAnchor.constraint(equalTo: containerView.topAnchor),
            overlayView.bottomAnchor.constraint(equalTo: containerView.bottomAnchor),
            overlayView.leadingAnchor.constraint(equalTo: containerView.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: containerView.trailingAnchor)
        ])
        
        let tapGesture = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap))
        overlayView.addGestureRecognizer(tapGesture)
        
        let swipeLeft = UISwipeGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleSwipeLeft))
        swipeLeft.direction = .left
        overlayView.addGestureRecognizer(swipeLeft)
        
        let swipeRight = UISwipeGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleSwipeRight))
        swipeRight.direction = .right
        overlayView.addGestureRecognizer(swipeRight)
        
        context.coordinator.pdfView = pdfView
        context.coordinator.parent = self
        
        return containerView
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        guard let pdfView = context.coordinator.pdfView,
              let document = pdfView.document,
              currentIndex < pageNumbers.count else { return }
        
        let pageNumber = pageNumbers[currentIndex]
        if pageNumber > 0 && pageNumber <= document.pageCount,
           let page = document.page(at: pageNumber - 1) {
            pdfView.go(to: page)
            
            DispatchQueue.main.async {
                pdfView.autoScales = true
                let fitScale = pdfView.scaleFactorForSizeToFit
                pdfView.scaleFactor = fitScale
                pdfView.minScaleFactor = fitScale
            }
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject {
        var parent: FilteredPDFViewer
        weak var pdfView: PDFView?
        
        init(_ parent: FilteredPDFViewer) {
            self.parent = parent
        }
        
        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let view = gesture.view else { return }
            let location = gesture.location(in: view)
            
            if location.x < view.bounds.width / 3 {
                if parent.currentIndex > 0 {
                    DispatchQueue.main.async {
                        self.parent.currentIndex -= 1
                    }
                }
            } else if location.x > view.bounds.width * 2 / 3 {
                if parent.currentIndex < parent.pageNumbers.count - 1 {
                    DispatchQueue.main.async {
                        self.parent.currentIndex += 1
                    }
                }
            }
        }
        
        @objc func handleSwipeLeft(_ gesture: UISwipeGestureRecognizer) {
            if parent.currentIndex < parent.pageNumbers.count - 1 {
                DispatchQueue.main.async {
                    self.parent.currentIndex += 1
                }
            }
        }
        
        @objc func handleSwipeRight(_ gesture: UISwipeGestureRecognizer) {
            if parent.currentIndex > 0 {
                DispatchQueue.main.async {
                    self.parent.currentIndex -= 1
                }
            }
        }
    }
}

class SpeechRecognizer: ObservableObject {
    @Published var transcript = ""
    
    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    
    func requestPermissions() {
        SFSpeechRecognizer.requestAuthorization { _ in }
        AVAudioApplication.requestRecordPermission { _ in }
    }
    
    func startTranscribing() {
        transcript = ""
        
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(.record, mode: .measurement)
        try? audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        
        audioEngine = AVAudioEngine()
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        
        guard let audioEngine = audioEngine,
              let recognitionRequest = recognitionRequest else { return }
        
        recognitionRequest.shouldReportPartialResults = true
        
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            if let result = result {
                self?.transcript = result.bestTranscription.formattedString
            }
        }
        
        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            recognitionRequest.append(buffer)
        }
        
        audioEngine.prepare()
        try? audioEngine.start()
    }
    
    func stopTranscribing() {
        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        // Release the audio session so we stop ducking / interrupting other
        // audio (music, podcasts) once recording ends.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

struct BookmarkNavigatorView: View {
    let bookmarks: [BookmarkItem]
    @Binding var currentPage: Int
    @Binding var isPresented: Bool
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if bookmarks.isEmpty {
                        Text("No bookmarks found")
                            .foregroundColor(.gray)
                            .padding()
                    } else {
                        ForEach(bookmarks.indices, id: \.self) { index in
                            BookmarkRow(
                                bookmark: bookmarks[index],
                                currentPage: $currentPage,
                                isPresented: $isPresented
                            )
                            .padding(.horizontal, 16)
                            
                            if index < bookmarks.count - 1 {
                                Divider()
                                    .padding(.horizontal, 16)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Bookmarks")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        isPresented = false
                    }
                }
            }
        }
    }
}

struct BookmarkRow: View {
    let bookmark: BookmarkItem
    @Binding var currentPage: Int
    @Binding var isPresented: Bool
    @State private var isExpanded = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header row
            Button(action: {
                if !bookmark.children.isEmpty {
                    isExpanded.toggle()
                } else if let page = bookmark.page {
                    currentPage = page - 1
                    isPresented = false
                }
            }) {
                HStack(spacing: 8) {
                    Text(bookmark.label)
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    if !bookmark.children.isEmpty {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .foregroundColor(.gray)
                            .frame(width: 20)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PlainButtonStyle())
            
            // Calendar grid for children
            if isExpanded && !bookmark.children.isEmpty {
                let allDaysInMonth = generateAllDaysForMonth(bookmarks: bookmark.children)
                
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                    ForEach(allDaysInMonth, id: \.day) { dayData in
                        CalendarDayView(
                            day: dayData.day,
                            bookmark: dayData.bookmark,
                            currentPage: $currentPage,
                            isPresented: $isPresented
                        )
                    }
                }
                .padding(.leading, 20)
            }
        }
        .padding(.vertical, 16)
    }
    
    func generateAllDaysForMonth(bookmarks: [BookmarkItem]) -> [(day: Int, bookmark: BookmarkItem?)] {
        // Find min and max days
        var days: Set<Int> = []
        for bookmark in bookmarks {
            if let dayNum = extractDayNumber(from: bookmark.label) {
                days.insert(dayNum)
            }
        }
        
        guard let minDay = days.min(), let maxDay = days.max() else {
            return []
        }
        
        // Create lookup
        var bookmarkByDay: [Int: BookmarkItem] = [:]
        for bookmark in bookmarks {
            if let dayNum = extractDayNumber(from: bookmark.label) {
                bookmarkByDay[dayNum] = bookmark
            }
        }
        
        // Generate all days
        return (minDay...maxDay).map { day in
            (day: day, bookmark: bookmarkByDay[day])
        }
    }
    
    func extractDayNumber(from label: String) -> Int? {
        let components = label.components(separatedBy: " ")
        for component in components {
            let digits = component.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)
            if let num = Int(digits), num > 0 && num <= 31 {
                return num
            }
        }
        return nil
    }
}

struct CalendarDayView: View {
    let day: Int
    let bookmark: BookmarkItem?
    @Binding var currentPage: Int
    @Binding var isPresented: Bool
    
    var hasPage: Bool {
        bookmark?.page != nil
    }
    
    var body: some View {
        Button(action: {
            if let bookmark = bookmark, let page = bookmark.page {
                currentPage = page - 1
                isPresented = false
            }
        }) {
            ZStack {
                if hasPage {
                    Circle()
                        .fill(Color.black)
                        .frame(width: 32, height: 32)
                    
                    Text("\(day)")
                        .foregroundColor(.white)
                        .font(.system(size: 14, weight: .medium))
                } else {
                    Text("\(day)")
                        .foregroundColor(.black)
                        .font(.system(size: 14))
                }
            }
            .frame(width: 40, height: 40)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(!hasPage)
    }
}

struct SettingsView: View {
    @Binding var isPresented: Bool
    @Binding var selectedPDF: URL?
    @Binding var showingBookmarks: Bool
    let bookmarkHierarchy: [BookmarkItem]
    let currentPage: Int
    let onReload: () -> Void
    let onPageSelected: (Int) -> Void
    @State private var showingNotionImporter = false
    @State private var showingJournalUpload = false

    var body: some View {
        NavigationView {
            List {
                Section {
                    Button(action: {
                        showingJournalUpload = true
                    }) {
                        HStack {
                            Image(systemName: "arrow.up.doc.on.clipboard")
                                .foregroundColor(.pink)
                            Text("Send journals to Claude")
                                .foregroundColor(.primary)
                        }
                    }
                }
                Section {
                    Button(action: {
                        isPresented = false  // Close settings first
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                            showingBookmarks = true
                        }
                    }) {
                        HStack {
                            Image(systemName: "bookmark.fill")
                                .foregroundColor(.blue)
                            Text("Bookmarks")
                                .foregroundColor(.primary)
                        }
                    }
                    .disabled(selectedPDF == nil)
                    
                    Button(action: {
                        showingNotionImporter = true
                    }) {
                        HStack {
                            Image(systemName: "square.and.arrow.down")
                                .foregroundColor(.blue)
                            Text("Import from Notion")
                                .foregroundColor(.primary)
                        }
                    }
                    .disabled(selectedPDF == nil)
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        isPresented = false
                    }
                    .foregroundColor(.primary)
                }
            }
            .fullScreenCover(isPresented: $showingNotionImporter, onDismiss: {
                onReload()
            }) {
                if let pdfURL = selectedPDF {
                    NotionImporterView(pdfURL: pdfURL, isPresented: $showingNotionImporter)
                }
            }
            .sheet(isPresented: $showingJournalUpload) {
                JournalUploadView()
            }
        }
    }
}

struct NotionEntry: Identifiable {
    let id = UUID()
    let text: String
    let date: Date?
    let dateString: String
}

struct MatchedEntry: Identifiable {
    let id = UUID()
    var notionEntry: NotionEntry
    var pdfPage: Int?
    var isManuallySet: Bool = false
}

struct NotionImporterView: View {
    let pdfURL: URL
    @Binding var isPresented: Bool
    @State private var showingFilePicker = false
    @State private var notionEntries: [NotionEntry] = []
    @State private var pdfPageDates: [Int: Date] = [:]
    @State private var matchedEntries: [MatchedEntry] = []
    @State private var showingVerification = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Import Notion Transcriptions")
                    .font(.title2)
                    .padding()
                
                Text("Select .md files exported from Notion to match with your PDF pages")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.gray)
                    .padding(.horizontal)
                
                Button("Choose Notion Files") {
                    showingFilePicker = true
                }
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
                
                Spacer()
            }
            .navigationTitle("Import from Notion")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
            }
            .fileImporter(
                isPresented: $showingFilePicker,
                allowedContentTypes: [.plainText],
                allowsMultipleSelection: true
            ) { result in
                switch result {
                case .success(let urls):
                    // Load PDF bookmark dates first
                    if let document = PDFDocument(url: pdfURL) {
                        pdfPageDates = extractBookmarkDatesForImporter(from: document)
                    }
                    
                    // Parse all markdown files
                    var allEntries: [NotionEntry] = []
                    for url in urls {
                        if url.startAccessingSecurityScopedResource() {
                            if let entries = parseNotionMarkdown(url: url) {
                                allEntries.append(contentsOf: entries)
                            }
                            url.stopAccessingSecurityScopedResource()
                        }
                    }
                    
                    print("ðŸ“ Parsed \(allEntries.count) Notion entries")
                    print("ðŸ“… PDF has dates for \(pdfPageDates.count) pages")
                    
                    // Debug: print first few entries and dates
                    if let firstEntry = allEntries.first {
                        print("First entry date: \(firstEntry.date?.description ?? "nil") (\(firstEntry.dateString))")
                    }
                    if let firstPDFDate = pdfPageDates.first {
                        print("First PDF date: Page \(firstPDFDate.key) = \(firstPDFDate.value)")
                    }
                    
                    // Sort entries by date
                    notionEntries = allEntries.sorted { e1, e2 in
                        guard let d1 = e1.date, let d2 = e2.date else { return false }
                        return d1 < d2
                    }
                    
                    // Match entries to PDF pages
                    matchedEntries = matchEntriesToPages(notionEntries: notionEntries, pdfPageDates: pdfPageDates)
                    
                    // Show verification screen
                    showingVerification = true
                    
                case .failure(let error):
                    print("Error selecting files: \(error)")
                }
            }
            .fullScreenCover(isPresented: $showingVerification) {
                VerificationView(
                    matchedEntries: $matchedEntries,
                    pdfURL: pdfURL,
                    pdfPageDates: pdfPageDates,
                    isPresented: $showingVerification,
                    onImport: { finalMatches in
                        importTranscriptions(finalMatches)
                        isPresented = false
                    }
                )
            }
        }
    }
    
    func parseNotionMarkdown(url: URL) -> [NotionEntry]? {
        guard let content = try? String(contentsOf: url, encoding: .utf8) else {
            return nil
        }
        
        var entries: [NotionEntry] = []
        var currentDate: Date?
        var currentDateString = ""
        
        // Split by --- dividers first
        let sections = content.components(separatedBy: "\n---\n")
        
        for section in sections {
            let lines = section.components(separatedBy: "\n")
            var entryText = ""
            var isLaterSection = false
            
            for line in lines {
                // Check for date headers (handle #, ##, ###)
                if line.hasPrefix("#") {
                    var dateStr = line
                    // Remove all leading # characters and spaces
                    while dateStr.hasPrefix("#") {
                        dateStr.removeFirst()
                    }
                    dateStr = dateStr.trimmingCharacters(in: .whitespaces)
                    
                    let lowerDateStr = dateStr.lowercased()
                    if lowerDateStr == "later" || lowerDateStr == "earlier" {
                        // This is a "Later" section - mark it and continue as text
                        isLaterSection = true
                        entryText += "\n" + dateStr + "\n"
                    } else if let parsedDate = parseDateString(dateStr) {
                        // Only update if date is valid
                        currentDateString = dateStr
                        currentDate = parsedDate
                    }
                    // If date can't be parsed, skip this header entirely
                } else if !line.isEmpty {
                    entryText += line + "\n"
                }
            }
            
            let trimmedText = entryText.trimmingCharacters(in: .whitespacesAndNewlines)
            
            // If this is a "Later" section, create a new entry using the previous entry's date
            if isLaterSection && !trimmedText.isEmpty {
                if let lastEntry = entries.last {
                    // Use previous entry's date for "Later" sections
                    entries.append(NotionEntry(
                        text: trimmedText,
                        date: lastEntry.date,
                        dateString: lastEntry.dateString
                    ))
                }
                // If no previous entry exists, skip this "Later" section
            } else if !trimmedText.isEmpty && currentDate != nil && !currentDateString.isEmpty {
                // Only create entry if we have valid date
                entries.append(NotionEntry(
                    text: trimmedText,
                    date: currentDate,
                    dateString: currentDateString
                ))
            }
            // Skip entries without valid dates
        }
        
        return entries
    }
    
    func parseDateString(_ str: String, parentLabel: String? = nil) -> Date? {
        // Validate: must contain a valid month name
        let validMonths = ["january", "february", "march", "april", "may", "june", 
                          "july", "august", "september", "october", "november", "december",
                          "jan", "feb", "mar", "apr", "may", "jun", 
                          "jul", "aug", "sep", "oct", "nov", "dec"]
        
        let lowerStr = str.lowercased()
        let hasValidMonth = validMonths.contains { lowerStr.contains($0) }
        
        if !hasValidMonth {
            return nil  // Reject strings without month names (like "Later")
        }
        
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        
        // Remove ordinal suffixes (1st, 2nd, 3rd, etc.)
        let cleaned = str.replacingOccurrences(of: "st|nd|rd|th", with: "", options: .regularExpression)
        
        // Try with year first (e.g., "April 4, 2024" or "april 11 2024")
        formatter.dateFormat = "MMMM d, yyyy"
        if let date = formatter.date(from: cleaned) {
            return date
        }
        
        // Try "Month Day Year" without comma (e.g., "April 4 2024" or "april 11 2024")
        formatter.dateFormat = "MMMM d yyyy"
        if let date = formatter.date(from: cleaned) {
            return date
        }
        
        // Try "Month Day" format without year (e.g., "March 1" or "april 4")
        formatter.dateFormat = "MMMM d"
        if let date = formatter.date(from: cleaned) {
            var components = Calendar.current.dateComponents([.month, .day], from: date)
            
            // Try to extract year from parent label first (e.g., "April '24" -> 2024)
            if let parent = parentLabel {
                print("ðŸ“ Parsing '\(str)' with parent '\(parent)'")
                if let yearFromParent = extractYearFromParentLabel(parent) {
                    print("  âœ… Extracted year \(yearFromParent) from parent")
                    components.year = yearFromParent
                    let finalDate = Calendar.current.date(from: components)
                    print("  ðŸ“… Final date: \(finalDate?.description ?? "nil")")
                    return finalDate
                } else {
                    print("  âš ï¸ Could not extract year from parent")
                }
            }
            
            // Fallback: Smart year logic based on month progression
            print("ðŸ”„ Using smart year logic for '\(str)'")
            let currentMonth = Calendar.current.component(.month, from: Date())
            if let parsedMonth = components.month {
                if parsedMonth > currentMonth {
                    components.year = Calendar.current.component(.year, from: Date()) - 1
                    print("  â†’ Month \(parsedMonth) > current \(currentMonth), using previous year: \(components.year!)")
                } else {
                    components.year = Calendar.current.component(.year, from: Date())
                    print("  â†’ Month \(parsedMonth) â‰¤ current \(currentMonth), using current year: \(components.year!)")
                }
            } else {
                components.year = Calendar.current.component(.year, from: Date())
            }
            
            let finalDate = Calendar.current.date(from: components)
            print("  ðŸ“… Final date: \(finalDate?.description ?? "nil")")
            return finalDate
        }
        
        return nil
    }
    
    func extractYearFromParentLabel(_ label: String) -> Int? {
        let trimmed = label.trimmingCharacters(in: .whitespaces)
        print("    ðŸ” Trying to extract year from: '\(trimmed)'")
        
        // Just look for 2 digits at the end, preceded by any non-digit character
        // This handles: "April '24", "April 25", "April '24", "April  24", etc.
        if let match = trimmed.range(of: "\\D(\\d{2})$", options: .regularExpression) {
            let matched = String(trimmed[match])
            print("    âœ“ Regex matched: '\(matched)'")
            
            // Extract just the digits
            let digits = matched.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
            print("    âœ“ Extracted digits: '\(digits)'")
            
            if let twoDigitYear = Int(digits) {
                let fullYear = 2000 + twoDigitYear
                print("    âœ“ Converted to full year: \(fullYear)")
                return fullYear
            }
        }
        print("    âœ— No year pattern found")
        return nil
    }
    
    func extractBookmarkDatesForImporter(from document: PDFDocument) -> [Int: Date] {
        var dates: [Int: Date] = [:]
        
        func extractDates(from outline: PDFOutline?, startPage: Int, endPage: Int, parentLabel: String? = nil) {
            guard let outline = outline else { return }
            
            if let page = outline.destination?.page {
                let pageIndex = document.index(for: page)
                // Pass parent label to parseDateString for year extraction
                if let date = parseDateString(outline.label ?? "", parentLabel: parentLabel) {
                    // Find next sibling's page or use endPage
                    let nextPage: Int
                    if let parent = outline.parent {
                        let siblings = (0..<parent.numberOfChildren).map({ parent.child(at: $0) })
                        if let currentIndex = siblings.firstIndex(where: { $0 === outline }),
                           currentIndex + 1 < siblings.count,
                           let nextSibling = siblings[currentIndex + 1],
                           let nextDest = nextSibling.destination?.page {
                            let nextIndex = document.index(for: nextDest)
                            nextPage = nextIndex
                        } else {
                            nextPage = endPage
                        }
                    } else {
                        nextPage = endPage
                    }
                    
                    // Assign date to all pages in range
                    for i in pageIndex..<nextPage {
                        dates[i] = date
                    }
                }
            }
            
            // Recursively process children, passing current label as parent
            for i in 0..<outline.numberOfChildren {
                if let child = outline.child(at: i) {
                    extractDates(from: child, startPage: startPage, endPage: endPage, parentLabel: outline.label)
                }
            }
        }
        
        if let outline = document.outlineRoot {
            extractDates(from: outline, startPage: 0, endPage: document.pageCount, parentLabel: nil)
        }
        
        return dates
    }
    
    func matchEntriesToPages(notionEntries: [NotionEntry], pdfPageDates: [Int: Date]) -> [MatchedEntry] {
        var matched: [MatchedEntry] = []
        var usedPages = Set<Int>()
        
        // Load existing transcriptions to skip already-matched pages
        let existingTranscriptions = loadTranscriptionsForImport()
        let alreadyMatchedPages = Set(existingTranscriptions
            .filter { $0.pdfName == pdfURL.lastPathComponent }
            .map { $0.pageNumber - 1 })
        
        for entry in notionEntries {
            guard let entryDate = entry.date else {
                matched.append(MatchedEntry(notionEntry: entry, pdfPage: nil))
                continue
            }
            
            // Find next available page with matching date (excluding already-matched)
            let matchingPages = pdfPageDates.filter { pageNum, date in
                !usedPages.contains(pageNum) && 
                !alreadyMatchedPages.contains(pageNum) &&
                Calendar.current.isDate(date, inSameDayAs: entryDate)
            }.sorted { $0.key < $1.key }
            
            if let firstMatch = matchingPages.first {
                matched.append(MatchedEntry(notionEntry: entry, pdfPage: firstMatch.key))
                usedPages.insert(firstMatch.key)
            } else {
                // Check if already imported by text
                let isAlreadyImported = existingTranscriptions.contains { existing in
                    existing.pdfName == pdfURL.lastPathComponent && 
                    existing.transcription == entry.text
                }
                
                if !isAlreadyImported {
                    matched.append(MatchedEntry(notionEntry: entry, pdfPage: nil))
                }
            }
        }
        
        return matched
    }
    
    func importTranscriptions(_ matches: [MatchedEntry]) {
        // Import matched transcriptions
        for match in matches {
            guard let pageNum = match.pdfPage else { continue }
            
            let entry = TranscriptionEntry(
                pdfName: pdfURL.lastPathComponent,
                pageNumber: pageNum + 1,
                transcription: match.notionEntry.text
            )
            
            // Save transcription
            var transcriptions = loadTranscriptionsForImport()
            
            // Remove existing entry for this page if any
            transcriptions.removeAll { $0.pdfName == entry.pdfName && $0.pageNumber == entry.pageNumber }
            
            transcriptions.append(entry)
            saveTranscriptionsForImport(transcriptions)
        }
    }
    
    func loadTranscriptionsForImport() -> [TranscriptionEntry] {
        guard let data = UserDefaults.standard.data(forKey: "transcriptions"),
              let decoded = try? JSONDecoder().decode([TranscriptionEntry].self, from: data) else {
            return []
        }
        return decoded
    }
    
    func saveTranscriptionsForImport(_ transcriptions: [TranscriptionEntry]) {
        if let encoded = try? JSONEncoder().encode(transcriptions) {
            UserDefaults.standard.set(encoded, forKey: "transcriptions")
        }
    }
}

struct VerificationView: View {
    @Binding var matchedEntries: [MatchedEntry]
    let pdfURL: URL
    let pdfPageDates: [Int: Date]
    @Binding var isPresented: Bool
    let onImport: ([MatchedEntry]) -> Void
    
    @State private var currentPDFPage = 0
    @State private var currentTextIndex = 0
    @State private var lastAcceptedPage: Int?
    @State private var showingSearch = false
    @State private var showingUnmatched = false
    @State private var hasAcceptedAny = false
    @State private var pdfDocument: PDFDocument?
    @State private var acceptedPairs: Set<String> = []
    
    var availablePDFPages: [Int] {
        guard let doc = pdfDocument else { return [] }
        return (0..<doc.pageCount).filter { pageNum in
            // Exclude pages that have been accepted
            !acceptedPairs.contains { $0.hasPrefix("\(pageNum)-") }
        }
    }
    
    var availableTextEntries: [MatchedEntry] {
        let filtered = showingUnmatched ? matchedEntries.filter { $0.pdfPage == nil } : matchedEntries
        // Exclude entries that have been accepted
        return filtered.filter { entry in
            !acceptedPairs.contains { $0.hasSuffix("-\(entry.id)") }
        }
    }
    
    var filteredEntries: [MatchedEntry] {
        availableTextEntries
    }
    
    var matchedCount: Int {
        matchedEntries.filter { $0.pdfPage != nil }.count
    }
    
    var totalCount: Int {
        matchedEntries.count
    }
    
    var progressValue: Double {
        guard totalCount > 0 else { return 0 }
        return Double(matchedCount) / Double(totalCount)
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Top toolbar
                HStack(spacing: 12) {
                    Button(action: {
                        showingSearch = true
                    }) {
                        Text("ðŸ‘€")
                            .font(.title2)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color(red: 0.68, green: 0.85, blue: 0.90))
                            .cornerRadius(8)
                    }
                    
                    Button(action: {
                        showingUnmatched.toggle()
                        if showingUnmatched {
                            currentTextIndex = 0
                        }
                    }) {
                        Text(showingUnmatched ? "All" : "Unmatched")
                            .font(.subheadline)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color(red: 0.78, green: 0.69, blue: 0.84))
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                }
                .padding(.top, 12)
                .padding(.bottom, 8)
                
                // Progress bar with pastel color
                VStack(spacing: 4) {
                    HStack {
                        Text("\(matchedCount) of \(totalCount) matched")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Spacer()
                    }
                    
                    ProgressView(value: progressValue)
                        .tint(Color(red: 0.6, green: 0.9, blue: 0.7))
                }
                .padding(.horizontal)
                .padding(.bottom, 8)
                
                if filteredEntries.isEmpty {
                    Text(showingUnmatched ? "All entries matched!" : "No entries to verify")
                        .foregroundColor(.gray)
                        .padding()
                } else {
                    // Entry counter
                    Text("\(currentTextIndex + 1) / \(filteredEntries.count)")
                        .font(.headline)
                        .padding(.vertical, 8)
                    
                    // Side by side: PDF and Text with independent arrows
                    HStack(spacing: 10) {
                        // PDF viewer with arrows
                        VStack(spacing: 8) {
                            // PDF navigation arrows
                            HStack {
                                Button(action: {
                                    if let currentAvailableIndex = availablePDFPages.firstIndex(of: currentPDFPage),
                                       currentAvailableIndex > 0 {
                                        currentPDFPage = availablePDFPages[currentAvailableIndex - 1]
                                    }
                                }) {
                                    Image(systemName: "chevron.left")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(.white)
                                        .frame(width: 32, height: 32)
                                        .background(Color(red: 0.68, green: 0.85, blue: 0.90))
                                        .cornerRadius(6)
                                }
                                .disabled(availablePDFPages.isEmpty || availablePDFPages.first == currentPDFPage)
                                .opacity(availablePDFPages.isEmpty || availablePDFPages.first == currentPDFPage ? 0.3 : 1.0)
                                
                                Spacer()
                                
                                Text("p\(currentPDFPage + 1)")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                
                                Spacer()
                                
                                Button(action: {
                                    if let currentAvailableIndex = availablePDFPages.firstIndex(of: currentPDFPage),
                                       currentAvailableIndex < availablePDFPages.count - 1 {
                                        currentPDFPage = availablePDFPages[currentAvailableIndex + 1]
                                    }
                                }) {
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(.white)
                                        .frame(width: 32, height: 32)
                                        .background(Color(red: 0.68, green: 0.85, blue: 0.90))
                                        .cornerRadius(6)
                                }
                                .disabled(availablePDFPages.isEmpty || availablePDFPages.last == currentPDFPage)
                                .opacity(availablePDFPages.isEmpty || availablePDFPages.last == currentPDFPage ? 0.3 : 1.0)
                            }
                            .padding(.horizontal, 8)
                            
                            // PDF display
                            if let document = pdfDocument,
                               let page = document.page(at: currentPDFPage) {
                                PDFPageImageView(page: page)
                                    .frame(maxWidth: .infinity)
                                    .cornerRadius(4)
                            } else {
                                Rectangle()
                                    .fill(Color.gray.opacity(0.2))
                                    .overlay(Text("No PDF").foregroundColor(.gray))
                                    .cornerRadius(4)
                            }
                        }
                        
                        Divider()
                        
                        // Text viewer with arrows
                        VStack(spacing: 0) {
                            // Text navigation arrows
                            HStack {
                                Button(action: {
                                    if currentTextIndex > 0 {
                                        currentTextIndex -= 1
                                    }
                                }) {
                                    Image(systemName: "chevron.left")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(.white)
                                        .frame(width: 32, height: 32)
                                        .background(Color(red: 0.78, green: 0.69, blue: 0.84))
                                        .cornerRadius(6)
                                }
                                .disabled(currentTextIndex == 0)
                                .opacity(currentTextIndex == 0 ? 0.3 : 1.0)
                                
                                Spacer()
                                
                                Text(filteredEntries[currentTextIndex].notionEntry.dateString)
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                
                                Spacer()
                                
                                Button(action: {
                                    if currentTextIndex < filteredEntries.count - 1 {
                                        currentTextIndex += 1
                                    }
                                }) {
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(.white)
                                        .frame(width: 32, height: 32)
                                        .background(Color(red: 0.78, green: 0.69, blue: 0.84))
                                        .cornerRadius(6)
                                }
                                .disabled(currentTextIndex == filteredEntries.count - 1)
                                .opacity(currentTextIndex == filteredEntries.count - 1 ? 0.3 : 1.0)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(Color.gray.opacity(0.05))
                            
                            ScrollView {
                                Text(filteredEntries[currentTextIndex].notionEntry.text)
                                    .font(.system(size: 12))
                                    .padding(8)
                            }
                        }
                    }
                    .padding(.horizontal)
                    
                    // Control buttons - side by side
                    HStack(spacing: 16) {
                        Button("Accept & Next") {
                            // Match current PDF page to current text entry
                            let entry = TranscriptionEntry(
                                pdfName: pdfURL.lastPathComponent,
                                pageNumber: currentPDFPage + 1,
                                transcription: filteredEntries[currentTextIndex].notionEntry.text
                            )
                            
                            var transcriptions = loadTranscriptionsForImport()
                            transcriptions.removeAll { $0.pdfName == entry.pdfName && $0.pageNumber == entry.pageNumber }
                            transcriptions.append(entry)
                            saveTranscriptionsForImport(transcriptions)
                            
                            // Update the matched entry
                            if let originalIndex = matchedEntries.firstIndex(where: { $0.id == filteredEntries[currentTextIndex].id }) {
                                matchedEntries[originalIndex].pdfPage = currentPDFPage
                            }
                            
                            // Track this accepted pair
                            let pairKey = "\(currentPDFPage)-\(filteredEntries[currentTextIndex].id)"
                            acceptedPairs.insert(pairKey)
                            
                            lastAcceptedPage = currentPDFPage
                            hasAcceptedAny = true
                            
                            // Move to next available PDF page
                            if let currentAvailableIndex = availablePDFPages.firstIndex(of: currentPDFPage),
                               currentAvailableIndex < availablePDFPages.count - 2 {
                                currentPDFPage = availablePDFPages[currentAvailableIndex + 1]
                            } else if !availablePDFPages.isEmpty {
                                currentPDFPage = availablePDFPages[0]
                            }
                            
                            // Move to next text entry
                            if currentTextIndex < filteredEntries.count - 1 {
                                currentTextIndex += 1
                            } else {
                                // Reached end, close modal
                                isPresented = false
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Color(red: 0.6, green: 0.9, blue: 0.7))
                        .foregroundColor(.white)
                        .cornerRadius(10)
                        
                        Button("Skip") {
                            // Just move text forward
                            if currentTextIndex < filteredEntries.count - 1 {
                                currentTextIndex += 1
                            } else if !filteredEntries.isEmpty {
                                currentTextIndex = 0
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Color.gray.opacity(0.3))
                        .foregroundColor(.primary)
                        .cornerRadius(10)
                    }
                    .padding(.vertical, 20)
                }
            }
            .navigationTitle("Verify Matches")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(hasAcceptedAny ? "Done" : "Cancel") {
                        isPresented = false
                    }
                    .foregroundColor(.primary)
                }
            }
            .onAppear {
                pdfDocument = PDFDocument(url: pdfURL)
                // Initialize PDF to first entry's suggested page (from date matching)
                if !filteredEntries.isEmpty, let suggestedPage = filteredEntries[0].pdfPage {
                    currentPDFPage = suggestedPage
                } else if !availablePDFPages.isEmpty {
                    // Fallback to first available if no suggestion
                    currentPDFPage = availablePDFPages[0]
                }
            }
            .sheet(isPresented: $showingSearch) {
                SearchPDFView(
                    pdfURL: pdfURL,
                    matchedEntries: $matchedEntries,
                    isPresented: $showingSearch,
                    onPageSelected: { pageNum in
                        // Set PDF to this page
                        currentPDFPage = pageNum
                        showingUnmatched = false
                    }
                )
            }
        }
    }
    
    
    func loadTranscriptionsForImport() -> [TranscriptionEntry] {
        guard let data = UserDefaults.standard.data(forKey: "transcriptions"),
              let decoded = try? JSONDecoder().decode([TranscriptionEntry].self, from: data) else {
            return []
        }
        return decoded
    }
    
    func saveTranscriptionsForImport(_ transcriptions: [TranscriptionEntry]) {
        if let encoded = try? JSONEncoder().encode(transcriptions) {
            UserDefaults.standard.set(encoded, forKey: "transcriptions")
        }
    }
}

struct PagePickerView: View {
    let pdfURL: URL
    let startPage: Int
    let onSelect: (Int) -> Void
    
    @Environment(\.dismiss) var dismiss
    @State private var document: PDFDocument?
    
    var pageRange: Range<Int> {
        guard let doc = document else { return 0..<0 }
        let start = startPage + 1  // Start from next page after last accepted
        let end = min(doc.pageCount, start + 10)  // Show next 10 pages
        return start..<end
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 20) {
                    ForEach(Array(pageRange), id: \.self) { pageNum in
                        VStack {
                            if let page = document?.page(at: pageNum) {
                                PDFPageImageView(page: page)
                                    .frame(height: 250)
                                    .cornerRadius(8)
                                    .shadow(radius: 2)
                                    .onTapGesture {
                                        onSelect(pageNum)
                                    }
                                
                                Text("Page \(pageNum + 1)")
                                    .font(.headline)
                                    .padding(.top, 4)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Choose Page")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(.primary)
                }
            }
            .onAppear {
                document = PDFDocument(url: pdfURL)
            }
        }
    }
}

struct PDFPageImageView: View {
    let page: PDFPage
    
    var body: some View {
        if let image = renderPage() {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fit)
        }
    }
    
    func renderPage() -> UIImage? {
        let pageRect = page.bounds(for: .mediaBox)
        let targetWidth: CGFloat = 400  // Fixed width for consistent sizing
        let scale = targetWidth / pageRect.width
        let scaledSize = CGSize(width: pageRect.width * scale, height: pageRect.height * scale)
        
        let renderer = UIGraphicsImageRenderer(size: scaledSize)
        return renderer.image { context in
            UIColor.white.set()
            context.fill(CGRect(origin: .zero, size: scaledSize))
            
            context.cgContext.translateBy(x: 0, y: scaledSize.height)
            context.cgContext.scaleBy(x: scale, y: -scale)
            page.draw(with: .mediaBox, to: context.cgContext)
        }
    }
}

struct SearchPDFView: View {
    let pdfURL: URL
    @Binding var matchedEntries: [MatchedEntry]
    @Binding var isPresented: Bool
    let onPageSelected: (Int) -> Void
    
    @State private var searchText = ""
    @State private var searchResults: [(page: Int, snippet: String)] = []
    @State private var document: PDFDocument?
    @State private var isSearching = false
    
    var body: some View {
        NavigationView {
            VStack {
                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    TextField("Search PDF pages...", text: $searchText)
                        .textFieldStyle(.plain)
                        .onSubmit {
                            searchPDF()
                        }
                    if !searchText.isEmpty {
                        Button(action: {
                            searchText = ""
                            searchResults = []
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                        }
                    }
                }
                .padding(10)
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)
                .padding()
                
                Button("Search") {
                    searchPDF()
                }
                .padding(.horizontal, 32)
                .padding(.vertical, 10)
                .background(Color(red: 0.68, green: 0.85, blue: 0.90))
                .cornerRadius(10)
                .disabled(searchText.isEmpty || isSearching)
                
                if isSearching {
                    ProgressView("Searching...")
                        .padding()
                }
                
                // Results
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(searchResults.indices, id: \.self) { index in
                            let result = searchResults[index]
                            Button(action: {
                                // Just navigate PDF to this page
                                onPageSelected(result.page)
                                isPresented = false
                            }) {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Page \(result.page + 1)")
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    Text(result.snippet)
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                        .lineLimit(3)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                                .background(Color.gray.opacity(0.1))
                                .cornerRadius(8)
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Search PDF")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") {
                        isPresented = false
                    }
                    .foregroundColor(.primary)
                }
            }
            .onAppear {
                document = PDFDocument(url: pdfURL)
            }
        }
    }
    
    func searchPDF() {
        guard let doc = document, !searchText.isEmpty else { return }
        
        isSearching = true
        searchResults = []
        
        DispatchQueue.global(qos: .userInitiated).async {
            var results: [(page: Int, snippet: String)] = []
            let lowercasedSearch = searchText.lowercased()
            
            for pageIndex in 0..<doc.pageCount {
                if let page = doc.page(at: pageIndex),
                   let pageContent = page.string {
                    let lowercasedContent = pageContent.lowercased()
                    
                    if lowercasedContent.contains(lowercasedSearch) {
                        // Find snippet around search term
                        if let range = lowercasedContent.range(of: lowercasedSearch) {
                            let startIndex = pageContent.index(range.lowerBound, offsetBy: -50, limitedBy: pageContent.startIndex) ?? pageContent.startIndex
                            let endIndex = pageContent.index(range.upperBound, offsetBy: 50, limitedBy: pageContent.endIndex) ?? pageContent.endIndex
                            let snippet = String(pageContent[startIndex..<endIndex])
                                .trimmingCharacters(in: .whitespacesAndNewlines)
                            
                            results.append((page: pageIndex, snippet: "..." + snippet + "..."))
                        }
                    }
                }
            }
            
            DispatchQueue.main.async {
                self.searchResults = results
                self.isSearching = false
            }
        }
    }
}
