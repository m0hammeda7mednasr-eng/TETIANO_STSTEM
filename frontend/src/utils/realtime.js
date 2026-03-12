const SHARED_DATA_EVENT_KEY = "shared_data_updated_at";

export const markSharedDataUpdated = () => {
  try {
    localStorage.setItem(SHARED_DATA_EVENT_KEY, String(Date.now()));
  } catch (error) {
    console.error("Failed to mark shared data update:", error);
  }
};

export const subscribeToSharedDataUpdates = (onUpdate) => {
  if (typeof onUpdate !== "function") {
    return () => {};
  }

  const handler = (event) => {
    if (event.key !== SHARED_DATA_EVENT_KEY || !event.newValue) {
      return;
    }
    onUpdate(event.newValue);
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
};

