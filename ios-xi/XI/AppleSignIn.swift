import Foundation
import CryptoKit
import AuthenticationServices
import FirebaseAuth

/// Sign in with Apple, required by App Store guideline 4.8 because the app also
/// offers Google sign-in. We use the SwiftUI `SignInWithAppleButton` (so the
/// button matches Apple's HIG) and finish the exchange here: turn Apple's ID
/// token + the raw nonce into a Firebase credential, then reuse XIService's
/// existing anonymous-account-upgrade path so anon play carries over on sign-in.
enum AppleNonce {
    /// A cryptographically-random nonce; its SHA256 goes in the Apple request,
    /// the raw value into the Firebase credential (prevents replay).
    static func random(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            if status != errSecSuccess { continue }
            for random in randoms where remaining > 0 {
                if random < UInt8(charset.count) {
                    result.append(charset[Int(random)])
                    remaining -= 1
                }
            }
        }
        return result
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

extension XIService {
    /// Complete Sign in with Apple: build the Firebase credential from Apple's
    /// authorization and finish sign-in (upgrading an anonymous account in place
    /// when possible, exactly like Google).
    func finishAppleSignIn(_ credential: ASAuthorizationAppleIDCredential, rawNonce: String) async throws {
        guard let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            throw NSError(domain: "XI", code: -4,
                          userInfo: [NSLocalizedDescriptionKey: "Apple sign-in returned no ID token."])
        }
        let firebaseCredential = OAuthProvider.appleCredential(
            withIDToken: idToken, rawNonce: rawNonce, fullName: credential.fullName)

        if let current = Auth.auth().currentUser, current.isAnonymous {
            do {
                try await current.link(with: firebaseCredential)
                return
            } catch let e as NSError where e.code == AuthErrorCode.credentialAlreadyInUse.rawValue {
                let export = await exportCurrentUserData()
                let cred = (e.userInfo[AuthErrorUserInfoUpdatedCredentialKey] as? AuthCredential) ?? firebaseCredential
                try await Auth.auth().signIn(with: cred)
                await importData(export)
                return
            }
        }
        try await Auth.auth().signIn(with: firebaseCredential)
    }
}
