import { createContext, useContext, useState, useEffect } from 'react';
import {
  login as apiLogin,
  loginWithCredentials,
  generateLoginCaptcha,
  refreshLoginCaptcha,
  verifyLoginCaptcha,
  resendLoginOtp,
  verifyLoginOtp,
  register as apiRegister,
  getMe,
} from '../services/api';
import {
  AUTH_USER_KEY,
  clearStoredAuth,
  persistStoredAuth,
  readStoredAuthSnapshot,
  safeStorageRemove,
} from '../utils/authStorage';

const AuthContext = createContext(null);
const ROLE_ID_TO_KEY = {
  1: 'admin',
  2: 'teacher',
  3: 'student',
  4: 'parent',
  5: 'accountant',
};

const ROLE_KEY_TO_LABEL = {
  admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  accountant: 'Accountant',
};

const normalizeRoleId = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const getRoleKeyFromUser = (userData) => {
  if (!userData) {
    return null;
  }

  const storedRoleKey = String(userData.roleKey || userData.RoleKey || '').trim().toLowerCase();
  if (storedRoleKey) {
    return storedRoleKey;
  }

  const roleValue = String(userData.role || userData.RoleName || '').trim().toLowerCase();
  if (roleValue) {
    return roleValue;
  }

  const roleId = normalizeRoleId(userData.roleId ?? userData.RoleId);
  return roleId ? ROLE_ID_TO_KEY[roleId] || null : null;
};

const normalizeUser = (userData) => {
  if (!userData) {
    return null;
  }

  const normalizedId = userData.id ?? userData.UserId ?? userData.userId ?? userData._id ?? null;
  const roleId = normalizeRoleId(userData.roleId ?? userData.RoleId);
  const roleKey = getRoleKeyFromUser({
    roleKey: userData.roleKey ?? userData.RoleKey,
    role: userData.role ?? userData.RoleName,
    roleId,
  });

  if (normalizedId === null || normalizedId === undefined || normalizedId === '' || !roleKey) {
    return null;
  }

  return {
    id: String(normalizedId),
    fullName: userData.fullName ?? userData.FullName ?? '',
    email: userData.email ?? userData.Email ?? '',
    phone: userData.phone ?? userData.Phone ?? '',
    roleId,
    roleKey,
    role: ROLE_KEY_TO_LABEL[roleKey] || userData.role || userData.RoleName || null,
  };
};

