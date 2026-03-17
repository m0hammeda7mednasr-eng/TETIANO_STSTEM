import React, { createContext, useState, useContext } from 'react';

const StoreContext = createContext(null);
const getInitialStoreId = () =>
  typeof window !== "undefined" ? window.localStorage.getItem("currentStoreId") : null;

export const StoreProvider = ({ children }) => {
  const [currentStoreId, setCurrentStoreId] = useState(getInitialStoreId);

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
