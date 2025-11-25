import { createContext, useContext, useState, useCallback } from 'react';
import ConfirmDialog from '../components/shared/ConfirmDialog';

const ConfirmContext = createContext();

export function ConfirmProvider({ children }) {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    title: 'Confirm',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    danger: false,
    resolve: null
  });

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      // If options is a string, treat it as the message
      const config = typeof options === 'string'
        ? { message: options }
        : options;

      setDialogState({
        isOpen: true,
        title: config.title || 'Confirm',
        message: config.message || 'Are you sure?',
        confirmText: config.confirmText || 'Confirm',
        cancelText: config.cancelText || 'Cancel',
        danger: config.danger !== undefined ? config.danger : false,
        resolve
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    if (dialogState.resolve) {
      dialogState.resolve(false);
    }
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, [dialogState.resolve]);

  const handleConfirm = useCallback(() => {
    if (dialogState.resolve) {
      dialogState.resolve(true);
    }
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, [dialogState.resolve]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={dialogState.title}
        message={dialogState.message}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        danger={dialogState.danger}
      />
    </ConfirmContext.Provider>
  );
}

// Hook to use the confirm dialog
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}