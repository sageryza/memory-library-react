import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import useAuth from './hooks/useAuth'
import useMemories from './hooks/useMemories'
import migrateLocalStorageToFirestore from './utils/migrateData'
import Login from './components/Login'
import ConspiracyBoard from './components/conspiracy-board/ConspiracyBoard'
import Archive from './components/archive/Archive'
import Libraries from './components/libraries/Libraries'
import Chronology from './components/Chronology'
import StorageIndicator from './components/shared/StorageIndicator'
import './styles/theme.css'
import './styles/components.css'
import './App.css'

function Navigation({ user }) {
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <nav className="app-navigation">
      <Link to="/" className="nav-link">🗂️ Conspiracy Board</Link>
      <Link to="/archive" className="nav-link">📚 Archive</Link>
      <Link to="/libraries" className="nav-link">📖 Libraries</Link>
      <Link to="/chronology" className="nav-link">⏳ Chronology</Link>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user ? (
          <>
            <span style={{ fontSize: '14px', color: '#666' }}>
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              style={{
                backgroundColor: '#800020',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: '"Crimson Text", serif',
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: '14px', color: '#666' }}>
              Demo Mode
            </span>
            <Link
              to="/login"
              style={{
                backgroundColor: '#800020',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: '"Crimson Text", serif',
                textDecoration: 'none',
                display: 'inline-block'
              }}
            >
              Sign In / Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}

function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#faf8e9',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #800020',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}></div>
    </div>
  );
}

function App() {
  const { user, loading: authLoading } = useAuth();
  const {
    memories,
    loading: memoriesLoading,
    addMemory,
    updateMemory,
    deleteMemory,
    isUsingLocalStorage,
    memoryCount,
    maxMemories,
    isApproachingLimit,
    hasReachedLimit,
    storageInfo
  } = useMemories(user?.uid);
  const [migrating, setMigrating] = useState(false);

  // Run migration when user logs in
  useEffect(() => {
    if (user?.uid && !migrating) {
      setMigrating(true);
      migrateLocalStorageToFirestore(user.uid)
        .then(() => {
          setMigrating(false);
        })
        .catch((error) => {
          console.error('Migration failed:', error);
          setMigrating(false);
        });
    }
}, [user?.uid]);

  if (authLoading || migrating) {
    return <LoadingSpinner />;
  }

  // Allow unauthenticated access
  return (
    <Router>
      <div className="app">
        {/* Show navigation */}
        <Navigation user={user} />

        {/* Storage indicator for unauthenticated users */}
        {isUsingLocalStorage && (
          <StorageIndicator
            isUsingLocalStorage={isUsingLocalStorage}
            memoryCount={memoryCount}
            maxMemories={maxMemories}
            isApproachingLimit={isApproachingLimit}
            hasReachedLimit={hasReachedLimit}
            storageInfo={storageInfo}
          />
        )}

        <Routes>
          <Route 
            path="/" 
            element={
              <ConspiracyBoard 
                memories={memories}
                memoriesLoading={memoriesLoading}
                addMemory={addMemory}
                updateMemory={updateMemory}
                deleteMemory={deleteMemory}
              />
            } 
          />
          <Route
            path="/archive"
            element={
              <Archive
                memories={memories}
                memoriesLoading={memoriesLoading}
                addMemory={addMemory}
                updateMemory={updateMemory}
                deleteMemory={deleteMemory}
                userId={user?.uid}
              />
            }
          />
          <Route
            path="/libraries"
            element={
              <Libraries
                memories={memories}
                userId={user?.uid}
              />
            }
          />
          <Route
            path="/chronology"
            element={
              <Chronology
                memories={memories}
                memoriesLoading={memoriesLoading}
                addMemory={addMemory}
                updateMemory={updateMemory}
                deleteMemory={deleteMemory}
              />
            }
          />
          <Route
            path="/login"
            element={<Login />}
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;