const parseStoredUser = (serializedUser) => {
  if (!serializedUser) {
    return null;
  }

  try {
    const parsed = typeof serializedUser === 'string'
      ? JSON.parse(serializedUser)
      : serializedUser;
    return normalizeUser(parsed);
  } catch (error) {
    return null;
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const initialAuthSnapshot = readStoredAuthSnapshot();
  const initialStoredUser = parseStoredUser(initialAuthSnapshot.serializedUser);
  const [user, setUser] = useState(() => initialStoredUser);
  const [authToken, setAuthToken] = useState(() => initialAuthSnapshot.token);
  const [loading, setLoading] = useState(() => Boolean(initialAuthSnapshot.token));
  const [error, setError] = useState(null);

  const persistAuthState = (token, userData) => {
    const normalizedUser = normalizeUser(userData);

    if (!token || !normalizedUser) {
      clearStoredAuth();
      setAuthToken(null);
      setUser(null);
      return null;
    }

    persistStoredAuth(token, normalizedUser);
    setAuthToken(token);
    setUser(normalizedUser);
    return normalizedUser;
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { token, serializedUser, storage } = readStoredAuthSnapshot();
    const storedUser = parseStoredUser(serializedUser);

    if (!token) {
      if (serializedUser) {
        safeStorageRemove(storage, AUTH_USER_KEY);
      }
      setAuthToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    if (serializedUser && !storedUser) {
      safeStorageRemove(storage, AUTH_USER_KEY);
    }

    try {
      setLoading(true);
      setAuthToken(token);

      if (storedUser) {
        setUser(storedUser);
      }

      const response = await getMe();
      const persistedUser = persistAuthState(token, response.data?.user);
      if (!persistedUser) {
        clearStoredAuth();
        setAuthToken(null);
        setUser(null);
      }
    } catch (err) {
      clearStoredAuth();
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, role) => {
    setError(null);
    try {
      const response = await apiLogin({ email, password, role });
      const { token, user: userData } = response.data;

      const persistedUser = persistAuthState(token, userData);
      if (!persistedUser) {
        throw new Error('Invalid authentication payload');
      }

      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Login failed';
      setError(message);
      return { success: false, message };
    }
  };

  const startSecureLogin = async (email, password, role) => {
    setError(null);
    try {
      const response = await loginWithCredentials({ email, password, role });
      return { success: true, data: response.data };
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to verify credentials';
      const statusCode = err.response?.status || 500;
      const payload = err.response?.data || null;
      setError(message);
      return { success: false, message, statusCode, payload };
    }
  };

  const refreshCaptcha = async (sessionToken) => {
    setError(null);
    try {
      const response = await refreshLoginCaptcha({ sessionToken });
      return { success: true, data: response.data };
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to refresh CAPTCHA';
      const statusCode = err.response?.status || 500;
      const payload = err.response?.data || null;
      setError(message);
      return { success: false, message, statusCode, payload };
    }
  };

  const generateCaptcha = async (sessionToken) => {
    setError(null);
    try {
      const response = await generateLoginCaptcha({ sessionToken });
      return { success: true, data: response.data };
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to generate CAPTCHA';
      const statusCode = err.response?.status || 500;
      const payload = err.response?.data || null;
      setError(message);
      return { success: false, message, statusCode, payload };
    }
  };

  const verifyCaptchaAndSendOtp = async ({ sessionToken, captcha }) => {
    setError(null);
    try {
      const response = await verifyLoginCaptcha({ sessionToken, captcha });
      return { success: true, data: response.data };
    } catch (err) {
      const message = err.response?.data?.message || 'CAPTCHA verification failed';
      const statusCode = err.response?.status || 500;
      const payload = err.response?.data || null;
      setError(message);
      return { success: false, message, statusCode, payload };
    }
  };

  const resendOtp = async (sessionToken) => {
    setError(null);
    try {
      const response = await resendLoginOtp({ sessionToken });
      return { success: true, data: response.data };
    } catch (err) {
      const message = err.response?.data?.message || 'Unable to resend OTP';
      const statusCode = err.response?.status || 500;
      const payload = err.response?.data || null;
      setError(message);
      return { success: false, message, statusCode, payload };
    }
  };

  const verifyOtpAndCompleteLogin = async ({ sessionToken, otp }) => {
    setError(null);
    try {
      const response = await verifyLoginOtp({ sessionToken, otp });
      const { token, user: userData } = response.data;
      const persistedUser = persistAuthState(token, userData);
      if (!persistedUser) {
        throw new Error('Invalid authentication payload');
      }
      return { success: true, data: response.data };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'OTP verification failed';
      const statusCode = err.response?.status || 500;
      const payload = err.response?.data || null;
      setError(message);
      return { success: false, message, statusCode, payload };
    }
  };

  const register = async (userData) => {
    setError(null);
    try {
      const response = await apiRegister(userData);
      const { token, user: newUser } = response.data;

      const persistedUser = persistAuthState(token, newUser);
      if (!persistedUser) {
        throw new Error('Invalid registration payload');
      }

      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Registration failed';
      setError(message);
      return { success: false, message };
    }
  };

  const logout = () => {
    clearStoredAuth();
    setAuthToken(null);
    setUser(null);
  };

  const hasRole = (roles) => {
    if (!user?.id) {
      return false;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    const allowedRoleKeys = allowedRoles
      .map((roleValue) => String(roleValue || '').trim().toLowerCase())
      .filter(Boolean);

    const currentRoleKey = getRoleKeyFromUser(user);
    if (currentRoleKey && allowedRoleKeys.includes(currentRoleKey)) {
      return true;
    }

    if (user.roleId == null) {
      return false;
    }

    return allowedRoleKeys.some((roleKey) => ROLE_ID_TO_KEY[user.roleId] === roleKey);
  };

  const isAuthenticated = Boolean(authToken && user?.id && getRoleKeyFromUser(user));

  const value = {
    user,
    loading,
    error,
    login,
    startSecureLogin,
    generateCaptcha,
    refreshCaptcha,
    verifyCaptchaAndSendOtp,
    resendOtp,
    verifyOtpAndCompleteLogin,
    register,
    logout,
    hasRole,
    isAuthenticated,
    isAdmin: hasRole('admin'),
    isTeacher: hasRole('teacher'),
    isStudent: hasRole('student'),
    isParent: hasRole('parent'),
    isAccountant: hasRole('accountant'),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
