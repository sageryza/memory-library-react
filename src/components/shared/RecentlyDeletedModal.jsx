import { useState } from 'react'
import { useConfirm } from '../../contexts/ConfirmContext'
import MemoryCard from './MemoryCard'
import './RecentlyDeletedModal.css'

export default function RecentlyDeletedModal({
  deletedMemories,
  onRestore,
  onPermanentDelete,
  onEmptyTrash,
  onClose,
  formatTitleForDisplay
}) {
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const { confirm } = useConfirm()

  const handleEmptyTrash = async () => {
    if (!confirmEmpty) {
      setConfirmEmpty(true)
      return
    }

    try {
      await onEmptyTrash()
      setConfirmEmpty(false)
    } catch (error) {
      console.error('Error emptying trash:', error)
      alert('Failed to empty trash. Please try again.')
    }
  }

  const handlePermanentDelete = async (memoryId) => {
    const confirmed = await confirm({
      title: 'Permanently Delete',
      message: 'Permanently delete this memory? This cannot be undone.',
      confirmText: 'Delete Forever',
      danger: true
    })

    if (confirmed) {
      try {
        await onPermanentDelete(memoryId)
      } catch (error) {
        console.error('Error permanently deleting memory:', error)
        alert('Failed to delete memory. Please try again.')
      }
    }
  }

  const handleRestore = async (memoryId) => {
    try {
      await onRestore(memoryId)
    } catch (error) {
      console.error('Error restoring memory:', error)
      alert('Failed to restore memory. Please try again.')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="recently-deleted-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Recently Deleted</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {deletedMemories.length === 0 ? (
          <div className="empty-trash-message">
            <p>No deleted memories</p>
            <p className="help-text">Deleted memories will appear here until you empty the trash</p>
          </div>
        ) : (
          <>
            <div className="trash-actions">
              <p className="trash-count">{deletedMemories.length} {deletedMemories.length === 1 ? 'memory' : 'memories'} in trash</p>
              {confirmEmpty ? (
                <div className="confirm-empty">
                  <span className="warning-text">Are you sure? This cannot be undone.</span>
                  <button className="confirm-button" onClick={handleEmptyTrash}>
                    Yes, Empty Trash
                  </button>
                  <button className="cancel-button" onClick={() => setConfirmEmpty(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="empty-trash-button" onClick={handleEmptyTrash}>
                  🗑️ Empty Trash
                </button>
              )}
            </div>

            <div className="deleted-memories-list">
              {deletedMemories.map(memory => (
                <div key={memory.id} className="deleted-memory-item">
                  <div className="memory-preview">
                    <MemoryCard
                      memory={memory}
                      isStackedView={false}
                      formatTitleForDisplay={formatTitleForDisplay}
                    />
                    <div className="deleted-date">
                      Deleted {new Date(memory.deletedAt?.toDate?.() || memory.deletedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="memory-actions">
                    <button
                      className="restore-button"
                      onClick={() => handleRestore(memory.id)}
                    >
                      ↩️ Restore
                    </button>
                    <button
                      className="permanent-delete-button"
                      onClick={() => handlePermanentDelete(memory.id)}
                    >
                      🗑️ Delete Forever
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
