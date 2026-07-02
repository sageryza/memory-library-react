import Foundation

/// Talks to the shared Firebase backend (project membry-df528) without the
/// Firebase SDK: anonymous sign-in via Google's Identity Toolkit REST API, then
/// the callable-function wire protocol over URLSession. The constants below are
/// the public iOS client config — the same values sibling apps commit inside
/// GoogleService-Info.plist — not secrets.
enum AIService {
    private static let apiKey = "AIzaSyDUS3zBhQohlPY0Cv0WWcq0ADjU3eybOm4"
    private static let callableURL =
        URL(string: "https://us-central1-membry-df528.cloudfunctions.net/forgeTestImage")!

    struct ServiceError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    // MARK: - Draw a closet item

    /// Sends a garment photo; returns a PNG of the same item redrawn as an
    /// illustration on a transparent background.
    static func drawItem(_ photo: Data, category: Category) async throws -> Data {
        let token = try await idToken()
        var req = URLRequest(url: callableURL, timeoutInterval: 180)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = ["data": [
            "style": "closet-draw",
            "image": photo.base64EncodedString(),
            "mimeType": "image/jpeg",
            "category": category.rawValue,
        ]]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, _) = try await URLSession.shared.data(for: req)
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        if let err = json?["error"] as? [String: Any], let msg = err["message"] as? String {
            throw ServiceError(message: msg)
        }
        guard let result = json?["result"] as? [String: Any],
              let b64 = result["b64"] as? String,
              let png = Data(base64Encoded: b64) else {
            throw ServiceError(message: "No image came back from the drawing service.")
        }
        return png
    }

    // MARK: - Anonymous Firebase auth over REST (cached in UserDefaults)

    private static let defaults = UserDefaults.standard
    private static let kToken = "cw.idToken"
    private static let kRefresh = "cw.refreshToken"
    private static let kExpiry = "cw.tokenExpiry"

    private static func idToken() async throws -> String {
        if let t = defaults.string(forKey: kToken),
           defaults.double(forKey: kExpiry) > Date().timeIntervalSince1970 + 120 {
            return t
        }
        if let refresh = defaults.string(forKey: kRefresh),
           let t = try? await refreshIdToken(refresh) {
            return t
        }
        return try await signUpAnonymously()
    }

    private static func signUpAnonymously() async throws -> String {
        let url = URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=\(apiKey)")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["returnSecureToken": true])
        let (data, _) = try await URLSession.shared.data(for: req)
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let t = json["idToken"] as? String else {
            throw ServiceError(message: "Couldn't sign in to the drawing service.")
        }
        store(idToken: t, refresh: json["refreshToken"] as? String, expiresIn: json["expiresIn"])
        return t
    }

    private static func refreshIdToken(_ refresh: String) async throws -> String {
        let url = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(apiKey)")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = "grant_type=refresh_token&refresh_token=\(refresh)".data(using: .utf8)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let t = json["id_token"] as? String else {
            throw ServiceError(message: "Sign-in expired.")
        }
        store(idToken: t, refresh: json["refresh_token"] as? String, expiresIn: json["expires_in"])
        return t
    }

    private static func store(idToken: String, refresh: String?, expiresIn: Any?) {
        defaults.set(idToken, forKey: kToken)
        if let refresh { defaults.set(refresh, forKey: kRefresh) }
        let secs = Double("\(expiresIn ?? "3600")") ?? 3600
        defaults.set(Date().timeIntervalSince1970 + secs, forKey: kExpiry)
    }
}
