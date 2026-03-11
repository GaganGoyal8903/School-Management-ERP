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

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const persistAuthState = (token, userData) => {
    localStorage.setItem('sms_token', token);
    localStorage.setItem('sms_user', JSON.stringify(userData));
    setUser(userData);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('sms_token');
    const userData = localStorage.getItem('sms_user');
    
    if (token && userData) {
      try {
        const response = await getMe();
        setUser(response.data.user);
      } catch (err) {
        localStorage.removeItem('sms_token');
        localStorage.removeItem('sms_user');
        setUser(null);
      }
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    setError(null);
    try {
      const response = await apiLogin({ email, password });
      const { token, user: userData } = response.data;

      persistAuthState(token, userData);
      
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      setError(message);
      return { success: false, message };
    }
  };

  const startSecureLogin = async (email, password) => {
    setError(null);
    try {
      const response = await loginWithCredentials({ email, password });
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
      persistAuthState(token, userData);
      return { success: true, data: response.data };
    } catch (err) {
      const message = err.response?.data?.message || 'OTP verification failed';
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

      persistAuthState(token, newUser);
      
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed';
      setError(message);
      return { success: false, message };
    }
  };

  const logout = () => {
    localStorage.removeItem('sms_token');
    localStorage.removeItem('sms_user');
    setUser(null);
  };

  const hasRole = (roles) => {
    if (!user) return false;
    if (Array.isArray(roles)) {
      return roles.includes(user.role);
    }
    return user.role === roles;
  };

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
    isAdmin: user?.role === 'admin',
    isTeacher: user?.role === 'teacher',
    isStudent: user?.role === 'student'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
