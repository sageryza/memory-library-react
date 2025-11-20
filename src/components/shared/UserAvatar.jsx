import React from 'react';

const UserAvatar = ({ firstName = 'Anonymous', size = 32, style = {} }) => {
  // Size similar to simplified view cards
  const avatarSize = size || 32;

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        ...style
      }}
    >
      {/* Gray person icon container */}
      <div
        style={{
          width: `${avatarSize}px`,
          height: `${avatarSize}px`,
          backgroundColor: '#e8e8e8',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #d0d0d0',
        }}
      >
        {/* SVG person silhouette (head with disconnected shoulders) */}
        <svg
          width={avatarSize * 0.6}
          height={avatarSize * 0.6}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Head */}
          <circle
            cx="12"
            cy="8"
            r="3.5"
            fill="#999999"
          />
          {/* Shoulders (disconnected) */}
          <path
            d="M 6 16 Q 6 14, 8 14 L 16 14 Q 18 14, 18 16 L 18 20 L 6 20 Z"
            fill="#999999"
          />
        </svg>
      </div>

      {/* First name label */}
      <span
        style={{
          fontSize: '11px',
          color: '#666',
          fontFamily: '"Crimson Text", serif',
          textAlign: 'center',
          maxWidth: `${avatarSize + 8}px`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {firstName}
      </span>
    </div>
  );
};

export default UserAvatar;