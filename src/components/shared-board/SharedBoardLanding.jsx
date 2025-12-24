import { BookOpen } from 'lucide-react';
import './SharedBoard.css';

export default function SharedBoardLanding({ sharedBoard, onEnter }) {
  const { sharedBy, sharedWith, memoryCount } = sharedBoard;
  const sharerName = sharedBy?.firstName || 'Someone';
  const recipientName = sharedWith?.name || 'you';

  return (
    <div className="shared-board-landing">
      <div className="landing-card">
        <div className="landing-icon">
          <BookOpen size={48} />
        </div>

        <h1 className="landing-title">
          {sharerName} shared {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'} with {recipientName}
        </h1>

        <p className="landing-subtitle">
          You've been invited to view and collaborate on a memory board.
        </p>

        <button
          className="btn btn-primary landing-cta"
          onClick={onEnter}
        >
          View Memories
        </button>

        <p className="landing-footer">
          Powered by Memory Library
        </p>
      </div>
    </div>
  );
}
