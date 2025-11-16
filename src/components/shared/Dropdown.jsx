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
 * @param {boolean} props.isOpen - Controlled open state (optional)
 * @param {function} props.onOpenChange - Callback when open state changes (optional)
 * @param {boolean} props.triggerOnHover - Whether to open on hover (default: false)
 * @param {boolean} props.enableHoverSwitching - Enable hover-to-switch when any dropdown is open (default: false)
 */
function Dropdown({
  trigger,
  items = [],
  className = '',
  align = 'left',
  closeOnItemClick = true,
  isOpen: controlledIsOpen,
  onOpenChange,
  triggerOnHover = false,
  enableHoverSwitching = false,
  disabled = false
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const closeTimeoutRef = useRef(null)

  // Use controlled state if provided, otherwise use internal state
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen
  const setIsOpen = (newValue) => {
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(newValue)
    }
    if (onOpenChange) {
      onOpenChange(newValue)
    }
  }

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  const handleTriggerClick = (e) => {
    e.stopPropagation()
    if (!triggerOnHover && !disabled) {
      setIsOpen(!isOpen)
    }
  }

  const handleMouseEnter = () => {
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    // Open on hover if triggerOnHover is true, OR if hover switching is enabled
    if (!disabled && (triggerOnHover || enableHoverSwitching)) {
      setIsOpen(true)
    }
  }

  const handleMouseLeave = () => {
    if (triggerOnHover) {
      // Add a delay before closing to allow natural mouse movement to menu items
      closeTimeoutRef.current = setTimeout(() => {
        setIsOpen(false)
        closeTimeoutRef.current = null
      }, 300) // 300ms delay combined with CSS bridge for forgiving UX
    }
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
    <div
      className={`dropdown-container ${className} ${disabled ? 'disabled' : ''}`}
      ref={dropdownRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div onClick={handleTriggerClick}>
        {trigger}
      </div>

      {isOpen && !disabled && (
        <div
          className={`dropdown-menu ${align === 'right' ? 'dropdown-menu-right' : ''}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
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