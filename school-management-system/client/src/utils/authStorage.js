export const AUTH_TOKEN_KEY = "sms_token";
export const AUTH_USER_KEY = "sms_user";

const getTabAuthStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
};

const getLegacySharedStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
};

export const safeStorageGet = (storage, key) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch (error) {
    return null;
  }
};

export const safeStorageSet = (storage, key, value) => {
  try {
    storage?.setItem(key, value);
  } catch (error) {
    // Ignore storage write failures and keep runtime auth state usable.
  }
};

export const safeStorageRemove = (storage, key) => {
  try {
    storage?.removeItem(key);
  } catch (error) {
    // Ignore storage cleanup failures.
  }
};

export const clearStoredAuth = () => {
  [getLegacySharedStorage(), getTabAuthStorage()].forEach((storage) => {
    safeStorageRemove(storage, AUTH_TOKEN_KEY);
    safeStorageRemove(storage, AUTH_USER_KEY);
  });
};

export const readStoredAuthSnapshot = () => {
  const storage = getTabAuthStorage();

  return {
    token: safeStorageGet(storage, AUTH_TOKEN_KEY),
    serializedUser: safeStorageGet(storage, AUTH_USER_KEY),
    storage,
  };
};

export const persistStoredAuth = (token, userData) => {
  const storage = getTabAuthStorage();
  clearStoredAuth();

  if (!storage || !token || userData == null) {
    return false;
  }

  safeStorageSet(storage, AUTH_TOKEN_KEY, token);
  safeStorageSet(
    storage,
    AUTH_USER_KEY,
    typeof userData === "string" ? userData : JSON.stringify(userData)
  );

  return true;
};

export const getStoredAuthToken = () => readStoredAuthSnapshot().token || "";

export const getStoredAuthUser = () => {
  const { serializedUser } = readStoredAuthSnapshot();

  if (!serializedUser) {
    return null;
  }

  try {
    return JSON.parse(serializedUser);
  } catch (error) {
    return null;
  }
};
