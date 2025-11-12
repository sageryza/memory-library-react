import { useState, useEffect, useRef } from 'react'
import './Dropdown.css'

/**
 * Reusable dropdown component for menu items
 *
 * TODO: Enhance Conspiracy Board dropdown usage:
 * - Add/change icons for menu items
 * - Implement keyboard shortcuts (shortcut display already supported - see line 96)
 * - Wire up keyboard event listeners to trigger menu actions
 * - Ensure shortcuts display correctly (menu item left, shortcut right aligned)
 *
 * @param {Object} props
 * @param {React.ReactNode} props.trigger - The trigger element (button, etc)
 * @param {Array} props.items - Array of menu items with { label, onClick, icon, disabled, separator, active }
 * @param {string} props.className - Additional CSS class for the container
 * @param {string} props.align - Alignment of dropdown: 'left' | 'right' (default: 'left')
 * @param {boolean} props.closeOnItemClick - Whether to close dropdown when item is clicked (default: true)
 */
function Dropdown({
  trigger,
  items = [],
  className = '',
  align = 'left',
  closeOnItemClick = true
}) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleTriggerClick = (e) => {
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  const handleItemClick = (item, e) => {
    e.stopPropagation()
    if (!item.disabled && item.onClick) {
      item.onClick()
      if (closeOnItemClick) {
        setIsOpen(false)
      }
    }
  }

  return (
    <div className={`dropdown-container ${className}`} ref={dropdownRef}>
      <div onClick={handleTriggerClick}>
        {trigger}
      </div>

      {isOpen && (
        <div className={`dropdown-menu ${align === 'right' ? 'dropdown-menu-right' : ''}`}>
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={index} className="dropdown-separator" />
            }

            return (
              <button
                key={index}
                className={`dropdown-item ${item.disabled ? 'disabled' : ''} ${item.active ? 'active' : ''}`}
                onClick={(e) => handleItemClick(item, e)}
                disabled={item.disabled}
                title={item.title}
              >
                {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
                <span className="dropdown-item-label">{item.label}</span>
                {item.shortcut && <span className="dropdown-item-shortcut">{item.shortcut}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Dropdown