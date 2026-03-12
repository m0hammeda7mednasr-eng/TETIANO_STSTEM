import React, { createContext, useState, useContext } from 'react';

const StoreContext = createContext(null);

export const StoreProvider = ({ children }) => {
  const [currentStoreId, setCurrentStoreId] = useState(null);

  const setStoreId = (storeId) => {
    setCurrentStoreId(storeId);
    localStorage.setItem('currentStoreId', storeId);
  };

  const clearStoreId = () => {
    setCurrentStoreId(null);
    localStorage.removeItem('currentStoreId');
  };

  return (
    <StoreContext.Provider value={{ currentStoreId, setStoreId, clearStoreId }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  return useContext(StoreContext);
};
