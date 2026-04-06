import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Mail, User, Eye, EyeOff, LogIn, UserPlus, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { apiPost, apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

type Panel = 'login' | 'register' | 'forgot';

// Check if the current time falls inside the store's operating hours.
function isWithinStoreHours(openingTime: string, closingTime: string) {
  if (!openingTime || !closingTime) return true;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [openHour, openMinute] = openingTime.split(':').map(Number);
  const [closeHour, closeMinute] = closingTime.split(':').map(Number);

  const openMinutes = openHour * 60 + openMinute;
  const closeMinutes = closeHour * 60 + closeMinute;

  if (openMinutes <= closeMinutes) {
    return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  }

  return currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
}

// Authentication page for sign in, registration, and password reset.
export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, role } = useAuthStore();

  // State for which auth tab is currently visible.
  const [panel, setPanel] = useState<Panel>('login');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // State for the sign-in form fields.
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // State for the registration form fields and OTP flow.
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regOtp, setRegOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // State for the password reset form and OTP flow.
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotPassword, setForgotPassword] = useState('');
  const [forgotConfirm, setForgotConfirm] = useState('');
  const [forgotOtpSent, setForgotOtpSent] = useState(false);

  // Redirect the user away from login once a session already exists.
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate(role === 'admin' ? '/admin' : '/home', { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  // Switch between login, register, and reset panels while clearing old messages.
  const switchPanel = (next: Panel) => {
    setPanel(next);
    setError(null);
    setMessage(null);
  };

  // Ask the backend if the store is open before allowing customer login.
  const checkStoreBeforeLogin = async () => {
  try {
    const { ok, data } = await apiGet('/api/orders/store-status/');

    if (!ok || !data?.store) {
      return {
        allowed: false,
        error: 'Unable to verify store status.',
      };
    }

    const store = data.store;
    const isOpen = store.isOpen ?? store.is_open;

    if (!isOpen) {
      return {
        allowed: false,
        error: 'Store is currently closed.',
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error('Store status check error:', err);
    return {
      allowed: false,
      error: 'Unable to verify store status.',
    };
  }
};

  // Submit the login form and route users based on their role.
  const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError(null);
  setMessage(null);

  try {
    const { ok, data } = await apiPost('/api/accounts/login/', {
      email: loginEmail,
      password: loginPassword,
    });

    if (!ok) {
      setError(data?.error || 'Login failed.');
      return;
    }

    const userRole = data.user.role;

    if (userRole !== 'admin') {
      const storeCheck = await checkStoreBeforeLogin();

      if (!storeCheck.allowed) {
        setError(storeCheck.error || 'Store is currently closed.');
        return;
      }
    }

    login({
      role: data.user.role,
      email: data.user.email,
      username: data.user.username,
    });

    navigate(data.user.role === 'admin' ? '/admin' : '/home', { replace: true });
  } catch (err) {
    setError('Something went wrong while signing in.');
  } finally {
    setLoading(false);
  }
};

  // Send the registration OTP to the customer's email address.
  const handleSendRegisterOtp = async () => {
    setError(null);
    setMessage(null);

    if (!regEmail.trim().toLowerCase().endsWith('@student.fatima.edu.ph')) {
      setError('Only @student.fatima.edu.ph email addresses are allowed to register.');
      return;
    }

    try {
      setLoading(true);

      const { ok, data } = await apiPost('/api/accounts/send-otp/', { email: regEmail });

      if (!ok) {
        setError(data?.error || 'Failed to send OTP.');
        return;
      }

      setOtpSent(true);
      setMessage('OTP sent to your email.');
    } catch (err) {
      console.error('Send register OTP error:', err);
      setError('Something went wrong while sending OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Finish account creation after the registration OTP is verified.
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (regPassword !== regConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { ok, data } = await apiPost('/api/accounts/register/', {
        username: regUsername,
        email: regEmail,
        password: regPassword,
        otp: regOtp,
      });

      if (!ok) {
        setError(data?.error || 'Registration failed.');
        return;
      }

      setMessage('Account created. Redirecting to login...');
      setTimeout(() => switchPanel('login'), 1200);
    } catch (err) {
      console.error('Register error:', err);
      setError('Something went wrong while creating your account.');
    } finally {
      setLoading(false);
    }
  };

  // Send a password reset OTP to the requested email.
  const handleSendResetOtp = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { ok, data } = await apiPost('/api/accounts/forgot-password/send-otp/', {
        email: forgotEmail,
      });

      if (!ok) {
        setError(data?.error || 'Failed to send reset OTP.');
        return;
      }

      setForgotOtpSent(true);
      setMessage('Reset OTP sent to your email.');
    } catch (err) {
      console.error('Send reset OTP error:', err);
      setError('Something went wrong while sending reset OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Update the password after the reset OTP is confirmed.
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (forgotPassword !== forgotConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { ok, data } = await apiPost('/api/accounts/forgot-password/reset/', {
        email: forgotEmail,
        otp: forgotOtp,
        password: forgotPassword,
        confirm_password: forgotConfirm,
      });

      if (!ok) {
        setError(data?.error || 'Password reset failed.');
        return;
      }

      setMessage('Password updated. Redirecting to login...');
      setTimeout(() => switchPanel('login'), 1200);
    } catch (err) {
      console.error('Reset password error:', err);
      setError('Something went wrong while resetting your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF2FA] flex items-center justify-center p-4">
      {/* Main authentication page wrapper. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="mb-5 flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-[#4A7FE0] flex items-center justify-center">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-syne text-lg font-bold text-[#1A2E4A]">
              Dali<span className="text-[#4A7FE0]">Very</span>
            </div>
            <div className="text-xs text-[#6A8098] font-space">Delivery system access</div>
          </div>
        </div>

        <div className="flex gap-1 bg-[#F0F5FF]/60 rounded-2xl p-1 mb-4 border border-[#DDE6F5]">
          {([
            ['login', 'Sign In', <LogIn className="w-4 h-4" />],
            ['register', 'Register', <UserPlus className="w-4 h-4" />],
            ['forgot', 'Forgot', <KeyRound className="w-4 h-4" />],
          ] as const).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchPanel(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-space font-medium',
                panel === key ? 'bg-[#4A7FE0] text-white' : 'text-[#1A2E4A]/60'
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="glass-card rounded-3xl p-8 border border-[#DDE6F5] bg-white">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-500 px-4 py-3 text-sm font-space">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 px-4 py-3 text-sm font-space">
              {message}
            </div>
          )}

          {panel === 'login' && (
            <form className="space-y-4" onSubmit={handleLogin}>
              {/* Form for signing in an existing user. */}
              <Field
                icon={<Mail className="w-4 h-4" />}
                placeholder="Email"
                value={loginEmail}
                onChange={setLoginEmail}
              />

              <Field
                icon={<Lock className="w-4 h-4" />}
                placeholder="Password"
                value={loginPassword}
                onChange={setLoginPassword}
                type={showPw ? 'text' : 'password'}
                trailing={
                  <button type="button" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              {/* Main submit button for the current auth panel. */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#4A7FE0] text-white font-syne font-bold py-3.5 rounded-xl disabled:opacity-70"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {panel === 'register' && (
            <form className="space-y-4" onSubmit={handleRegister}>
              {/* Form for creating a new account with OTP verification. */}
              <Field
                icon={<User className="w-4 h-4" />}
                placeholder="Username"
                value={regUsername}
                onChange={setRegUsername}
              />

              <Field
                icon={<Mail className="w-4 h-4" />}
                placeholder="Email"
                value={regEmail}
                onChange={setRegEmail}
              />

              <Field
                icon={<Lock className="w-4 h-4" />}
                placeholder="Password"
                value={regPassword}
                onChange={setRegPassword}
                type={showPw ? 'text' : 'password'}
              />

              <Field
                icon={<Lock className="w-4 h-4" />}
                placeholder="Confirm Password"
                value={regConfirm}
                onChange={setRegConfirm}
                type={showPw ? 'text' : 'password'}
                trailing={
                  <button type="button" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <div className="flex gap-2">
                <div className="flex-1">
                  <Field
                    icon={<KeyRound className="w-4 h-4" />}
                    placeholder="OTP"
                    value={regOtp}
                    onChange={setRegOtp}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendRegisterOtp}
                  disabled={loading}
                  className="px-4 rounded-xl border border-[#DDE6F5] text-sm font-space font-semibold text-[#4A7FE0]"
                >
                  {otpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              </div>

              {/* Main submit button for the current auth panel. */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#4A7FE0] text-white font-syne font-bold py-3.5 rounded-xl disabled:opacity-70"
              >
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </form>
          )}

          {panel === 'forgot' && (
            <form className="space-y-4" onSubmit={handleReset}>
              {/* Form for resetting the password through email OTP. */}
              <Field
                icon={<Mail className="w-4 h-4" />}
                placeholder="Email"
                value={forgotEmail}
                onChange={setForgotEmail}
              />

              <div className="flex gap-2">
                <div className="flex-1">
                  <Field
                    icon={<KeyRound className="w-4 h-4" />}
                    placeholder="OTP"
                    value={forgotOtp}
                    onChange={setForgotOtp}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendResetOtp}
                  disabled={loading}
                  className="px-4 rounded-xl border border-[#DDE6F5] text-sm font-space font-semibold text-[#4A7FE0]"
                >
                  {forgotOtpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              </div>

              <Field
                icon={<Lock className="w-4 h-4" />}
                placeholder="New Password"
                value={forgotPassword}
                onChange={setForgotPassword}
                type={showPw ? 'text' : 'password'}
              />

              <Field
                icon={<Lock className="w-4 h-4" />}
                placeholder="Confirm Password"
                value={forgotConfirm}
                onChange={setForgotConfirm}
                type={showPw ? 'text' : 'password'}
                trailing={
                  <button type="button" onClick={() => setShowPw((s) => !s)}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              {/* Main submit button for the current auth panel. */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#4A7FE0] text-white font-syne font-bold py-3.5 rounded-xl disabled:opacity-70"
              >
                {loading ? 'Saving...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// Reusable input field component used across the auth forms.
function Field({
  icon,
  trailing,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#DDE6F5] bg-[#F8FAFF] px-4 py-3">
      <span className="text-[#8A9EB8]">{icon}</span>
      <input
        className="flex-1 bg-transparent outline-none font-space text-sm text-[#1A2E4A]"
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {trailing && <span className="text-[#8A9EB8]">{trailing}</span>}
    </div>
  );
}
