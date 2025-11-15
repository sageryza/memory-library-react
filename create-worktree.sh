#!/bin/bash

# Prompt for task name or use timestamp
echo "Enter task name (or press Enter for auto-generated name):"
read TASK_NAME

if [ -z "$TASK_NAME" ]; then
  # Auto-generate with timestamp
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  TASK_NAME="task-$TIMESTAMP"
fi

# Create branch and worktree names
BRANCH="feature/$TASK_NAME"
WORKTREE="../memory-library-$TASK_NAME"

# Create the worktree
git worktree add "$WORKTREE" -b "$BRANCH"

echo ""
echo "✅ Worktree created!"
echo "📁 Location: $WORKTREE"
echo "🌿 Branch: $BRANCH"
echo ""
echo "To use in this chat:"
echo "  cd $WORKTREE"
echo ""
echo "Master task list location:"
echo "  ../memory-library-react/TODO.md"
echo ""
