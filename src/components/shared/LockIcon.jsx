export function LockIcon({ size = 16, color = "currentColor", className = "" }) {
  return (
    <svg width={size} height={size} fill={color} viewBox="0 0 16 16" className={className}>
      <path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
    </svg>
  );
}

export function UnlockIcon({ size = 16, color = "currentColor", className = "" }) {
  return (
    <svg width={size} height={size} fill={color} viewBox="0 0 16 16" className={className}>
      <path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/>
    </svg>
  );
}
