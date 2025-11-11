import { useState, useEffect, useRef } from 'react'
import './PinEditModal.css'

export default function PinEditModal({ pin, onSave, onClose }) {
  const [description, setDescription] = useState(pin?.description || '')
  const textareaRef = useRef(null)

  useEffect(() => {
    // Focus textarea when modal opens
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const handleSave = () => {
    onSave(pin.id, description.trim())
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (!pin) return null

  return (
    <div
      className="pin-edit-modal-overlay"
      onClick={handleCancel}
    >
      <div
        className="pin-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Edit Pin Description</h3>
        <p className="pin-edit-subtitle">
          What do all memories connected to this pin have in common?
        </p>
        <textarea
          ref={textareaRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter pin description..."
          className="pin-edit-textarea"
        />
        <div className="pin-edit-buttons">
          <button
            className="pin-edit-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            className="pin-edit-save"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
