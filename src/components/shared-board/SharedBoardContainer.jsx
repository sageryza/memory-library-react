import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useSharedBoard } from '../../hooks/useSharedBoards';
import SharedBoardLanding from './SharedBoardLanding';
import SharedBoardView from './SharedBoardView';
import './SharedBoard.css';

export default function SharedBoardContainer() {
  const { shareId } = useParams();
  const {
    sharedBoard,
    loading,
    error,
    updateSharedBoard,
    recordView,
    recordMemoryView,
    recordAction
  } = useSharedBoard(shareId);
  const [hasEntered, setHasEntered] = useState(false);
  const [hasRecordedLandingView, setHasRecordedLandingView] = useState(false);

  // Record view when landing page loads (first time only)
  useEffect(() => {
    if (sharedBoard && !hasRecordedLandingView) {
      recordView();
      setHasRecordedLandingView(true);
    }
  }, [sharedBoard, hasRecordedLandingView, recordView]);

  if (loading) {
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

  // Show landing page first, then the board view
  if (!hasEntered) {
    return (
      <SharedBoardLanding
        sharedBoard={sharedBoard}
        onEnter={() => {
          // Record that they clicked to view the board
          recordAction('entered_board');
          setHasEntered(true);
        }}
      />
    );
  }

  return (
    <SharedBoardView
      sharedBoard={sharedBoard}
      updateSharedBoard={updateSharedBoard}
      recordMemoryView={recordMemoryView}
      recordAction={recordAction}
    />
  );
}
