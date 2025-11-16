import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth } from '../firebase';
import useAuth from '../hooks/useAuth';

const Login = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect to conspiracy board if user is already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate('/conspiracy-board');
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Navigation will be handled by the useEffect hook when auth state updates
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <h1 style={styles.title}>Memory Library</h1>
        <h2 style={styles.subtitle}>{isSignUp ? 'Create Account' : 'Sign In'}</h2>

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

        {/* Temporarily hidden - Google Sign In not working */}
        {/* <div style={styles.divider}>
          <span style={styles.dividerText}>OR</span>
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
        </button> */}

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
  divider: {
    textAlign: 'center',
    margin: '24px 0',
    position: 'relative',
  },
  dividerText: {
    background: 'white',
    padding: '0 12px',
    color: '#999',
    position: 'relative',
    fontSize: '14px',
  },
  error: {
    color: '#d32f2f',
    fontSize: '14px',
    marginTop: '-8px',
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