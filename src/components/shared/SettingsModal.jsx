import { useState } from 'react'
import { Plus, Minus, BookOpen, Trash2, ChevronRight } from 'lucide-react'
import './SettingsModal.css'

function ToggleSwitch({ enabled, onChange }) {
  return (
    <button
      className={`toggle-switch ${enabled ? 'enabled' : ''}`}
      onClick={() => onChange(!enabled)}
      type="button"
    >
      <span className="toggle-knob" />
    </button>
  )
}

function AccordionSection({ title, isOpen, onToggle, children, isEmpty }) {
  return (
    <div className="accordion-section">
      <button className="accordion-header" onClick={onToggle}>
        <span className="accordion-title">{title}</span>
        {isOpen ? <Minus size={18} /> : <Plus size={18} />}
      </button>
      {isOpen && !isEmpty && (
        <div className="accordion-content">
          {children}
        </div>
      )}
      {!isOpen && <div className="accordion-divider" />}
    </div>
  )
}

export default function SettingsModal({
  onClose,
  onOpenRecentlyDeleted,
  deletedCount,
  showOpacityFading,
  setShowOpacityFading,
  showMinimap,
  setShowMinimap
}) {
  const [openSection, setOpenSection] = useState('conspiracy')

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          {/* Tutorial - standalone at top */}
          <button
            className="settings-row standalone"
            onClick={() => alert('Tutorial coming soon!')}
          >
            <span className="toggle-icon">
              <BookOpen size={16} />
            </span>
            <span className="toggle-label">Tutorial</span>
            <ChevronRight size={16} className="row-arrow" />
          </button>

          {/* Conspiracy Section */}
          <AccordionSection
            title="Conspiracy"
            isOpen={openSection === 'conspiracy'}
            onToggle={() => toggleSection('conspiracy')}
          >
            <div className="toggle-row">
              <span className="toggle-icon">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
                  <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
                  <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>
                </svg>
              </span>
              <span className="toggle-label">Forget</span>
              <ToggleSwitch
                enabled={showOpacityFading}
                onChange={setShowOpacityFading}
              />
            </div>
            <div className="toggle-row">
              <span className="toggle-icon">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path fillRule="evenodd" d="M15.817.113A.5.5 0 0 1 16 .5v14a.5.5 0 0 1-.402.49l-5 1a.502.502 0 0 1-.196 0L5.5 15.01l-4.902.98A.5.5 0 0 1 0 15.5v-14a.5.5 0 0 1 .402-.49l5-1a.5.5 0 0 1 .196 0L10.5.99l4.902-.98a.5.5 0 0 1 .415.103zM10 1.91l-4-.8v12.98l4 .8V1.91zm1 12.98 4-.8V1.11l-4 .8v12.98zm-6-.8V1.11l-4 .8v12.98l4-.8z"/>
                </svg>
              </span>
              <span className="toggle-label">Minimap</span>
              <ToggleSwitch
                enabled={showMinimap}
                onChange={setShowMinimap}
              />
            </div>
          </AccordionSection>

          {/* Chronology Section */}
          <AccordionSection
            title="Chronology"
            isOpen={openSection === 'chronology'}
            onToggle={() => toggleSection('chronology')}
            isEmpty
          >
            <div className="empty-section">No settings available</div>
          </AccordionSection>

          {/* Constellation Section */}
          <AccordionSection
            title="Constellation"
            isOpen={openSection === 'constellation'}
            onToggle={() => toggleSection('constellation')}
            isEmpty
          >
            <div className="empty-section">No settings available</div>
          </AccordionSection>

          {/* Archive Section */}
          <AccordionSection
            title="Archive"
            isOpen={openSection === 'archive'}
            onToggle={() => toggleSection('archive')}
            isEmpty
          >
            <div className="empty-section">No settings available</div>
          </AccordionSection>

          {/* Libraries Section */}
          <AccordionSection
            title="Libraries"
            isOpen={openSection === 'libraries'}
            onToggle={() => toggleSection('libraries')}
            isEmpty
          >
            <div className="empty-section">No settings available</div>
          </AccordionSection>

          {/* Recently Deleted - standalone at bottom */}
          <button
            className="settings-row standalone"
            onClick={() => {
              onOpenRecentlyDeleted()
              onClose()
            }}
          >
            <span className="toggle-icon">
              <Trash2 size={16} />
            </span>
            <span className="toggle-label">Recently Deleted</span>
            <ChevronRight size={16} className="row-arrow" />
          </button>
        </div>
      </div>
    </div>
  )
}
