import './SettingsModal.css'

export default function SettingsModal({ onClose, onOpenRecentlyDeleted, deletedCount }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3>Account</h3>
            <button
              className="settings-option"
              onClick={() => {
                onOpenRecentlyDeleted()
                onClose()
              }}
            >
              <span className="option-icon">🗑️</span>
              <div className="option-details">
                <div className="option-label">Recently Deleted</div>
                <div className="option-description">
                  {deletedCount === 0
                    ? 'No deleted memories'
                    : `${deletedCount} ${deletedCount === 1 ? 'memory' : 'memories'} in trash`
                  }
                </div>
              </div>
              <span className="option-arrow">›</span>
            </button>
          </div>

          <div className="settings-section">
            <h3>Help</h3>
            <button
              className="settings-option"
              onClick={() => alert('Tutorial coming soon!')}
            >
              <span className="option-icon">📖</span>
              <div className="option-details">
                <div className="option-label">Tutorial</div>
                <div className="option-description">Learn how to use Memory Library</div>
              </div>
              <span className="option-arrow">›</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
