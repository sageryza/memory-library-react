import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSharedBoard } from '../../hooks/useSharedBoards';
import { useAuth } from '../../hooks/useAuth';
import SharedBoardLanding from './SharedBoardLanding';
import './SharedBoard.css';

export default function SharedBoardContainer() {
  const { shareId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, signInAnonymously } = useAuth();
  const {
    sharedBoard,
    loading,
    error,
    recordView,
    recordAction,
    importToAccount
  } = useSharedBoard(shareId);
  const [hasRecordedLandingView, setHasRecordedLandingView] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState(null);

  // Record view when landing page loads (first time only)
  useEffect(() => {
    if (sharedBoard && !hasRecordedLandingView) {
      recordView();
      setHasRecordedLandingView(true);
    }
  }, [sharedBoard, hasRecordedLandingView, recordView]);

  // Handle the "View Memories" button click
  const handleEnter = async () => {
    setIsImporting(true);
    setImportError(null);

    try {
      let currentUser = user;

      // If not logged in, create anonymous account
      if (!currentUser) {
        currentUser = await signInAnonymously();
      }

      // Record that they clicked to view
      await recordAction('entered_board');

      // Import the shared board into their account
      await importToAccount(currentUser.uid);

      // Redirect to the conspiracy board
      navigate('/conspiracy-board');
    } catch (err) {
      console.error('Failed to import board:', err);
      setImportError('Failed to load the board. Please try again.');
      setIsImporting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="shared-board-loading">
        <div className="loading-spinner" />
        <p>Loading shared board...</p>
      </div>
    );
  }

  if (error || !sharedBoard) {
    return (
      <div className="shared-board-error">
        <h2>Board Not Found</h2>
        <p>This shared board may have been removed or the link is incorrect.</p>
      </div>
    );
  }

  return (
    <SharedBoardLanding
      sharedBoard={sharedBoard}
      onEnter={handleEnter}
      isImporting={isImporting}
      importError={importError}
    />
  );
}
