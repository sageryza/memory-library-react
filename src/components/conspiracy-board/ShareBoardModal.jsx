import { useState } from 'react';
import { Share2, Copy, Check, Link, Eye, Clock, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import Modal from '../shared/Modal';
import { useSharedBoards } from '../../hooks/useSharedBoards';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import './ShareBoardModal.css';

// Helper to format timestamps
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

export default function ShareBoardModal({
  isOpen,
  onClose,
  boardState,
  boardName = 'My Board'
}) {
  const { user } = useAuth();
  const { profile } = useUserProfile(user);
  const { sharedBoards, createShare } = useSharedBoards(user?.uid);

  const [recipientName, setRecipientName] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [showPreviousShares, setShowPreviousShares] = useState(false);
  const [expandedShareId, setExpandedShareId] = useState(null);

  const handleGenerateLink = async () => {
    if (!user) {
      setError('Please sign in to share boards');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const shareId = await createShare(
        boardState,
        recipientName.trim() || 'you',
        user,
        profile,
        boardName
      );

      const baseUrl = window.location.origin;
      setShareLink(`${baseUrl}/share/${shareId}`);
    } catch (err) {
      console.error('Failed to create share:', err);
      setError('Failed to generate share link. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setRecipientName('');
    setShareLink('');
    setCopied(false);
    setError(null);
    onClose();
  };

  const memoryCount = boardState?.droppedMemories?.length || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Share Board"
      className="share-board-modal"
    >
      {!shareLink ? (
        // Step 1: Enter recipient name
        <div className="share-form">
          <p className="share-description">
            Create a shareable link for this board with {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}.
          </p>

          <div className="form-group">
            <label htmlFor="recipientName">Who are you sharing with?</label>
            <input
              id="recipientName"
              type="text"
              placeholder="Enter their name (optional)"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateLink()}
              autoFocus
            />
            <span className="helper-text">
              They'll see a personalized message like "{profile?.firstName || 'You'} shared {memoryCount} memories with {recipientName || 'you'}"
            </span>
          </div>

          {error && <p className="error-message">{error}</p>}

          <button
            className="btn btn-primary generate-btn"
            onClick={handleGenerateLink}
            disabled={isGenerating || !user}
          >
            <Link size={16} />
            {isGenerating ? 'Generating...' : 'Generate Link'}
          </button>

          {!user && (
            <p className="sign-in-prompt">
              Please sign in to share boards
            </p>
          )}
        </div>
      ) : (
        // Step 2: Show generated link
        <div className="share-success">
          <div className="success-icon">
            <Share2 size={32} />
          </div>

          <h4>Your share link is ready!</h4>

          <p className="preview-message">
            {profile?.firstName || 'You'} shared {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'} with {recipientName || 'you'}
          </p>

          <div className="link-container">
            <input
              type="text"
              value={shareLink}
              readOnly
              className="share-link-input"
            />
            <button
              className={`btn copy-btn ${copied ? 'copied' : ''}`}
              onClick={handleCopyLink}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <p className="share-instructions">
            Send this link via text or email. Anyone with the link can view and edit the board.
          </p>

          <button
            className="btn btn-secondary"
            onClick={handleClose}
          >
            Done
          </button>
        </div>
      )}

      {/* Previous Shares Section */}
      {user && sharedBoards.length > 0 && (
        <div className="previous-shares-section">
          <button
            className="previous-shares-toggle"
            onClick={() => setShowPreviousShares(!showPreviousShares)}
          >
            <span>Your Shared Boards ({sharedBoards.length})</span>
            {showPreviousShares ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showPreviousShares && (
            <div className="previous-shares-list">
              {sharedBoards.map((share) => (
                <div key={share.id} className="share-item">
                  <div
                    className="share-item-header"
                    onClick={() => setExpandedShareId(expandedShareId === share.id ? null : share.id)}
                  >
                    <div className="share-item-info">
                      <span className="share-recipient">
                        Shared with {share.sharedWith?.name || 'someone'}
                      </span>
                      <span className="share-meta">
                        {share.memoryCount} {share.memoryCount === 1 ? 'memory' : 'memories'}
                      </span>
                    </div>
                    <div className="share-item-status">
                      {share.firstViewedAt ? (
                        <span className="viewed-badge">
                          <Eye size={12} />
                          Viewed
                        </span>
                      ) : (
                        <span className="not-viewed-badge">Not yet viewed</span>
                      )}
                    </div>
                  </div>

                  {expandedShareId === share.id && (
                    <div className="share-item-details">
                      <div className="tracking-stats">
                        {share.firstViewedAt && (
                          <div className="stat">
                            <Clock size={14} />
                            <span>First viewed: {formatTimeAgo(share.firstViewedAt)}</span>
                          </div>
                        )}
                        {share.lastViewedAt && (
                          <div className="stat">
                            <Eye size={14} />
                            <span>Last viewed: {formatTimeAgo(share.lastViewedAt)}</span>
                          </div>
                        )}
                        {share.viewCount > 0 && (
                          <div className="stat">
                            <Activity size={14} />
                            <span>{share.viewCount} total view{share.viewCount !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>

                      {share.activityLog && share.activityLog.length > 0 && (
                        <div className="activity-log">
                          <h5>Activity ({share.activityLog.length})</h5>
                          <ul className="activity-list-scrollable">
                            {[...share.activityLog].reverse().map((activity, idx) => (
                              <li key={idx} className="activity-item">
                                {activity.type === 'memory_view' && (
                                  <span>Viewed "{activity.memoryTitle}"</span>
                                )}
                                {activity.type === 'memory_moved' && (
                                  <span>Moved "{activity.memoryTitle}"</span>
                                )}
                                {activity.type === 'memory_edited' && (
                                  <span>Edited "{activity.memoryTitle}"</span>
                                )}
                                {activity.type === 'memory_removed' && (
                                  <span>Removed "{activity.memoryTitle}"</span>
                                )}
                                {activity.type === 'connection_made' && (
                                  <span>Connected "{activity.fromMemoryTitle}" to "{activity.toMemoryTitle}"</span>
                                )}
                                {activity.type === 'connection_deleted' && (
                                  <span>Disconnected "{activity.fromMemoryTitle}" from "{activity.toMemoryTitle}"</span>
                                )}
                                {activity.type === 'connection_insight_edited' && (
                                  <span>Added insight to connection</span>
                                )}
                                {activity.type === 'pin_created' && (
                                  <span>Added a pin</span>
                                )}
                                {activity.type === 'pin_moved' && (
                                  <span>Moved a pin</span>
                                )}
                                {activity.type === 'pin_edited' && (
                                  <span>Edited a pin</span>
                                )}
                                {activity.type === 'pin_deleted' && (
                                  <span>Deleted a pin</span>
                                )}
                                {activity.type === 'entered_board' && (
                                  <span>Entered the board</span>
                                )}
                                {activity.type === 'imported_to_account' && (
                                  <span>Imported the board</span>
                                )}
                                <span className="activity-time">
                                  {formatTimeAgo(activity.timestamp)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="share-link-row">
                        <input
                          type="text"
                          value={`${window.location.origin}/share/${share.id}`}
                          readOnly
                          className="share-link-input small"
                        />
                        <button
                          className="btn copy-btn small"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/share/${share.id}`);
                          }}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
