import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ChevronDown,
  CreditCard,
  LogOut,
  MapPin,
  Package,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Truck,
  User,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { Order, useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

// Format order dates into a readable short label for history cards.
function formatOrderDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Turn backend status codes into customer-friendly words.
function humanizeStatus(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Small reusable badge for payment and delivery status labels.
function StatusBadge({ label, tone }: { label: string; tone: 'blue' | 'emerald' | 'purple' | 'red' }) {
  const tones = {
    blue: 'text-[#4A7FE0] bg-[#4A7FE0]/10 border-[#4A7FE0]/20',
    emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-space font-semibold', tones[tone])}>
      {label}
    </span>
  );
}

// Build a short summary of the products inside one order.
function summarizeItems(order: Order) {
  if (order.items.length === 0) return 'No items recorded';
  const preview = order.items
    .slice(0, 2)
    .map((item) => `${item.product.name} x${item.quantity}`)
    .join(', ');
  return order.items.length > 2 ? `${preview} +${order.items.length - 2} more` : preview;
}

// Top navigation for customer pages, cart access, and order history.
export default function Navbar() {
  // Shared customer data pulled from the global app store.
  const {
    cartItems,
    cartBounce,
    orders,
    setOrders,
    setCartItems,
    clearCart,
    settings,
    setCheckoutDraft,
    clearCheckoutDraft,
  } = useAppStore();
  // Logged-in customer info used by the navbar and order history panel.
  const { username, email, logout } = useAuthStore((s) => ({
    username: s.username,
    email: s.email,
    logout: s.logout,
  }));
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  // Local state for the profile drawer and order-history feedback.
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const sym = settings.currencySymbol;
  const displayName = username || email?.split('@')[0] || 'Profile';

  // Check that each order really belongs to the signed-in customer.
  const orderBelongsToCurrentUser = (order: Order) => {
    const owner = (order.orderedBy ?? '').trim().toLowerCase();
    const currentEmail = (email ?? '').trim().toLowerCase();
    const currentUsername = (username ?? '').trim().toLowerCase();
    const customerName = (order.customerName ?? '').trim().toLowerCase();

    if (owner) {
      return owner === currentEmail || owner === currentUsername;
    }

    return customerName === currentUsername;
  };

  const userOrders = useMemo(
    () => [...orders]
      .filter(orderBelongsToCurrentUser)
      .filter((order) => !order.customerHidden)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [orders, email, username]
  );

  useEffect(() => {
    if (!showProfilePanel) return;

    let active = true;

    // Fetch the latest orders from the backend so customer history stays updated.
    const loadUserOrders = async () => {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const res = await apiGet('/api/orders/orders/');
        if (!active) return;

        if (!res.ok || !res.data.orders) {
          setHistoryError(res.data?.error || 'Unable to load your order history right now.');
          return;
        }

        setOrders(res.data.orders);
      } catch {
        if (!active) return;
        setHistoryError('Cannot reach the server right now.');
      } finally {
        if (active) setHistoryLoading(false);
      }
    };

    void loadUserOrders();

    // Close the profile drawer when the user presses Escape.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowProfilePanel(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      active = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showProfilePanel, setOrders]);

  // Log out the current customer and return to the login page.
  const handleLogout = () => {
    clearCart();
    clearCheckoutDraft();
    setShowProfilePanel(false);
    logout();
    navigate('/login', { replace: true });
  };

  // Button for opening the tracking page of a selected order.
  const handleTrackOrder = (orderId: string) => {
    setShowProfilePanel(false);
    navigate(`/track?orderId=${orderId}`);
  };

  // Button for putting the same products back into the cart.
  const handleReorder = (order: Order) => {
    setCartItems(
      order.items.map((item) => ({
        quantity: item.quantity,
        product: { ...item.product },
      }))
    );
    setCheckoutDraft({
      customerName: order.customerName,
      address: order.address,
      phone: order.phone,
      notes: order.notes,
      paymentMethod: order.paymentMethod,
    });
    setShowProfilePanel(false);
    navigate('/cart');
  };

  // Button for hiding an order from the customer history list.
  const handleDeleteOrder = async (order: Order) => {
    if (deletingOrderId === order.id) return;

    try {
      setDeletingOrderId(order.id);
      setHistoryError(null);

      const res = await apiPost(`/api/orders/orders/${order.id}/hide/`, {
        email: email ?? '',
        username: username ?? '',
      });

      if (!res.ok || !res.data.order) {
        setHistoryError(res.data?.error || 'Unable to remove this order from your history.');
        return;
      }

      setOrders(orders.map((item) => (item.id === order.id ? res.data.order : item)));
    } catch {
      setHistoryError('Cannot reach the server right now.');
    } finally {
      setDeletingOrderId(null);
    }
  };

  return (
    <>
      {/* Main top navigation bar for customer pages. */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#DDE6F5] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/home" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-[#4A7FE0] flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <span className="font-syne font-800 text-xl font-bold text-[#1A2E4A]">
                Dali<span className="text-[#4A7FE0]">Very</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link
                to="/home"
                className={cn(
                  'font-space text-sm font-medium transition-colors duration-200',
                  location.pathname === '/home'
                    ? 'text-[#4A7FE0]'
                    : 'text-[#4A6080] hover:text-[#1A2E4A]'
                )}
              >
                Home
              </Link>
              <Link
                to="/track"
                className={cn(
                  'font-space text-sm font-medium transition-colors duration-200 flex items-center gap-1.5',
                  location.pathname === '/track'
                    ? 'text-[#4A7FE0]'
                    : 'text-[#4A6080] hover:text-[#1A2E4A]'
                )}
              >
                <MapPin className="w-3.5 h-3.5" />
                Track Order
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {displayName && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryLoading(true);
                    setHistoryError(null);
                    setShowProfilePanel(true);
                  }}
                  className="flex items-center gap-2 bg-[#4A7FE0] border border-[#4a7fe0] rounded-xl px-3 py-1.5 hover:bg-[#5B8DEF] transition-all"
                >
                  <div className="w-5 h-5 rounded-full bg-[#F0F4F8]/20 border border-[#0c0607]/30 flex items-center justify-center">
                    <User className="w-3 h-3 text-[#F0F4F8]" />
                  </div>
                  <span className="hidden sm:block font-space text-xs text-[#F0F4F8] max-w-[120px] truncate">{displayName}</span>
                  <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-[#F0F4F8]" />
                </button>
              )}

              <Link to="/cart" className="relative group">
                <div className={cn(
                  'w-10 h-10 rounded-xl bg-[#4A7FE0] border border-[#4a7fe0] flex items-center justify-center transition-all duration-200 group-hover:border-[#4A7FE0]/40 group-hover:bg-[#E5EEFF]',
                  cartBounce && 'bounce-cart'
                )}>
                  <ShoppingCart className="w-5 h-5 text-[#F0F4F8] group-hover:text-[#1A2E4A]" />
                </div>
                {cartCount > 0 && (
                  <span className={cn(
                    'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#4A7FE0] text-white text-xs font-bold flex items-center justify-center font-space',
                    cartBounce && 'bounce-cart'
                  )}>
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </Link>

              <button
                onClick={handleLogout}
                title="Logout"
                className="w-10 h-10 rounded-xl bg-[#4A7FE0] border border-[#4a7fe0] flex items-center justify-center text-[#F0F4F8] hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition-all duration-200"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {showProfilePanel && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfilePanel(false)}
              className="fixed inset-0 z-40 bg-[#1A2E4A]/10 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="fixed top-20 right-4 sm:right-6 z-50 w-[min(460px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] overflow-hidden rounded-3xl border border-[#DDE6F5] bg-white shadow-[0_24px_80px_rgba(26,46,74,0.18)]"
            >
              <div className="border-b border-[#DDE6F5] px-5 py-4 bg-[#F8FAFF]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-syne font-bold text-[#1A2E4A] text-lg">{displayName}</p>
                    <p className="font-space text-[#8A9EB8] text-xs mt-1">{email || 'Signed in customer'}</p>
                  </div>
                  <div className="rounded-2xl bg-[#4A7FE0]/10 border border-[#4A7FE0]/15 px-3 py-2 text-right">
                    <p className="font-space text-[#8A9EB8] text-[11px]">Order History</p>
                    <p className="font-syne font-bold text-[#4A7FE0] text-lg">{userOrders.length}</p>
                  </div>
                </div>
              </div>

              <div className="max-h-[calc(100vh-13rem)] overflow-y-auto p-5 space-y-4 bg-white">
                {historyLoading && (
                  <div className="rounded-2xl border border-[#DDE6F5] bg-[#F8FAFF] p-5 text-center">
                    <div className="mx-auto mb-3 h-8 w-8 rounded-full border-2 border-[#4A7FE0]/20 border-t-[#4A7FE0] animate-spin" />
                    <p className="font-space text-sm text-[#4A6080]">Loading your orders...</p>
                  </div>
                )}

                {!historyLoading && historyError && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                    <p className="font-space text-sm text-red-400">{historyError}</p>
                  </div>
                )}

                {!historyLoading && !historyError && userOrders.length === 0 && (
                  <div className="rounded-2xl border border-[#DDE6F5] bg-[#F8FAFF] p-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF4FF]">
                      <Package className="h-7 w-7 text-[#4A7FE0]" />
                    </div>
                    <p className="font-syne font-bold text-[#1A2E4A] text-lg">No orders yet</p>
                    <p className="font-space text-sm text-[#8A9EB8] mt-2">Once you place an order, your history and re-order options will show up here.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfilePanel(false);
                        navigate('/home');
                      }}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#4A7FE0] px-4 py-2.5 font-space text-sm font-bold text-white hover:bg-[#5B8DEF] transition-colors"
                    >
                      Start ordering
                    </button>
                  </div>
                )}

                {!historyLoading && !historyError && userOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-[#DDE6F5] bg-[#F8FAFF] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-space text-[#8A9EB8] text-[11px] uppercase tracking-[0.18em]">Order ID</p>
                        <p className="font-syne font-bold text-[#4A7FE0] text-lg mt-1">{order.id}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 text-[#8A9EB8] text-[11px] font-space">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {formatOrderDate(order.createdAt)}
                        </div>
                        <p className="font-syne font-bold text-[#1A2E4A] text-lg mt-1">{sym}{order.total.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge
                        label={humanizeStatus(order.deliveryStatus)}
                        tone={order.deliveryStatus === 'delivered' ? 'emerald' : order.deliveryStatus === 'out_for_delivery' ? 'purple' : 'blue'}
                      />
                      <StatusBadge
                        label={humanizeStatus(order.paymentStatus)}
                        tone={order.paymentStatus === 'paid' ? 'emerald' : order.paymentStatus === 'unpaid' ? 'red' : 'blue'}
                      />
                    </div>

                    <div className="mt-4 space-y-2 rounded-2xl border border-[#DDE6F5] bg-white p-3">
                      <div className="flex items-start gap-2 text-[#4A6080]">
                        <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#4A7FE0]" />
                        <p className="font-space text-xs leading-relaxed">{summarizeItems(order)}</p>
                      </div>
                      <div className="flex items-start gap-2 text-[#4A6080]">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#4A7FE0]" />
                        <p className="font-space text-xs leading-relaxed">{order.address}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[#4A6080]">
                        {order.paymentMethod === 'online_payment' ? (
                          <CreditCard className="h-4 w-4 shrink-0 text-[#4A7FE0]" />
                        ) : (
                          <Truck className="h-4 w-4 shrink-0 text-[#4A7FE0]" />
                        )}
                        <p className="font-space text-xs">{order.paymentMethod === 'online_payment' ? 'Online Payment' : 'Cash on Delivery'}</p>
                      </div>
                    </div>

                    {/* Buttons for tracking, re-ordering, or hiding a past order. */}
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleTrackOrder(order.id)}
                        className="flex-1 rounded-xl border border-[#DDE6F5] bg-white px-3 py-2.5 font-space text-sm font-semibold text-[#4A6080] hover:border-[#C8D9F5] hover:text-[#1A2E4A] transition-all"
                      >
                        Track Order
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(order)}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#4A7FE0] px-3 py-2.5 font-space text-sm font-bold text-white hover:bg-[#5B8DEF] transition-all"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Re-order
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteOrder(order)}
                        disabled={deletingOrderId === order.id}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label={`Delete order ${order.id} from history`}
                        title="Delete from history"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
