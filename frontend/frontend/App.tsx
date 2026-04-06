import { Suspense } from "react";
import { Routes, Route, useLocation, Navigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import HomePage from "@/pages/HomePage";
import CartPage from "@/pages/CartPage";
import TrackingPage from "@/pages/TrackingPage";
import AdminPage from "@/pages/AdminPage";
import LoginPage from "@/pages/LoginPage";
import RequireAuth from "@/components/RequireAuth";
import { CheckoutDraft, CartItem, useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { apiGet, apiPost } from "@/lib/api";

// Shared page shell that hides the navbar on admin and login screens.
function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const isLogin = location.pathname === "/login";
  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      {!isAdmin && !isLogin && <Navbar />}
      {children}
    </div>
  );
}

// Success screen shown after PayMongo redirects back to the app.
function PaymentSuccess() {
  const [params] = useSearchParams();
  const orderId = params.get("orderId");
  const navigate = useNavigate();
  const { updatePaymentStatus } = useAppStore();

  useEffect(() => {
    if (orderId) updatePaymentStatus(orderId, "paid");
  }, [orderId]);

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-3xl p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="font-syne font-extrabold text-[#F0F4F8] text-2xl mb-2">Payment Successful! 🎉</h2>
        <p className="font-space text-[#F0F4F8]/60 text-sm mb-2">Your payment has been confirmed.</p>
        {orderId && <p className="font-syne font-bold text-amber-500 text-base mb-6">Order ID: {orderId}</p>}
        <div className="flex flex-col gap-3">
          <button onClick={() => navigate(`/track?orderId=${orderId}`)}
            className="w-full bg-amber-500 text-[#0F1C2E] font-syne font-bold py-3.5 rounded-xl hover:bg-amber-400 transition-colors">
            Track My Order
          </button>
          <button onClick={() => navigate("/home")}
            className="w-full border border-white/10 text-[#F0F4F8]/70 font-space py-3.5 rounded-xl hover:bg-white/5 transition-colors">
            Continue Shopping
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Failure screen shown when an online payment does not go through.
function PaymentFailed() {
  const [params] = useSearchParams();
  const orderId = params.get("orderId");
  const navigate = useNavigate();
  const { updatePaymentStatus } = useAppStore();

  useEffect(() => {
    if (orderId) updatePaymentStatus(orderId, "unpaid");
  }, [orderId]);

  return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-3xl p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="font-syne font-extrabold text-[#F0F4F8] text-2xl mb-2">Payment Failed 😞</h2>
        <p className="font-space text-[#F0F4F8]/60 text-sm mb-6">Something went wrong with your payment. Please try again.</p>
        <div className="flex flex-col gap-3">
          <button onClick={() => navigate("/cart")}
            className="w-full bg-amber-500 text-[#0F1C2E] font-syne font-bold py-3.5 rounded-xl hover:bg-amber-400 transition-colors">
            Try Again
          </button>
          <button onClick={() => navigate("/home")}
            className="w-full border border-white/10 text-[#F0F4F8]/70 font-space py-3.5 rounded-xl hover:bg-white/5 transition-colors">
            Go Home
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const DEFAULT_SHOP_SETTINGS = {
  businessName: "AguasShop",
  shippingFee: 50,
  currency: "PHP",
  currencySymbol: "₱",
};

const DEFAULT_CHECKOUT_DRAFT: CheckoutDraft = {
  customerName: "",
  address: "",
  phone: "",
  notes: "",
  paymentMethod: "cash_on_delivery",
};

// Compare shop settings so sync only runs when values are really different.
function shopSettingsMatch(left: typeof DEFAULT_SHOP_SETTINGS, right: typeof DEFAULT_SHOP_SETTINGS) {
  return (
    left.businessName === right.businessName
    && Number(left.shippingFee) === Number(right.shippingFee)
    && left.currency === right.currency
    && left.currencySymbol === right.currencySymbol
  );
}

// Read the last saved shop settings from browser storage.
function readCachedShopSettings() {
  try {
    const raw = localStorage.getItem("aq_settings");
    return raw ? JSON.parse(raw) : DEFAULT_SHOP_SETTINGS;
  } catch {
    return DEFAULT_SHOP_SETTINGS;
  }
}

// Convert the backend cart payload into safe frontend defaults.
function normalizeServerCart(payload: unknown): { items: CartItem[]; checkoutDraft: CheckoutDraft } {
  const source = (typeof payload === "object" && payload) ? payload as Record<string, unknown> : {};
  const checkoutSource = (typeof source.checkoutDraft === "object" && source.checkoutDraft)
    ? source.checkoutDraft as Record<string, unknown>
    : {};

  return {
    items: Array.isArray(source.items) ? source.items as CartItem[] : [],
    checkoutDraft: {
      customerName: typeof checkoutSource.customerName === "string" ? checkoutSource.customerName : DEFAULT_CHECKOUT_DRAFT.customerName,
      address: typeof checkoutSource.address === "string" ? checkoutSource.address : DEFAULT_CHECKOUT_DRAFT.address,
      phone: typeof checkoutSource.phone === "string" ? checkoutSource.phone : DEFAULT_CHECKOUT_DRAFT.phone,
      notes: typeof checkoutSource.notes === "string" ? checkoutSource.notes : DEFAULT_CHECKOUT_DRAFT.notes,
      paymentMethod: checkoutSource.paymentMethod === "online_payment" ? "online_payment" : DEFAULT_CHECKOUT_DRAFT.paymentMethod,
    },
  };
}

// Create a stable snapshot string so cart sync can detect real changes.
function serializeCartState(items: CartItem[], checkoutDraft: CheckoutDraft) {
  return JSON.stringify({ items, checkoutDraft });
}

// Main app component that wires routes plus shared settings and cart sync.
function App() {
  // Refs used to control one-time sync behavior with shared backend data.
  const hasTriedLegacySettingsSeed = useRef(false);
  const hasLoadedServerCart = useRef(false);
  const isApplyingServerCart = useRef(false);
  const lastCartSnapshot = useRef("");
  const latestCartItems = useRef<CartItem[]>([]);
  const latestCheckoutDraft = useRef<CheckoutDraft>(DEFAULT_CHECKOUT_DRAFT);
  const latestLocalCartSnapshot = useRef("");
  // Current session info used to decide when to sync customer-only data.
  const { email, role } = useAuthStore((state) => ({
    email: state.email,
    role: state.role,
  }));
  // Global store actions and values shared across pages.
  const {
    setStoreStatus,
    updateSettings,
    cartItems,
    checkoutDraft,
    setCartItems,
    setCheckoutDraft,
    clearCheckoutDraft,
  } = useAppStore((state) => ({
    setStoreStatus: state.setStoreStatus,
    updateSettings: state.updateSettings,
    cartItems: state.cartItems,
    checkoutDraft: state.checkoutDraft,
    setCartItems: state.setCartItems,
    setCheckoutDraft: state.setCheckoutDraft,
    clearCheckoutDraft: state.clearCheckoutDraft,
  }));

  // Keep the newest local cart snapshot so delayed server responses do not wipe active typing.
  useEffect(() => {
    latestCartItems.current = cartItems;
    latestCheckoutDraft.current = checkoutDraft;
    latestLocalCartSnapshot.current = serializeCartState(cartItems, checkoutDraft);
  }, [cartItems, checkoutDraft]);

  // Push the latest cart and checkout draft to the backend.
  const syncCartToServer = async (
    customerEmail: string,
    items: CartItem[] = latestCartItems.current,
    draft: CheckoutDraft = latestCheckoutDraft.current,
  ) => {
    const res = await apiPost('/api/orders/cart/sync/', {
      email: customerEmail,
      items,
      checkoutDraft: draft,
    });

    if (!res.ok || !res.data.cart) {
      return null;
    }

    const serverCart = normalizeServerCart(res.data.cart);
    lastCartSnapshot.current = serializeCartState(serverCart.items, serverCart.checkoutDraft);
    return serverCart;
  };

  useEffect(() => {
    let isMounted = true;

    // Pull the latest store status and shop settings from the backend.
    const refreshSharedStoreConfig = async () => {
      const res = await apiGet('/api/orders/store-status/');
      if (!isMounted || !res.ok) return;
      if (res.data.store) setStoreStatus(res.data.store);

      const serverSettings = res.data.settings;
      if (!serverSettings) return;

      if (!hasTriedLegacySettingsSeed.current) {
        hasTriedLegacySettingsSeed.current = true;

        const cachedSettings = readCachedShopSettings();
        const shouldSeedLegacySettings = (
          !shopSettingsMatch(cachedSettings, DEFAULT_SHOP_SETTINGS)
          && shopSettingsMatch(serverSettings, DEFAULT_SHOP_SETTINGS)
        );

        if (shouldSeedLegacySettings) {
          const seedRes = await apiPost('/api/orders/store-status/update/', cachedSettings);
          if (seedRes.ok && seedRes.data.settings) {
            if (seedRes.data.store) setStoreStatus(seedRes.data.store);
            updateSettings(seedRes.data.settings);
            return;
          }
        }
      }

      updateSettings(serverSettings);
    };

    // Refresh shared data when the user returns to this browser window.
    const handleFocus = () => {
      void refreshSharedStoreConfig();
    };

    // Refresh shared data when the hidden tab becomes visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshSharedStoreConfig();
      }
    };

    void refreshSharedStoreConfig();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshSharedStoreConfig();
      }
    }, 5000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setStoreStatus, updateSettings]);

  useEffect(() => {
    if (!email || role !== "user") {
      hasLoadedServerCart.current = false;
      isApplyingServerCart.current = false;
      lastCartSnapshot.current = "";
      latestCartItems.current = [];
      latestCheckoutDraft.current = { ...DEFAULT_CHECKOUT_DRAFT };
      latestLocalCartSnapshot.current = "";
      setCartItems([]);
      clearCheckoutDraft();
      return;
    }

    let active = true;

    // Load the logged-in customer's saved cart and checkout draft from the backend.
    const hydrateServerCart = async () => {
      const requestSnapshot = latestLocalCartSnapshot.current;
      const res = await apiGet(`/api/orders/cart/?email=${encodeURIComponent(email)}`);
      if (!active || !res.ok || !res.data.cart) return;

      const serverCart = normalizeServerCart(res.data.cart);
      const serverSnapshot = serializeCartState(serverCart.items, serverCart.checkoutDraft);
      const localSnapshot = latestLocalCartSnapshot.current;
      const hasUnsyncedLocalChanges = localSnapshot !== lastCartSnapshot.current;

      if (hasUnsyncedLocalChanges && serverSnapshot !== localSnapshot) {
        hasLoadedServerCart.current = true;
        void syncCartToServer(email, latestCartItems.current, latestCheckoutDraft.current);
        return;
      }

      if (localSnapshot !== requestSnapshot) {
        hasLoadedServerCart.current = true;
        void syncCartToServer(email, latestCartItems.current, latestCheckoutDraft.current);
        return;
      }

      isApplyingServerCart.current = true;
      setCartItems(serverCart.items);
      setCheckoutDraft(serverCart.checkoutDraft);
      lastCartSnapshot.current = serverSnapshot;
      hasLoadedServerCart.current = true;

      window.setTimeout(() => {
        isApplyingServerCart.current = false;
      }, 0);
    };

    void hydrateServerCart();

    // Refresh shared data when the user returns to this browser window.
    const handleFocus = () => {
      void hydrateServerCart();
    };

    // Refresh shared data when the hidden tab becomes visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void hydrateServerCart();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [email, role, setCartItems, setCheckoutDraft, clearCheckoutDraft]);

  useEffect(() => {
    if (!email || role !== "user" || !hasLoadedServerCart.current || isApplyingServerCart.current) {
      return;
    }

    const snapshot = serializeCartState(cartItems, checkoutDraft);
    if (snapshot === lastCartSnapshot.current) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      await syncCartToServer(email, cartItems, checkoutDraft);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [email, role, cartItems, checkoutDraft]);

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    }>
      {/* Route table for customer pages, payment redirects, and admin pages. */}
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Customer-only pages. */}
        <Route path="/home" element={<RequireAuth role="user"><Layout><HomePage /></Layout></RequireAuth>} />
        <Route path="/cart" element={<RequireAuth role="user"><Layout><CartPage /></Layout></RequireAuth>} />
        <Route path="/track" element={<RequireAuth role="user"><Layout><TrackingPage /></Layout></RequireAuth>} />

        {/* Payment result pages — no auth needed, PayMongo redirects here */}
        {/* Public payment callback pages used after PayMongo redirects. */}
        <Route path="/payment-success" element={<Layout><PaymentSuccess /></Layout>} />
        <Route path="/payment-failed" element={<Layout><PaymentFailed /></Layout>} />

        {/* Admin-only dashboard page. */}
        <Route path="/admin" element={<RequireAuth role="admin"><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
