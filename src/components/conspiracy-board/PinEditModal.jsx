import { useState, useEffect, useRef } from 'react'
import Modal from '../shared/Modal'
import './PinEditModal.css'

export default function PinEditModal({ pin, onSave, onClose }) {
  const [description, setDescription] = useState(pin?.description || '')
  const textareaRef = useRef(null)

  useEffect(() => {
    // Focus textarea when modal opens
    if (pin && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [pin])

  const handleSave = () => {
    onSave(pin.id, description.trim())
    onClose()
  }

  const handleKeyDown = (e) => {
    // Enter key to save (since it's a single-line input)
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Modal
      isOpen={!!pin}
      onClose={onClose}
      title="Edit Pin Description"
      className="pin-edit-modal"
      footer={
        <div className="pin-edit-buttons">
          <button
            className="btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      }
    >
      <p className="pin-edit-subtitle">
        What do all memories connected to this pin have in common?
      </p>
      <input
        ref={textareaRef}
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter pin description..."
        className="pin-edit-input"
      />
    </Modal>
  )
}
