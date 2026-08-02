import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  signInWithCustomToken,
  GoogleAuthProvider,
  OAuthProvider,
  getAdditionalUserInfo,
  linkWithCredential,
  EmailAuthProvider,
  linkWithPopup
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import useAuth from '../hooks/useAuth';

const Login = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // After sign-in, return wherever the visitor came from (?next=/xi/versus/…,
  // set by pages that require an account) — else the conspiracy board.
  useEffect(() => {
    if (user && !authLoading && !isAnonymous) {
      const next = new URLSearchParams(window.location.search).get('next');
      navigate(next && next.startsWith('/') ? next : '/conspiracy-board');
    }
  }, [user, authLoading, isAnonymous, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // If user is anonymous, link the account instead of creating new
        if (user && isAnonymous) {
          const credential = EmailAuthProvider.credential(email, password);
          try {
            await linkWithCredential(user, credential);
          } catch (linkError) {
            // The email already owns a real account — they're not signing UP,
            // they're signing IN from a browser that had a stray guest
            // session. Sign into the existing account instead of dead-ending.
            if (linkError.code === 'auth/email-already-in-use' ||
                linkError.code === 'auth/credential-already-in-use') {
              await signInWithEmailAndPassword(auth, email, password);
            } else {
              throw linkError;
            }
          }
        } else {
          await createUserWithEmailAndPassword(auth, email, password);
        }
      } else {
        // For sign in, if anonymous user exists, we need to handle data migration
        // For now, just sign in (this will replace anonymous account)
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Navigation will be handled by the useEffect hook when auth state updates
    } catch (error) {
      // Handle the case where email is already in use
      if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please sign in instead.');
      } else if (error.code === 'auth/credential-already-in-use') {
        setError('This account is already linked. Please sign in instead.');
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      // Request additional user profile fields
      provider.addScope('profile');

      let result;

      // If user is anonymous, link with Google instead
      if (user && isAnonymous) {
        try {
          result = await linkWithPopup(user, provider);
        } catch (linkError) {
          // The Google account already owns a real account: the visitor is
          // trying to SIGN IN, not merge a stray guest session. Sign into
          // the existing account with the credential Google just returned —
          // the old behavior showed "already linked to another user" and
          // stranded them.
          if (linkError.code === 'auth/credential-already-in-use') {
            const cred = GoogleAuthProvider.credentialFromError(linkError);
            if (!cred) throw linkError;
            result = await signInWithCredential(auth, cred);
          } else {
            throw linkError;
          }
        }
      } else {
        result = await signInWithPopup(auth, provider);
      }

      // A parked Apple credential from a same-email conflict — attach it now
      // that its account's owner is signed in, so the Apple button reaches
      // this same account from then on.
      if (pendingAppleCred) {
        try { await linkWithCredential(result.user, pendingAppleCred); }
        catch { /* already linked or expired — they're signed in either way */ }
        setPendingAppleCred(null);
      }

      // Get the additional user info which includes the Google profile
      const additionalInfo = getAdditionalUserInfo(result);

      // Google provides given_name in the profile
      if (additionalInfo?.profile?.given_name) {
        // Store the actual first name from Google
        localStorage.setItem('googleFirstName', additionalInfo.profile.given_name);
      }

      // Navigation will be handled by the useEffect hook when auth state updates
    } catch (error) {
      if (error.code === 'auth/credential-already-in-use') {
        setError('This Google account is already linked to another user.');
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Parked Apple credential from a same-email conflict (the Apple ID's email
  // already belongs to a Google account). iOS Safari blocks any popup not
  // opened by a direct tap, so the Google sign-in that resolves the conflict
  // can't be auto-opened here — the Google button's own tap finishes the
  // merge instead.
  const [pendingAppleCred, setPendingAppleCred] = useState(null);

  const handleAppleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');

      // Same shape as Google: link a stray guest session if there is one,
      // and if the Apple ID already owns a real account, sign into it.
      if (user && isAnonymous) {
        try {
          await linkWithPopup(user, provider);
        } catch (linkError) {
          if (linkError.code === 'auth/credential-already-in-use') {
            const cred = OAuthProvider.credentialFromError(linkError);
            if (!cred) throw linkError;
            await signInWithCredential(auth, cred);
          } else {
            throw linkError;
          }
        }
      } else {
        await signInWithPopup(auth, provider);
      }
      // Navigation is handled by the useEffect when auth state updates.
    } catch (error) {
      if (error.code === 'auth/email-already-in-use' ||
          error.code === 'auth/account-exists-with-different-credential') {
        // The Apple ID's email already belongs to an existing account. Both
        // providers verify their emails, so the server can merge them
        // silently (mergeAppleSignIn: prove the Apple token, attach
        // apple.com to the account that owns the email, sign in) — one tap
        // total. The two-tap fallback below only shows if that throws.
        const cred = OAuthProvider.credentialFromError(error);
        if (cred?.idToken) {
          try {
            const res = await httpsCallable(functions, 'mergeAppleSignIn')({ idToken: cred.idToken });
            await signInWithCustomToken(auth, res.data.token);
            return; // navigation is handled by the useEffect
          } catch { /* fall through to the two-tap fallback */ }
        }
        setPendingAppleCred(cred);
        setError('This Apple ID uses the same email as your Google account. Tap "Sign in with Google" below — that signs you in and connects Apple to your account.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setError('Apple sign-in is not switched on for this site yet — try Google or email for now.');
      } else if (error.code === 'auth/credential-already-in-use') {
        setError('This Apple ID is already linked to another user.');
      } else if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <h1 style={styles.title}>Memory Library</h1>
        <h2 style={styles.subtitle}>
          {isAnonymous
            ? 'Create Your Account'
            : (isSignUp ? 'Create Account' : 'Sign In')}
        </h2>

        {isAnonymous && (
          <p style={styles.anonymousNotice}>
            Create an account to save your memories and boards permanently.
            Your imported content will be preserved.
          </p>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
            disabled={loading}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            style={styles.button}
            disabled={loading}
          >
            {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div style={styles.divider}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#e8e6d5' }}></div>
          <span style={styles.dividerText}>OR</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#e8e6d5' }}></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          style={styles.googleButton}
          disabled={loading}
        >
          <svg style={styles.googleIcon} viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        <button
          onClick={handleAppleSignIn}
          style={styles.appleButton}
          disabled={loading}
        >
          <svg style={styles.googleIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#fff" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Sign in with Apple
        </button>

        <p style={styles.switchMode}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            style={styles.switchButton}
            disabled={loading}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#faf8e9',
    fontFamily: '"Crimson Text", serif',
  },
  loginBox: {
    background: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '400px',
    border: '2px solid #800020',
  },
  title: {
    fontSize: '32px',
    color: '#800020',
    marginBottom: '8px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '24px',
    color: '#333',
    marginBottom: '24px',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  input: {
    padding: '12px 16px',
    fontSize: '16px',
    border: '2px solid #e8e6d5',
    borderRadius: '8px',
    fontFamily: '"Crimson Text", serif',
    transition: 'border-color 0.3s',
    outline: 'none',
  },
  button: {
    backgroundColor: '#800020',
    color: 'white',
    padding: '14px',
    fontSize: '18px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"Crimson Text", serif',
    fontWeight: '600',
    transition: 'opacity 0.3s',
  },
  googleButton: {
    backgroundColor: 'white',
    color: '#333',
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #e8e6d5',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"Crimson Text", serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    transition: 'background-color 0.3s',
  },
  googleIcon: {
    width: '20px',
    height: '20px',
  },
  appleButton: {
    backgroundColor: '#000',
    color: '#fff',
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #000',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: '"Crimson Text", serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    marginTop: '12px',
    transition: 'opacity 0.3s',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '24px 0',
    gap: '16px',
  },
  dividerText: {
    color: '#999',
    fontSize: '14px',
    flexShrink: 0,
    padding: '0 8px',
  },
  error: {
    color: '#d32f2f',
    fontSize: '14px',
    marginTop: '-8px',
  },
  anonymousNotice: {
    backgroundColor: '#e8f4e8',
    color: '#2e7d32',
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
    textAlign: 'center',
    lineHeight: '1.4',
  },
  switchMode: {
    textAlign: 'center',
    marginTop: '24px',
    fontSize: '16px',
    color: '#666',
  },
  switchButton: {
    color: '#800020',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"Crimson Text", serif',
    fontSize: '16px',
    fontWeight: '600',
    marginLeft: '8px',
    textDecoration: 'underline',
  },
};

export default Login;