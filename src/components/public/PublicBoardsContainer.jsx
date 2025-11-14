import React, { useState } from 'react';
import PublicBoardsDiscovery from './PublicBoardsDiscovery';
import PublicBoard from './PublicBoard';

function PublicBoardsContainer() {
  const [selectedBoardId, setSelectedBoardId] = useState(null);

  if (selectedBoardId) {
    return (
      <PublicBoard
        boardId={selectedBoardId}
        onBack={() => setSelectedBoardId(null)}
      />
    );
  }

  return (
    <PublicBoardsDiscovery
      onSelectBoard={setSelectedBoardId}
    />
  );
}

export default PublicBoardsContainer;