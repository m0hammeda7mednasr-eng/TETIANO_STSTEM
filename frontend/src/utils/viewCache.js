const DB_NAME = "tetiano_local_cache";
const STORE_NAME = "views";
const LOCAL_STORAGE_PREFIX = "tetiano_view_cache::";

let openDbPromise = null;

const isBrowser = () => typeof window !== "undefined";

const openDatabase = () => {
  if (!isBrowser() || typeof window.indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  if (!openDbPromise) {
    openDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);
  }

  return openDbPromise;
};

const readFromLocalStorage = (key) => {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeToLocalStorage = (key, value) => {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}${key}`,
      JSON.stringify(value),
    );
  } catch {
    // Ignore cache write failures.
  }
};

export const buildStoreScopedCacheKey = (scope) => {
  if (!isBrowser()) {
    return scope;
  }

  const currentStoreId =
    String(window.localStorage.getItem("currentStoreId") || "").trim() ||
    "global";
  return `${scope}::${currentStoreId}`;
};

export const readCachedView = async (key) => {
  const database = await openDatabase();
  if (!database) {
    return readFromLocalStorage(key);
  }

  return await new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);

      request.onsuccess = () => {
        resolve(request.result || readFromLocalStorage(key));
      };
      request.onerror = () => {
        resolve(readFromLocalStorage(key));
      };
    } catch {
      resolve(readFromLocalStorage(key));
    }
  });
};

export const writeCachedView = async (key, value) => {
  const payload = {
    key,
    value,
    updatedAt: new Date().toISOString(),
  };

  writeToLocalStorage(key, payload);

  const database = await openDatabase();
  if (!database) {
    return payload;
  }

  return await new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(payload);
      transaction.oncomplete = () => resolve(payload);
      transaction.onerror = () => resolve(payload);
    } catch {
      resolve(payload);
    }
  });
};
