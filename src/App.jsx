import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from './firebase'
import useAuth from './hooks/useAuth'
import { useUserProfile } from './hooks/useUserProfile'
import useMemories from './hooks/useMemories'
import migrateLocalStorageToFirestore from './utils/migrateData'
import { runIdMigration } from './utils/migrateIds'
import './utils/cleanupDuplicates' // Temporary: exposes window.scanDuplicates() and window.deleteDuplicates()
import './utils/backfillBoardProvenance' // Temporary: exposes window.scanProvenance() and window.backfillProvenance()
import { ConfirmProvider } from './contexts/ConfirmContext'
import Login from './components/Login'
import Home from './components/Home'
import Archive from './components/archive/Archive'
import SmsConsent from './components/SmsConsent'
// Heavy feature screens are loaded on demand so they don't bloat the initial
// download — you only fetch them when you open them. Landing screens (Home,
// Login, Archive) stay eager so the first paint is immediate.
const ConspiracyBoard = lazy(() => import('./components/conspiracy-board/ConspiracyBoard'))
const Libraries = lazy(() => import('./components/libraries/Libraries'))
const ChronologyV2 = lazy(() => import('./components/ChronologyV2'))
const GroupDreamJournal = lazy(() => import('./components/dream-journal/GroupDreamJournal'))
const GroupDreamJournalPreview = lazy(() => import('./components/dream-journal/GroupDreamJournalPreview'))
const IllustrateTest = lazy(() => import('./components/IllustrateTest'))
const Miracles = lazy(() => import('./components/miracles/Miracles'))
const PublicBoardsContainer = lazy(() => import('./components/public/PublicBoardsContainer'))
const SharedBoardContainer = lazy(() => import('./components/shared-board/SharedBoardContainer'))
// Lazy-loaded so XI's ~1.3 MB of bundled deck art is split into its own chunk
// and only fetched when a user actually opens the /xi route.
const XiApp = lazy(() => import('./components/xi/XiApp'))
const XiVersus = lazy(() => import('./components/xi/XiVersus'))
const BoardOfDay = lazy(() => import('./components/xi/BoardOfDay'))
import './utils/importXiBackup' // Temporary: exposes window.importXiBackup() for one-time XI backup import
import RecentlyDeletedModal from './components/shared/RecentlyDeletedModal'
import OfflineIndicator from './components/shared/OfflineIndicator'
import UserAvatar from './components/shared/UserAvatar'
import './styles/theme.css'
import './styles/components.css'
import './App.css'

// Any custom domain opens straight into XI instead of the library home page.
// The Firebase default hosts (and local dev) keep showing the full library
// home; everything else — e.g. famnesia.com / incaseofamnesia.com — lands on
// XI. The rest of the library is still reachable from XI's "Open full archive"
// link, and only the root path is redirected.
const LIBRARY_HOME_HOSTS = [
  'membry-df528.web.app',
  'membry-df528.firebaseapp.com',
  'localhost',
  '127.0.0.1',
];
function isXiHomeDomain() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.replace(/^www\./, '');
  return !LIBRARY_HOME_HOSTS.includes(host);
}

function PageTitle() {
  const location = useLocation();

  useEffect(() => {
    const titles = {
      '/': 'Memory Library',
      '/conspiracy-board': 'Conspiracy Board',
      '/archive': 'Archive',
      '/libraries': 'Libraries',
      '/chronology': 'Chronology',
      '/dream-journal': 'Group Dream Journal',
      '/public': 'Public Boards',
      '/xi': 'XI',
      '/login': 'Login'
    };

    // Handle dynamic routes
    let title = titles[location.pathname];
    if (!title && location.pathname.startsWith('/share/')) {
      title = 'Shared Board';
    }
    document.title = title || 'Memory Library';
    // Scrolling is handled via CSS - see PAGE TYPE SYSTEM in App.css
  }, [location]);

  return null;
}

