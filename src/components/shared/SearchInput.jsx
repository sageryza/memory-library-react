import { X } from 'lucide-react';
import './SearchInput.css';

// TODO: Make search bar smaller/more compact in archive view
// Reduce padding, font size, height for less prominent appearance
export default function SearchInput({
  value,
  onChange,
  onToggleAdvanced,
  placeholder = "Search memories...",
  className = ""
}) {
  return (
    <div className={`search-input-container ${className}`}>
      <input
        type="text"
        className={value ? 'with-clear-btn' : ''}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        className={`advanced-search-btn ${value ? 'with-clear' : ''}`}
        onClick={onToggleAdvanced}
        title="Advanced search"
      >
        <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
        </svg>
      </button>
      {value && (
        <button
          className="clear-search-btn"
          onClick={() => onChange('')}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
