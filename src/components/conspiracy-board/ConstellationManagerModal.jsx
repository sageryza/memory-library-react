import { useConstellations } from '../../hooks/useConstellations'
import { useAuth } from '../../hooks/useAuth'
import { useConfirm } from '../../contexts/ConfirmContext'
import './ConstellationManagerModal.css'

export default function ConstellationManagerModal({
  isOpen,
  onClose,
  onLoad
}) {
  const { user } = useAuth()
  const { constellations, loading, deleteConstellation } = useConstellations(user?.uid)
  const { confirm } = useConfirm()

  if (!isOpen) return null

  const handleLoadConstellation = (constellation) => {
    if (onLoad) {
      onLoad(constellation)
    }
    onClose()
  }

  const handleDeleteConstellation = async (constellationId, e) => {
    e.stopPropagation()

    const confirmed = await confirm({
      title: 'Delete Constellation',
      message: 'Delete this constellation? This cannot be undone.',
      confirmText: 'Delete',
      danger: true
    })

    if (confirmed) {
      try {
        await deleteConstellation(constellationId)
      } catch (error) {
        console.error('Error deleting constellation:', error)
        alert('Failed to delete constellation. Please try again.')
      }
    }
  }

  return (
    <div className="constellation-manager-overlay" onClick={onClose}>
      <div className="constellation-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="constellation-manager-header">
          <h3>Saved Constellations</h3>
          <button
            className="constellation-manager-close"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="constellation-manager-content">
          {loading ? (
            <div className="constellation-manager-loading">Loading constellations...</div>
          ) : constellations.length === 0 ? (
            <div className="constellation-manager-empty">
              <p>No saved constellations yet.</p>
              <p className="constellation-manager-hint">
                Enter Constellation Mode, select connected memories, and export to save a constellation.
              </p>
            </div>
          ) : (
            <div className="constellation-list">
              {constellations.map(constellation => {
                const memoryCount = constellation.memories?.length || 0
                const pinCount = constellation.pins?.length || 0
                const connectionCount = constellation.connections?.length || 0
                const totalNodes = memoryCount + pinCount

                return (
                  <div
                    key={constellation.id}
                    className="constellation-item"
                    onClick={() => handleLoadConstellation(constellation)}
                  >
                    <div className="constellation-item-header">
                      <h4 className="constellation-item-name">{constellation.name}</h4>
                      <button
                        className="constellation-item-delete"
                        onClick={(e) => handleDeleteConstellation(constellation.id, e)}
                        title="Delete constellation"
                      >
                        🗑️
                      </button>
                    </div>
                    <div className="constellation-item-stats">
                      <span className="constellation-stat">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                        </svg>
                        {totalNodes} node{totalNodes !== 1 ? 's' : ''}
                      </span>
                      <span className="constellation-stat">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                          <path fillRule="evenodd" d="M1.5 1.5A.5.5 0 0 0 1 2v4.8a2.5 2.5 0 0 0 2.5 2.5h9.793l-3.347 3.346a.5.5 0 0 0 .708.708l4.2-4.2a.5.5 0 0 0 0-.708l-4-4a.5.5 0 0 0-.708.708L13.293 8.3H3.5A1.5 1.5 0 0 1 2 6.8V2a.5.5 0 0 0-.5-.5z"/>
                        </svg>
                        {connectionCount} connection{connectionCount !== 1 ? 's' : ''}
                      </span>
                      {memoryCount > 0 && (
                        <span className="constellation-stat">
                          📝 {memoryCount} memor{memoryCount !== 1 ? 'ies' : 'y'}
                        </span>
                      )}
                      {pinCount > 0 && (
                        <span className="constellation-stat">
                          📍 {pinCount} pin{pinCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {constellation.createdAt && (
                      <div className="constellation-item-date">
                        Created {new Date(constellation.createdAt.toDate()).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="constellation-manager-footer">
          <button
            className="constellation-manager-cancel"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
