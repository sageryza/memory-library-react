import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Shared Sidebar component that provides consistent wrapper and toggle behavior.
 *
 * This component provides the sidebar-wrapper and toggle button. Children should
 * render their own .sidebar div (e.g., TabbedSidebar already does this).
 *
 * @param {boolean} isOpen - Whether the sidebar is open
 * @param {function} onToggle - Callback when toggle button is clicked
 * @param {React.ReactNode} children - Sidebar content (should include .sidebar div)
 */
export default function Sidebar({
  isOpen = true,
  onToggle,
  children
}) {
  return (
    <div className={`sidebar-wrapper ${isOpen ? 'open' : 'closed'}`}>
      <button
        className="sidebar-toggle-tab"
        onClick={onToggle}
        title={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
      {children}
    </div>
  );
}
