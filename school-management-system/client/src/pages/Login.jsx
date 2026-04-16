import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import CrestLogo from "../components/CrestLogo";
import { useAuth } from "../context/AuthContext";
import { resolvePostLoginPath } from "../utils/roleRoutes";
import "./Login.css";

const REMEMBER_EMAIL_KEY = "sms_remembered_email";
const REMEMBER_ROLE_KEY = "sms_remembered_role";

const featureItems = [
  {
    icon: GraduationCap,
    title: "Academic Control Center",
    text: "Manage classrooms, curriculum, and exams through a unified ERP workspace.",
  },
  {
    icon: Users,
    title: "Role-Based Workflows",
    text: "Securely route admins, teachers, and students into the right portal experience.",
  },
  {
    icon: BarChart3,
    title: "Progress Intelligence",
    text: "Track attendance, performance, and insights with real-time reporting tools.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted Access",
    text: "Protected authentication with role-aware access controls across school operations.",
  },
];

const authSteps = [
  { id: "credentials", label: "Credentials" },
  { id: "captcha", label: "CAPTCHA" },
  { id: "otp", label: "OTP" },
];
const loginRoleOptions = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Teacher" },
  { value: "student", label: "Student" },
];

const getRemainingSeconds = (targetTime, nowMs) => {
  if (!targetTime) return 0;
  const targetMs = new Date(targetTime).getTime();
  if (Number.isNaN(targetMs)) return 0;
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
};

