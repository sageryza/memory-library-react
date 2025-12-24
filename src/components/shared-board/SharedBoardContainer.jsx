import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSharedBoard } from '../../hooks/useSharedBoards';
import SharedBoardLanding from './SharedBoardLanding';
import SharedBoardView from './SharedBoardView';
import './SharedBoard.css';

export default function SharedBoardContainer() {
  const { shareId } = useParams();
  const { sharedBoard, loading, error, updateSharedBoard } = useSharedBoard(shareId);
  const [hasEntered, setHasEntered] = useState(false);

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
        onEnter={() => setHasEntered(true)}
      />
    );
  }

  return (
    <SharedBoardView
      sharedBoard={sharedBoard}
      updateSharedBoard={updateSharedBoard}
    />
  );
}
