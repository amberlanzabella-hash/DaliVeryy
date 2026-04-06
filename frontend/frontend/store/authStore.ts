import { create } from 'zustand';

export type UserRole = 'user' | 'admin';

type AuthState = {
  isAuthenticated: boolean;
  role: UserRole | null;
  email: string | null;
  username: string | null;
  login: (payload: { role: UserRole; email: string; username: string }) => void;
  logout: () => void;
};

const STORAGE_KEY = 'aq_auth';

// Load the saved login session from browser storage.
function loadAuth(): Pick<AuthState, 'isAuthenticated' | 'role' | 'email' | 'username'> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { isAuthenticated: false, role: null, email: null, username: null };
    const parsed = JSON.parse(raw);
    const role = parsed?.role === 'admin' || parsed?.role === 'user' ? parsed.role : null;
    const email = typeof parsed?.email === 'string' ? parsed.email : null;
    const username = typeof parsed?.username === 'string' ? parsed.username : null;
    const isAuthenticated = !!role && !!email;
    return { isAuthenticated, role, email, username };
  } catch {
    return { isAuthenticated: false, role: null, email: null, username: null };
  }
}

// Save or clear the login session in browser storage.
function saveAuth(data: { role: UserRole; email: string; username: string } | null) {
  try {
    if (!data) { localStorage.removeItem(STORAGE_KEY); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

// Global auth store used by protected routes and role-based pages.
export const useAuthStore = create<AuthState>((set) => ({
  ...loadAuth(),

  // Store the logged-in user details after a successful sign in.
  login: ({ role, email, username }) => {
    saveAuth({ role, email, username });
    set({ isAuthenticated: true, role, email, username });
  },

  // Clear the saved session when the user signs out.
  logout: () => {
    saveAuth(null);
    set({ isAuthenticated: false, role: null, email: null, username: null });
  },
}));