function Navigation({ user, profile, onOpenRecentlyDeleted }) {
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <nav className="app-navigation">
      <Link to="/" className="nav-link">🏠 Home</Link>
      <Link to="/conspiracy-board" className="nav-link">🗂️ Conspiracy Board</Link>
      <Link to="/archive" className="nav-link">📚 Archive</Link>
      <Link to="/libraries" className="nav-link">📖 Libraries</Link>
      <Link to="/chronology" className="nav-link">⏳ Chronology</Link>
      <Link to="/dream-journal" className="nav-link">🌙 Dream Journal</Link>
      <Link to="/public" className="nav-link">🌐 Public Boards</Link>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user ? (
          <>
            <UserAvatar
              firstName={profile?.firstName || 'Anonymous'}
              size={32}
            />
            <button
              onClick={onOpenRecentlyDeleted}
              style={{
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: '"Crimson Text", serif',
              }}
            >
              🗑️ Recently Deleted
            </button>
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
  const { profile } = useUserProfile(user);
  const {
    memories,
    deletedMemories,
    loading: memoriesLoading,
    addMemory,
    updateMemory,
    deleteMemory,
    restoreMemory,
    permanentlyDeleteMemory,
    emptyTrash
  } = useMemories(user?.uid, authLoading);
  const [migrating, setMigrating] = useState(false);
  const [hasMigrationRun, setHasMigrationRun] = useState(false);
  const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false);

  // Run ID migration once on app startup
  useEffect(() => {
    runIdMigration();
  }, []);

  // Run migration when user logs in (once per account, per device). We remember
  // a completed migration in localStorage (keyed by uid) so we don't flash the
  // "Migrating…" overlay on every app open just to re-confirm it's already done.
  useEffect(() => {
    if (!user?.uid || migrating || hasMigrationRun) return;
    let alreadyDone = false;
    try { alreadyDone = localStorage.getItem('xiMigratedV2:' + user.uid) === '1'; } catch { /* ignore */ }
    if (alreadyDone) { setHasMigrationRun(true); return; }

    setMigrating(true);
    setHasMigrationRun(true);
    migrateLocalStorageToFirestore(user.uid)
      .then(() => {
        try { localStorage.setItem('xiMigratedV2:' + user.uid, '1'); } catch { /* ignore */ }
        setMigrating(false);
      })
      .catch((error) => {
        console.error('Migration failed:', error);
        setMigrating(false);
      });
  }, [user?.uid, hasMigrationRun]);

  if (authLoading) {
    return <LoadingSpinner />;
  }

  // Allow unauthenticated access
  return (
    <ConfirmProvider>
      <Router>
        <PageTitle />
      {migrating && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(250, 248, 233, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #800020',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '16px',
          }}></div>
          <p style={{
            color: '#800020',
            fontSize: '18px',
            fontFamily: '"Crimson Text", serif',
          }}>Migrating your data...</p>
        </div>
      )}
      <div className="app">
        {/* Show navigation */}
        <Navigation user={user} profile={profile} onOpenRecentlyDeleted={() => setShowRecentlyDeleted(true)} />


        <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route
            path="/"
            element={isXiHomeDomain() ? <Navigate to="/xi" replace /> : <Home />}
          />
          <Route
            path="/conspiracy-board"
            element={
              <ConspiracyBoard
                memories={memories}
                memoriesLoading={memoriesLoading}
                addMemory={addMemory}
                updateMemory={updateMemory}
                deleteMemory={deleteMemory}
                deletedMemories={deletedMemories}
                restoreMemory={restoreMemory}
                permanentlyDeleteMemory={permanentlyDeleteMemory}
                emptyTrash={emptyTrash}
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
              <ChronologyV2
                memories={memories}
                memoriesLoading={memoriesLoading}
              />
            }
          />
          <Route
            path="/dream-journal"
            element={
              <div className="scrollable-page">
                <GroupDreamJournal />
              </div>
            }
          />
          <Route
            path="/dream-journal-preview"
            element={
              <div className="scrollable-page">
                <GroupDreamJournalPreview />
              </div>
            }
          />
          <Route
            path="/illustrate-test"
            element={
              <div className="scrollable-page">
                <IllustrateTest />
              </div>
            }
          />
          <Route
            path="/miracles"
            element={
              <div className="scrollable-page">
                <Miracles />
              </div>
            }
          />
          <Route
            path="/public"
            element={<PublicBoardsContainer />}
          />
          <Route
            path="/xi"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <XiApp
                  memories={memories}
                  memoriesLoading={memoriesLoading}
                  addMemory={addMemory}
                  userId={user?.uid}
                />
              </Suspense>
            }
          />
          <Route
            path="/xi/board"
            element={(
              <Suspense fallback={<LoadingSpinner />}>
                <BoardOfDay memories={memories} addMemory={addMemory} />
              </Suspense>
            )}
          />
          <Route
            path="/xi/versus"
            element={<Suspense fallback={<LoadingSpinner />}><XiVersus /></Suspense>}
          />
          <Route
            path="/xi/versus/:gameId"
            element={<Suspense fallback={<LoadingSpinner />}><XiVersus /></Suspense>}
          />
          <Route
            path="/login"
            element={<Login />}
          />
          <Route
            path="/sms"
            element={<SmsConsent />}
          />
          <Route
            path="/share/:shareId"
            element={<SharedBoardContainer />}
          />
        </Routes>
        </Suspense>

        {/* Recently Deleted Modal */}
        {showRecentlyDeleted && (
          <RecentlyDeletedModal
            deletedMemories={deletedMemories || []}
            onRestore={restoreMemory}
            onPermanentDelete={permanentlyDeleteMemory}
            onEmptyTrash={emptyTrash}
            onClose={() => setShowRecentlyDeleted(false)}
            formatTitleForDisplay={(title) => title} // Simple formatter for now
          />
        )}

        {/* Offline indicator */}
        <OfflineIndicator />
      </div>
    </Router>
    </ConfirmProvider>
  );
}

export default App;