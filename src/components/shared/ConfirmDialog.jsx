import Modal from './Modal';
import './ConfirmDialog.css';

/**
 * Themed confirmation dialog to replace window.confirm()
 *
 * @param {boolean} isOpen - Whether dialog is visible
 * @param {function} onClose - Called when cancelled (overlay click, escape, cancel button)
 * @param {function} onConfirm - Called when confirmed
 * @param {string} title - Dialog title (default: "Confirm")
 * @param {string} message - The confirmation message
 * @param {string} confirmText - Confirm button text (default: "Confirm")
 * @param {string} cancelText - Cancel button text (default: "Cancel")
 * @param {boolean} danger - If true, confirm button is styled red for destructive actions
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false
}) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      className="confirm-dialog"
      footer={
        <div className="confirm-dialog-buttons">
          <button
            className="confirm-dialog-btn confirm-dialog-btn-cancel"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            className={`confirm-dialog-btn confirm-dialog-btn-confirm ${danger ? 'danger' : ''}`}
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      }
    >
      <p className="confirm-dialog-message">{message}</p>
    </Modal>
  );
}
