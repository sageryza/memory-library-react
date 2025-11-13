import { useEffect, useRef } from 'react'
import './Hashtag.css'

export default function MemoryPopup({ memory, x, y, onClose }) {
  const popupRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose()
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position to prevent popup from going off screen
  useEffect(() => {
    if (popupRef.current) {
      const rect = popupRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      // Center the popup over the clicked position
      adjustedX = x - rect.width / 2
      adjustedY = y - rect.height / 2

      // Keep within viewport bounds
      if (adjustedX < 10) adjustedX = 10
      if (adjustedX + rect.width > viewportWidth - 10) {
        adjustedX = viewportWidth - rect.width - 10
      }

      if (adjustedY < 10) adjustedY = 10
      if (adjustedY + rect.height > viewportHeight - 10) {
        adjustedY = viewportHeight - rect.height - 10
      }

      popupRef.current.style.left = `${adjustedX}px`
      popupRef.current.style.top = `${adjustedY}px`
    }
  }, [x, y])

  if (!memory) return null

  return (
    <div
      ref={popupRef}
      className="memory-popup"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9998,
      }}
    >
      <div className="memory-popup-header">
        <h3>{memory.title || 'Untitled Memory'}</h3>
        <button className="memory-popup-close" onClick={onClose}>×</button>
      </div>
      <div className="memory-popup-content">
        <div
          dangerouslySetInnerHTML={{ __html: memory.content || '<p>No content</p>' }}
        />
      </div>
      {memory.hashtags && memory.hashtags.length > 0 && (
        <div className="hashtag-container">
          {memory.hashtags.map((tag, i) => (
            <span key={i} className="hashtag">
              {tag}
            </span>
          ))}
        </div>
      )}
      {memory.timestamp && (
        <div className="memory-popup-timestamp">
          {new Date(memory.timestamp).toLocaleDateString()}
        </div>
      )}
    </div>
  )
}