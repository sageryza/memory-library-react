import UIKit
import UserNotifications
import FirebaseAuth
import FirebaseFirestore
import FirebaseMessaging

/// Push plumbing. FCM registration tokens land in `sidequestUsers/{uid}` so the
/// Cloud Functions can ping you when a party forms or a partner chats.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        Notifications.saveToken(token)
    }

    // Show pushes as banners even while the app is open (e.g. chat on another tab).
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}

enum Notifications {
    private static var pendingToken: String?
    private static var authListener: AuthStateDidChangeListenerHandle?

    /// Ask for permission the first time it matters (accepting a quest,
    /// starting matchmaking), then register for pushes and schedule the daily
    /// quest reminder. Safe to call repeatedly — iOS only prompts once.
    static func enable() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            scheduleDailyReminder()
        }
    }

    /// Persist the FCM token under our (anonymous) user, waiting for the
    /// launch sign-in if the token arrives first.
    static func saveToken(_ token: String) {
        if let uid = Auth.auth().currentUser?.uid {
            write(token, uid: uid)
        } else {
            pendingToken = token
            guard authListener == nil else { return }
            authListener = Auth.auth().addStateDidChangeListener { _, user in
                guard let user, let t = pendingToken else { return }
                pendingToken = nil
                write(t, uid: user.uid)
            }
        }
    }

    private static func write(_ token: String, uid: String) {
        Firestore.firestore().collection("sidequestUsers").document(uid)
            .setData(["fcmTokens": FieldValue.arrayUnion([token])], merge: true)
    }

    /// Local daily nudge — no server involved.
    private static func scheduleDailyReminder() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["sidequest.daily"])
        let content = UNMutableNotificationContent()
        content.title = "SIDE QUEST"
        content.body = "A new quest awaits, NPC. Purpose is back in stock."
        content.sound = .default
        var comps = DateComponents()
        comps.hour = 9; comps.minute = 47
        center.add(UNNotificationRequest(
            identifier: "sidequest.daily",
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: true)))
    }
}

/// Write a moderation report; reviewed in the Firebase console.
enum Reports {
    static func file(type: String, refId: String, offenderUid: String, text: String) {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        Firestore.firestore().collection("sidequestReports").addDocument(data: [
            "type": type,
            "refId": refId,
            "offenderUid": offenderUid,
            "text": String(text.prefix(500)),
            "byUid": uid,
            "ts": FieldValue.serverTimestamp(),
        ])
    }
}
