import React from 'react';
import { AlertCircle, Database } from 'lucide-react';

/**
 * Shows localStorage usage and prompts for signup when approaching limits
 */
export default function StorageIndicator({
  isUsingLocalStorage,
  memoryCount = 0,
  maxMemories = 50,
  isApproachingLimit = false,
  hasReachedLimit = false,
  storageInfo = null
}) {
  if (!isUsingLocalStorage) return null;

  const percentage = (memoryCount / maxMemories) * 100;

  // Determine color based on usage
  const getColor = () => {
    if (hasReachedLimit) return '#dc2626'; // red
    if (isApproachingLimit) return '#f59e0b'; // amber
    if (percentage > 60) return '#eab308'; // yellow
    return '#10b981'; // green
  };

  const handleSignUpClick = () => {
    window.location.href = '/login?action=signup';
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      border: '1px solid #e5e5e5',
      borderRadius: '8px',
      padding: '12px 16px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      maxWidth: '280px',
      fontFamily: 'Crimson Text, serif',
      zIndex: 1000
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '8px',
        gap: '8px'
      }}>
        <Database size={16} color={getColor()} />
        <span style={{ fontWeight: 600, fontSize: '14px' }}>Demo Mode</span>
        {isApproachingLimit && (
          <AlertCircle size={16} color={getColor()} />
        )}
      </div>

      {/* Memory count */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#666'
        }}>
          <span>Memories</span>
          <span>{memoryCount} / {maxMemories}</span>
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%',
          height: '6px',
          background: '#e5e5e5',
          borderRadius: '3px',
          marginTop: '4px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${Math.min(percentage, 100)}%`,
            height: '100%',
            background: getColor(),
            transition: 'width 0.3s ease, background 0.3s ease'
          }} />
        </div>
      </div>

      {/* Storage info if available */}
      {storageInfo && storageInfo.percentage > 0 && (
        <div style={{
          fontSize: '11px',
          color: '#999',
          marginBottom: '8px'
        }}>
          Storage: {(storageInfo.percentage).toFixed(1)}% used
        </div>
      )}

      {/* Messages */}
      {hasReachedLimit && (
        <div style={{
          fontSize: '12px',
          color: '#dc2626',
          marginBottom: '8px'
        }}>
          Memory limit reached!
        </div>
      )}

      {isApproachingLimit && !hasReachedLimit && (
        <div style={{
          fontSize: '12px',
          color: '#f59e0b',
          marginBottom: '8px'
        }}>
          {maxMemories - memoryCount} memories remaining
        </div>
      )}

      {/* Sign up button */}
      <button
        onClick={handleSignUpClick}
        style={{
          width: '100%',
          padding: '6px 12px',
          background: hasReachedLimit ? '#dc2626' : isApproachingLimit ? '#f59e0b' : '#800020',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '13px',
          cursor: 'pointer',
          fontFamily: 'Crimson Text, serif',
          transition: 'opacity 0.2s ease'
        }}
        onMouseOver={(e) => e.target.style.opacity = '0.9'}
        onMouseOut={(e) => e.target.style.opacity = '1'}
      >
        {hasReachedLimit
          ? 'Sign Up to Continue'
          : isApproachingLimit
            ? 'Sign Up for Unlimited'
            : 'Sign Up to Save Online'
        }
      </button>

      {/* Info text */}
      <div style={{
        fontSize: '11px',
        color: '#999',
        marginTop: '8px',
        textAlign: 'center'
      }}>
        Data stored locally in browser
      </div>
    </div>
  );
}