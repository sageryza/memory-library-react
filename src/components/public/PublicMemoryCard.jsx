import React from 'react';
import MemoryCard from '../shared/MemoryCard';
import UserAvatar from '../shared/UserAvatar';
import { useUserProfileById } from '../../hooks/useUserProfile';

/**
 * Wrapper component for memory cards in public boards
 * Adds user attribution showing who added the memory
 */
export default function PublicMemoryCard({ memory, isStackedView, formatTitleForDisplay }) {
  const { profile } = useUserProfileById(memory.addedBy);

  return (
    <div style={{ position: 'relative' }}>
      <MemoryCard
        memory={memory}
        isStackedView={isStackedView}
        formatTitleForDisplay={formatTitleForDisplay}
      />

      {/* Attribution - small avatar in bottom right corner */}
      {!isStackedView && memory.addedBy && memory.addedBy !== 'anonymous' && (
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '8px',
            backgroundColor: 'white',
            borderRadius: '4px',
            padding: '2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e8e8e8',
          }}
        >
          <UserAvatar
            firstName={profile?.firstName || 'Anonymous'}
            size={24}
            style={{
              flexDirection: 'row',
              gap: '2px'
            }}
          />
        </div>
      )}
    </div>
  );
}