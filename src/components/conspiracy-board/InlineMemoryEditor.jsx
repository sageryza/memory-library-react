import { useState, useEffect, useRef } from 'react'
import './InlineMemoryEditor.css'

export default function InlineMemoryEditor({ memory, onUpdate, onBlur, onEscape, isStackedView = false }) {
  const [value, setValue] = useState(memory.title || '')
  const textareaRef = useRef(null)

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  const handleChange = (e) => {
    const newValue = e.target.value
    setValue(newValue)

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }

    // Call onUpdate with the new value (will be debounced in parent)
    onUpdate(newValue)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
    }
  }

  const handleBlur = () => {
    onBlur(value)
  }

  const handleClick = (e) => {
    // Stop propagation to prevent canvas click handlers from firing
    e.stopPropagation()
  }

  const handleMouseDown = (e) => {
    // Prevent blur if clicking within the card (but not the textarea)
    if (e.target !== textareaRef.current) {
      e.preventDefault()
    }
  }

  return (
    <div
      className={`memory-card ${isStackedView ? 'stacked-view' : ''}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      <div className={`memory-card-title ${isStackedView ? 'stacked' : 'full-height'}`}>
        <textarea
          ref={textareaRef}
          className="inline-memory-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder=""
          rows={1}
        />
      </div>
    </div>
  )
}
