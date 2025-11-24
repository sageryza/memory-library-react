import { useEffect } from 'react';
import './Modal.css';

/**
 * Shared Modal component with consistent styling
 *
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Called when overlay clicked or close button pressed
 * @param {string} title - Modal header title
 * @param {React.ReactNode} children - Modal body content
 * @param {React.ReactNode} footer - Optional footer content (buttons)
 * @param {string} className - Optional additional class for the modal container
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  className = ''
}) {
  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay show"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`modal-content ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
