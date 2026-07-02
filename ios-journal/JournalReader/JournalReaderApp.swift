//
//  JournalReaderApp.swift
//  JournalReader
//
//  Created by Sage Ryza on 10/16/25.
//

import SwiftUI
import FirebaseCore

@main
struct JournalReaderApp: App {
    init() { Self.configureFirebase() }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }

    /// Configure Firebase for the shared `membry-df528` project so the Set
    /// Builder can reach the `sagediagram` callable (anonymous auth + Functions).
    /// Uses a bundled GoogleService-Info.plist if present, else explicit project
    /// options so a missing plist can't crash launch.
    static func configureFirebase() {
        if FirebaseApp.app() != nil { return }
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path) {
            FirebaseApp.configure(options: options)
            return
        }
        let options = FirebaseOptions(
            googleAppID: "1:513384339473:ios:bebcb370c3eacafba8b9b0",
            gcmSenderID: "513384339473"
        )
        options.apiKey = "AIzaSyDUS3zBhQohlPY0Cv0WWcq0ADjU3eybOm4"
        options.projectID = "membry-df528"
        options.storageBucket = "membry-df528.firebasestorage.app"
        options.bundleID = "com.sageryza.journal"
        FirebaseApp.configure(options: options)
    }
}
