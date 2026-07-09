import SwiftUI
import GoogleSignIn
import AuthenticationServices

/// Sign in with the same account as the web app, so XI memories land in your
/// shared library (and show up on the web). "Play without an account" falls
/// back to anonymous play (memories stay only on this device's anon account).
struct SignInView: View {
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?
    @State private var appleNonce: String?
    @State private var showPassword = false

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Text("XI")
                .font(.system(.largeTitle, design: .serif).weight(.semibold)).tracking(8)
                .foregroundStyle(XITheme.ink)
            Text("Sign in to save to your library")
                .font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.gold)

            VStack(spacing: 12) {
                TextField("email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 8).fill(XITheme.white))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))

                HStack(spacing: 8) {
                    Group {
                        if showPassword {
                            TextField("password", text: $password)
                        } else {
                            SecureField("password", text: $password)
                        }
                    }
                    .textContentType(.password)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                    Button { showPassword.toggle() } label: {
                        Image(systemName: showPassword ? "eye.slash" : "eye")
                            .foregroundStyle(XITheme.line)
                    }
                    .accessibilityLabel(showPassword ? "Hide password" : "Show password")
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 8).fill(XITheme.white))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))
            }
            .font(.system(.body, design: .serif))
            .padding(.top, 6)

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }

            Button(action: signIn) {
                Text(busy ? "signing in…" : "sign in")
                    .font(.system(.body, design: .serif))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(XITheme.gold).foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .disabled(busy || email.isEmpty || password.isEmpty)

            HStack(spacing: 10) {
                Rectangle().fill(XITheme.line.opacity(0.5)).frame(height: 1)
                Text("or").font(.system(.caption, design: .serif)).foregroundStyle(XITheme.line)
                Rectangle().fill(XITheme.line.opacity(0.5)).frame(height: 1)
            }
            .padding(.vertical, 2)

            SignInWithAppleButton(.signIn) { request in
                let nonce = AppleNonce.random()
                appleNonce = nonce
                request.requestedScopes = [.fullName, .email]
                request.nonce = AppleNonce.sha256(nonce)
            } onCompletion: { result in
                appleSignIn(result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 46)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .disabled(busy)

            Button(action: googleSignIn) {
                HStack(spacing: 10) {
                    Image(systemName: "g.circle.fill").font(.system(size: 18))
                    Text("continue with Google").font(.system(.body, design: .serif))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .foregroundStyle(XITheme.ink)
                .background(XITheme.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .disabled(busy)

            Button("play without an account") { playAnon() }
                .font(.system(.footnote, design: .serif))
                .foregroundStyle(XITheme.line)
                .padding(.top, 2)

            Spacer()
        }
        .padding(28)
        .frame(maxWidth: 440)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(XITheme.paper.ignoresSafeArea())
    }

    private func signIn() {
        busy = true; error = nil
        Task {
            do { try await XIService.shared.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password) }
            catch { self.error = error.localizedDescription; busy = false }
        }
    }

    private func googleSignIn() {
        busy = true; error = nil
        Task {
            guard let vc = xiTopViewController() else {
                self.error = "Couldn't present Google sign-in."; busy = false; return
            }
            do { try await XIService.shared.signInWithGoogle(presenting: vc) }
            catch {
                let msg = (error as NSError).localizedDescription
                // A user cancelling the sheet isn't a real error.
                if (error as NSError).code == GIDSignInError.canceled.rawValue { busy = false; return }
                self.error = msg; busy = false
            }
        }
    }

    private func appleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let err):
            // A user cancelling the sheet isn't a real error.
            if (err as? ASAuthorizationError)?.code == .canceled { return }
            error = err.localizedDescription
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let nonce = appleNonce else {
                error = "Apple sign-in failed. Please try again."; return
            }
            busy = true; error = nil
            Task {
                do { try await XIService.shared.finishAppleSignIn(credential, rawNonce: nonce) }
                catch { self.error = error.localizedDescription; busy = false }
            }
        }
    }

    private func playAnon() {
        busy = true; error = nil
        Task {
            do { try await XIService.shared.playAnonymously() }
            catch { self.error = error.localizedDescription; busy = false }
        }
    }
}