const formatCountdown = (totalSeconds) => {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [captchaValue, setCaptchaValue] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [step, setStep] = useState("credentials");
  const [sessionToken, setSessionToken] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaExpiresAt, setCaptchaExpiresAt] = useState(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [resendAvailableAt, setResendAvailableAt] = useState(null);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timerNow, setTimerNow] = useState(Date.now());

  const {
    startSecureLogin,
    generateCaptcha,
    refreshCaptcha,
    verifyCaptchaAndSendOtp,
    resendOtp,
    verifyOtpAndCompleteLogin,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  // Redirect destination after successful authentication.
  const from = location.state?.from?.pathname || "/dashboard";

  useEffect(() => {
    const rememberedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);
    const rememberedRole = localStorage.getItem(REMEMBER_ROLE_KEY);
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
    if (rememberedRole && loginRoleOptions.some((roleOption) => roleOption.value === rememberedRole)) {
      setRole(rememberedRole);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  const captchaSecondsLeft = useMemo(
    () => getRemainingSeconds(captchaExpiresAt, timerNow),
    [captchaExpiresAt, timerNow]
  );

  const otpSecondsLeft = useMemo(
    () => getRemainingSeconds(otpExpiresAt, timerNow),
    [otpExpiresAt, timerNow]
  );

  const resendSecondsLeft = useMemo(
    () => getRemainingSeconds(resendAvailableAt, timerNow),
    [resendAvailableAt, timerNow]
  );

  const currentStepIndex = authSteps.findIndex((item) => item.id === step);

  const resetToCredentialStep = () => {
    setStep("credentials");
    setSessionToken("");
    setCaptchaImage("");
    setCaptchaValue("");
    setCaptchaExpiresAt(null);
    setOtpValue("");
    setOtpExpiresAt(null);
    setResendAvailableAt(null);
    setInfoMessage("");
    setError("");
  };

  const syncRememberedCredentials = () => {
    if (rememberMe) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
      localStorage.setItem(REMEMBER_ROLE_KEY, role.trim());
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
      localStorage.removeItem(REMEMBER_ROLE_KEY);
    }
  };

  const handleCredentialSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (!email || !password || !role) {
      setError("Please enter email, password, and role.");
      return;
    }

    setCredentialLoading(true);
    const result = await startSecureLogin(email, password, role);
    setCredentialLoading(false);

    if (!result.success) {
      setError(result.message || "Unable to verify credentials.");
      return;
    }

    const payload = result.data;
    const secureSessionToken = payload.sessionToken;

    if (!secureSessionToken) {
      setError("Secure CAPTCHA session was not created. Please restart backend and try again.");
      return;
    }

    let captchaPayload = payload.captcha || null;
    if (!captchaPayload?.image) {
      const generateResult = await generateCaptcha(secureSessionToken);
      if (!generateResult.success) {
        setError(generateResult.message || "Unable to load CAPTCHA. Please try again.");
        return;
      }
      captchaPayload = generateResult.data?.captcha || null;
    }

    if (!captchaPayload?.image) {
      setError("CAPTCHA could not be loaded. Please try again.");
      return;
    }

    setSessionToken(secureSessionToken);
    setCaptchaImage(captchaPayload.image);
    setCaptchaExpiresAt(captchaPayload.expiresAt || null);
    setCaptchaValue("");
    setOtpValue("");
    setOtpExpiresAt(null);
    setResendAvailableAt(null);
    setStep("captcha");
    setInfoMessage(payload.message || "Credentials verified. Please complete CAPTCHA.");
  };

  const handleCaptchaRefresh = async () => {
    if (!sessionToken) {
      setError("Login session missing. Please restart login.");
      return;
    }
    setError("");
    setInfoMessage("");
    setCaptchaLoading(true);

    const result = await refreshCaptcha(sessionToken);
    setCaptchaLoading(false);

    if (!result.success) {
      setError(result.message || "Unable to refresh CAPTCHA.");
      return;
    }

    setCaptchaImage(result.data.captcha?.image || "");
    setCaptchaExpiresAt(result.data.captcha?.expiresAt || null);
    setCaptchaValue("");
    setInfoMessage(result.data.message || "CAPTCHA refreshed.");
  };

  const handleCaptchaSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (!captchaValue.trim()) {
      setError("Please enter CAPTCHA text.");
      return;
    }

    if (captchaSecondsLeft <= 0) {
      setError("CAPTCHA expired. Please refresh and try again.");
      return;
    }

    setCaptchaLoading(true);
    const result = await verifyCaptchaAndSendOtp({
      sessionToken,
      captcha: captchaValue,
    });
    setCaptchaLoading(false);

    if (!result.success) {
      setError(result.message || "CAPTCHA verification failed.");
      return;
    }

    const payload = result.data;
    setOtpExpiresAt(payload.otp?.expiresAt || null);
    setResendAvailableAt(payload.otp?.resendAvailableAt || null);
    setOtpValue(payload.otp?.debugOtp || "");
    setStep("otp");
    setInfoMessage(payload.message || "OTP sent to your registered email.");
  };

  const handleOtpResend = async () => {
    if (!sessionToken) return;

    setError("");
    setInfoMessage("");
    setResendLoading(true);

    const result = await resendOtp(sessionToken);
    setResendLoading(false);

    if (!result.success) {
      setError(result.message || "Unable to resend OTP.");
      return;
    }

    setOtpExpiresAt(result.data.otp?.expiresAt || null);
    setResendAvailableAt(result.data.otp?.resendAvailableAt || null);
    setOtpValue(result.data.otp?.debugOtp || "");
    setInfoMessage(result.data.message || "A new OTP has been sent.");
  };

  const handleOtpSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (!/^\d{6}$/.test(otpValue.trim())) {
      setError("Please enter a valid 6-digit OTP.");
      return;
    }

    if (otpSecondsLeft <= 0) {
      setError("OTP has expired. Please resend a new OTP.");
      return;
    }

    setOtpLoading(true);
    const result = await verifyOtpAndCompleteLogin({
      sessionToken,
      otp: otpValue.trim(),
    });
    setOtpLoading(false);

    if (!result.success) {
      setError(result.message || "OTP verification failed.");
      return;
    }

    syncRememberedCredentials();
    navigate(resolvePostLoginPath(result.data?.user, from), { replace: true });
  };

  return (
    <main className="erp-login-page">
      <div className="erp-login-orb erp-login-orb--one" aria-hidden="true" />
      <div className="erp-login-orb erp-login-orb--two" aria-hidden="true" />
      <div className="erp-login-orb erp-login-orb--three" aria-hidden="true" />

      <div className="erp-login-grid">
        <section className="erp-login-hero" aria-label="School ERP overview">
          <div className="erp-login-brand">
            <CrestLogo sizeClass="h-14 w-14" className="shadow-[0_8px_22px_rgba(7,32,74,0.24)]" />
            <div>
              <p className="erp-brand-kicker">School Management ERP</p>
              <p className="erp-brand-name">Education Operations Suite</p>
            </div>
          </div>

          <p className="erp-hero-pill">
            <Sparkles size={14} />
            Enterprise-grade school administration platform
          </p>

          <h1 className="erp-hero-title">
            Manage Students, Staff, Attendance &amp; Performance in One Place
          </h1>

          <p className="erp-hero-subtitle">
            Secure multi-step sign in protects school data with staged verification across
            credentials, CAPTCHA, and OTP.
          </p>

          <div className="erp-feature-grid">
            {featureItems.map(({ icon: Icon, title, text }) => (
              <article key={title} className="erp-feature-card">
                <span className="erp-feature-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div>
                  <h2>{title}</h2>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="erp-login-card-wrap">
          <div className="erp-login-card">
            <header className="erp-login-card-header">
              <p className="erp-login-kicker">Welcome Back</p>
              <h2>Secure login verification</h2>
              <p>Complete all steps to access the correct school portal securely.</p>
            </header>

            <div className="erp-stepper" aria-label="Authentication steps">
              {authSteps.map((authStep, index) => (
                <div
                  key={authStep.id}
                  className={`erp-step-item ${
                    index < currentStepIndex
                      ? "is-complete"
                      : index === currentStepIndex
                        ? "is-active"
                        : ""
                  }`}
                >
                  <span className="erp-step-dot">
                    {index < currentStepIndex ? <CheckCircle2 size={15} /> : index + 1}
                  </span>
                  <span className="erp-step-label">{authStep.label}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="erp-login-error" role="alert" aria-live="assertive">
                {error}
              </div>
            )}

            {infoMessage && (
              <div className="erp-login-info" role="status" aria-live="polite">
                {infoMessage}
              </div>
            )}

            {step === "credentials" && (
              <form onSubmit={handleCredentialSubmit} className="erp-login-form" noValidate>
                <div className="erp-field-group">
                  <label htmlFor="email" className="erp-field-label">
                    Email Address
                  </label>
                  <div className="erp-input-shell">
                    <Mail className="erp-input-icon" size={18} aria-hidden="true" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@school.edu"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div className="erp-field-group">
                  <label htmlFor="password" className="erp-field-label">
                    Password
                  </label>
                  <div className="erp-input-shell">
                    <Lock className="erp-input-icon" size={18} aria-hidden="true" />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="erp-password-toggle"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="erp-field-group">
                  <label htmlFor="role" className="erp-field-label">
                    Role
                  </label>
                  <div className="erp-input-shell">
                    <Users className="erp-input-icon" size={18} aria-hidden="true" />
                    <select
                      id="role"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      required
                    >
                      <option value="">Select your role</option>
                      {loginRoleOptions.map((roleOption) => (
                        <option key={roleOption.value} value={roleOption.value}>
                          {roleOption.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="erp-auth-row">
                  <label className="erp-remember">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                    />
                    Remember me
                  </label>

                  <a className="erp-forgot-link" href="mailto:it.support@schoolerp.edu">
                    Forgot password?
                  </a>
                </div>

                <button type="submit" disabled={credentialLoading} className="erp-login-btn">
                  {credentialLoading ? (
                    <>
                      <Loader2 className="erp-spin" size={18} aria-hidden="true" />
                      Verifying credentials...
                    </>
                  ) : (
                    <>
                      <LogIn size={18} aria-hidden="true" />
                      Continue
                    </>
                  )}
                </button>
              </form>
            )}

            {step === "captcha" && (
              <form onSubmit={handleCaptchaSubmit} className="erp-login-form" noValidate>
                <div className="erp-step-card">
                  <p className="erp-step-card-title">CAPTCHA Verification</p>
                  <p className="erp-step-card-text">
                    Enter the text shown below to continue to OTP verification.
                  </p>

                  <div className="erp-captcha-image-wrap">
                    {captchaImage ? (
                      <img src={captchaImage} alt="CAPTCHA challenge" className="erp-captcha-image" />
                    ) : (
                      <p className="erp-captcha-placeholder">No CAPTCHA loaded.</p>
                    )}
                  </div>

                  <div className="erp-captcha-meta">
                    <span>Expires in: {formatCountdown(captchaSecondsLeft)}</span>
                    <button
                      type="button"
                      className="erp-inline-btn"
                      onClick={handleCaptchaRefresh}
                      disabled={captchaLoading}
                    >
                      <RefreshCw size={14} className={captchaLoading ? "erp-spin" : ""} />
                      Refresh CAPTCHA
                    </button>
                  </div>

                  <div className="erp-field-group">
                    <label htmlFor="captcha" className="erp-field-label">
                      CAPTCHA Text
                    </label>
                    <div className="erp-input-shell">
                      <ShieldCheck className="erp-input-icon" size={18} aria-hidden="true" />
                      <input
                        id="captcha"
                        type="text"
                        value={captchaValue}
                        onChange={(event) => setCaptchaValue(event.target.value.toUpperCase())}
                        placeholder="Enter CAPTCHA text"
                        autoComplete="off"
                        maxLength={8}
                        required
                      />
                    </div>
                  </div>

                  <div className="erp-secondary-actions">
                    <button type="button" className="erp-ghost-btn" onClick={resetToCredentialStep}>
                      <ArrowLeft size={16} />
                      Back
                    </button>

                    <button type="submit" disabled={captchaLoading} className="erp-login-btn erp-login-btn--auto">
                      {captchaLoading ? (
                        <>
                          <Loader2 className="erp-spin" size={18} />
                          Validating CAPTCHA...
                        </>
                      ) : (
                        "Verify CAPTCHA & Send OTP"
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleOtpSubmit} className="erp-login-form" noValidate>
                <div className="erp-step-card">
                  <p className="erp-step-card-title">OTP Verification</p>
                  <p className="erp-step-card-text">
                    Enter the 6-digit OTP sent to your registered email address.
                  </p>

                  <div className="erp-otp-meta">
                    <span>OTP expires in: {formatCountdown(otpSecondsLeft)}</span>
                    <span>
                      Resend in:{" "}
                      {resendSecondsLeft > 0 ? formatCountdown(resendSecondsLeft) : "Available now"}
                    </span>
                  </div>

                  <div className="erp-field-group">
                    <label htmlFor="otp" className="erp-field-label">
                      One-Time Password (OTP)
                    </label>
                    <div className="erp-input-shell">
                      <ShieldCheck className="erp-input-icon" size={18} aria-hidden="true" />
                      <input
                        id="otp"
                        type="text"
                        value={otpValue}
                        onChange={(event) => setOtpValue(event.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Enter 6-digit OTP"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        maxLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="erp-secondary-actions">
                    <button
                      type="button"
                      className="erp-inline-btn"
                      onClick={handleOtpResend}
                      disabled={resendLoading || resendSecondsLeft > 0}
                    >
                      {resendLoading ? (
                        <>
                          <Loader2 size={14} className="erp-spin" />
                          Resending...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={14} />
                          Resend OTP
                        </>
                      )}
                    </button>

                    <button type="submit" disabled={otpLoading} className="erp-login-btn erp-login-btn--auto">
                      {otpLoading ? (
                        <>
                          <Loader2 className="erp-spin" size={18} />
                          Verifying OTP...
                        </>
                      ) : (
                        "Verify OTP & Login"
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}

            <p className="erp-login-footer">
              Secure access for Admin, Teacher, and Student
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

