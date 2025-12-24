import { useState } from 'react';
import { Share2, Copy, Check, Link } from 'lucide-react';
import Modal from '../shared/Modal';
import { useSharedBoards } from '../../hooks/useSharedBoards';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile } from '../../hooks/useUserProfile';
import './ShareBoardModal.css';

export default function ShareBoardModal({
  isOpen,
  onClose,
  boardState,
  boardName = 'My Board'
}) {
  const { user } = useAuth();
  const { profile } = useUserProfile(user);
  const { createShare } = useSharedBoards(user?.uid);

  const [recipientName, setRecipientName] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

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
    </Modal>
  );
}
