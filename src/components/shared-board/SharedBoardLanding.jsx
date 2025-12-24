import { Loader } from 'lucide-react';
import './SharedBoard.css';

export default function SharedBoardLanding({ sharedBoard, onEnter, isImporting, importError }) {
  const { sharedBy, sharedWith, memoryCount } = sharedBoard;
  const sharerName = sharedBy?.firstName || 'Someone';
  const recipientName = sharedWith?.name || 'you';

  return (
    <div className="shared-board-landing">
      <div className="landing-card">
        <div className="landing-icon">
          <img src="/favicon.svg" alt="Memory Library" width={64} height={64} />
        </div>

        <h1 className="landing-title">
          {sharerName} shared {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'} with {recipientName}
        </h1>

        <p className="landing-subtitle">
          You've been invited to view and collaborate on a memory board.
        </p>

        {importError && (
          <p className="landing-error">{importError}</p>
        )}

        <button
          className="btn btn-primary landing-cta"
          onClick={onEnter}
          disabled={isImporting}
        >
          {isImporting ? (
            <>
              <Loader size={18} className="spinner" />
              Loading...
            </>
          ) : (
            'View Memories'
          )}
        </button>
      </div>
    </div>
  );
}
