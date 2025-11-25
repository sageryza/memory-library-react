import { useEffect, useRef, useState } from 'react'

function SubmenuItem({ item, onClose }) {
  const [showSubmenu, setShowSubmenu] = useState(false)
  const itemRef = useRef(null)

  // Position submenu to the right of the parent item
  const getSubmenuPosition = () => {
    if (!itemRef.current) return { left: '100%', top: 0 }

    const itemRect = itemRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth

    // Check if submenu would go off right edge
    const submenuWidth = 160 // Approximate submenu width
    const wouldOverflowRight = itemRect.right + submenuWidth > viewportWidth

    return {
      left: wouldOverflowRight ? 'auto' : '100%',
      right: wouldOverflowRight ? '100%' : 'auto',
      top: 0 // Align with parent item
    }
  }

  return (
    <div
      ref={itemRef}
      className="context-menu-item has-submenu"
      onMouseEnter={() => setShowSubmenu(true)}
      onMouseLeave={() => setShowSubmenu(false)}
    >
      {item.icon && <span className="context-menu-icon">{item.icon}</span>}
      <span>{item.label}</span>
      <span className="context-menu-arrow">›</span>

      {showSubmenu && (
        <div
          className="context-menu context-submenu"
          style={getSubmenuPosition()}
        >
          {item.submenu.map((subItem, subIndex) => (
            <div
              key={subIndex}
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                subItem.onClick()
                onClose()
              }}
            >
              {subItem.icon && <span className="context-menu-icon">{subItem.icon}</span>}
              <span>{subItem.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
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

  // Adjust position to prevent menu from going off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10
      }

      menuRef.current.style.left = `${adjustedX}px`
      menuRef.current.style.top = `${adjustedY}px`
    }
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
      }}
    >
      {items.map((item, index) => (
        item.separator ? (
          <div key={index} className="context-menu-separator" />
        ) : item.submenu ? (
          <SubmenuItem key={index} item={item} onClose={onClose} />
        ) : (
          <div
            key={index}
            className="context-menu-item"
            onClick={() => {
              item.onClick()
              onClose()
            }}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            <span>{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </div>
        )
      ))}
    </div>
  )
}