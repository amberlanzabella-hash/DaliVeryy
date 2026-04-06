import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock3,
  CreditCard,
  MapPin,
  Package,
  Phone,
  Search,
  Truck,
  User,
} from 'lucide-react';
import { API_BASE, apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Order, OrderStatus, PaymentStatus, useAppStore } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';

// Timeline steps shown in the customer order-tracking progress bar.
const STATUS_STEPS: { key: OrderStatus; label: string; desc: string }[] = [
  { key: 'placed', label: 'Order Placed', desc: 'Your order has been received' },
  { key: 'processing', label: 'Processing', desc: 'Preparing your order for dispatch' },
  { key: 'out_for_delivery', label: 'Out for Delivery', desc: 'Your package is on the way' },
  { key: 'delivered', label: 'Delivered', desc: 'Package delivered successfully' },
];

// Format timestamps for the customer tracking page.
function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Visual badge for payment status inside tracking details.
function PaymentBadge({ status }: { status: PaymentStatus }) {
  const config = {
    paid: { label: 'Paid', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    unpaid: { label: 'Unpaid', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    pending: { label: 'Pending', color: 'text-[#4A7FE0]', bg: 'bg-[#4A7FE0]/10', border: 'border-[#4A7FE0]/30' },
  }[status];

  return <span className={cn('font-space font-semibold text-xs px-2.5 py-1 rounded-full border', config.color, config.bg, config.border)}>{config.label}</span>;
}

// Visual badge for delivery status inside tracking details.
function DeliveryBadge({ status }: { status: OrderStatus }) {
  const config = {
    placed: { label: 'Order Placed', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    processing: { label: 'Processing', color: 'text-[#4A7FE0]', bg: 'bg-[#4A7FE0]/10', border: 'border-[#4A7FE0]/30' },
    out_for_delivery: { label: 'Out for Delivery', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    delivered: { label: 'Delivered', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  }[status];

  return <span className={cn('font-space font-semibold text-xs px-3 py-1.5 rounded-full border', config.color, config.bg, config.border)}>{config.label}</span>;
}

// Step-by-step timeline that highlights the current delivery stage.
function StatusTimeline({ status }: { status: OrderStatus }) {
  const currentStep = STATUS_STEPS.findIndex((step) => step.key === status);
  const progress = currentStep <= 0 ? 0 : (currentStep / (STATUS_STEPS.length - 1)) * 100;

  return (
    <div className="relative">
      <div className="absolute top-6 left-6 right-6 h-0.5 bg-[#F0F5FF] hidden sm:block">
        <motion.div
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
          className="h-full bg-[#4A7FE0]"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0">
        {STATUS_STEPS.map((step, index) => {
          const isActive = index <= currentStep;
          const isCurrent = index === currentStep;

          return (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.15 + 0.2 }}
              className="flex flex-col items-center text-center relative z-10"
            >
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.15 + 0.3, type: 'spring', stiffness: 200 }}
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-all duration-500 relative',
                  isActive ? 'bg-[#4A7FE0] shadow-lg shadow-[#4A7FE0]/20' : 'bg-[#DDE6F5] border-2 border-[#DDE6F5]'
                )}
              >
                {isActive ? <CheckCircle className="w-6 h-6 text-white" /> : <Package className="w-6 h-6 text-white/30" />}
                {isCurrent && (
                  <motion.div
                    animate={{ scale: [1, 1.4, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 rounded-full border-2 border-[#4A7FE0]/40"
                  />
                )}
              </motion.div>

              <p className={cn('font-syne font-bold text-sm mb-1', isActive ? 'text-[#1A2E4A]' : 'text-[#9AAABB]')}>
                {step.label}
              </p>
              <p className={cn('font-space text-xs leading-tight', isActive ? 'text-[#4A6080]' : 'text-[#C0D0E0]')}>
                {step.desc}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// Detailed tracking card for the selected customer order.
function OrderTrackingCard({ order }: { order: Order }) {
  // Shared store values and order update helpers used inside one tracking card.
  const { settings, updatePaymentStatus, upsertOrder } = useAppStore();
  const sym = settings.currencySymbol;
  // Local UI state for payment recheck and delivery confirmation messages.
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const canMarkDelivered = order.deliveryStatus === 'out_for_delivery' && !order.customerMarkedDelivered;

  // Recheck the PayMongo payment status for online payment orders.
  const verifyPayment = async () => {
    if (!order.paymongoLinkId) return;

    setVerifyingPayment(true);
    setVerifyMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/payments/verify/?link_id=${order.paymongoLinkId}`);
      const data = await response.json();

      if (data.ok && data.paid) {
        updatePaymentStatus(order.id, 'paid');
        setVerifyMessage({ ok: true, text: 'Payment confirmed! Your order is now marked as paid.' });
        return;
      }

      if (data.ok && !data.paid) {
        setVerifyMessage({ ok: false, text: `Payment not yet confirmed. Status: ${data.status}` });
        return;
      }

      setVerifyMessage({ ok: false, text: data.error ?? 'Could not verify payment.' });
    } catch {
      setVerifyMessage({ ok: false, text: 'Cannot reach payment server.' });
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Let the customer confirm that the order was already received.
  const handleMarkDelivered = async () => {
    if (!canMarkDelivered || markingDelivered) return;

    setMarkingDelivered(true);
    setDeliveryMessage(null);

    try {
      const res = await apiPost(`/api/orders/orders/${order.id}/customer-delivered/`, {});

      if (!res.ok || !res.data.order) {
        setDeliveryMessage({
          ok: false,
          text: res.data?.error ?? 'Unable to confirm delivery right now.',
        });
        return;
      }

      upsertOrder(res.data.order);
      setDeliveryMessage({
        ok: true,
        text: 'Order marked as delivered. Thank you for confirming receipt.',
      });
    } catch {
      setDeliveryMessage({
        ok: false,
        text: 'Cannot reach the server right now.',
      });
    } finally {
      setMarkingDelivered(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="font-space text-[#6A8098] text-sm mb-1">Order ID</p>
            <h2 className="font-syne font-extrabold text-[#4A7FE0] text-2xl">{order.id}</h2>
          </div>
          <DeliveryBadge status={order.deliveryStatus} />
        </div>

        <StatusTimeline status={order.deliveryStatus} />
      </div>

      {order.paymentMethod === 'online_payment' && order.paymentStatus !== 'paid' && (
        <div className="glass-card rounded-2xl p-5 border border-[#4A7FE0]/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#4A7FE0]/15 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-[#4A7FE0]" />
            </div>
            <div>
              <p className="font-syne font-bold text-[#1A2E4A] text-sm">Payment Pending</p>
              <p className="font-space text-[#8A9EB8] text-xs">Already paid via PayMongo? Click below to verify.</p>
            </div>
          </div>

          {verifyMessage && (
            <div className={cn(
              'text-xs font-space px-4 py-2.5 rounded-xl mb-3 border',
              verifyMessage.ok
                ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                : 'text-red-300 bg-red-500/10 border-red-500/20'
            )}>
              {verifyMessage.text}
            </div>
          )}

          <button
            onClick={verifyPayment}
            disabled={verifyingPayment}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#4A7FE0] text-white font-syne font-bold text-sm hover:bg-[#5B8DEF] transition-all disabled:opacity-50"
          >
            {verifyingPayment ? (
              <>
                <div className="w-4 h-4 border-2 border-[#0F1C2E]/30 border-t-[#0F1C2E] rounded-full animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                I Already Paid - Verify Payment
              </>
            )}
          </button>
        </div>
      )}

      {order.paymentStatus === 'paid' && order.paymentMethod === 'online_payment' && (
        <div className="glass-card rounded-2xl p-4 border border-emerald-500/20 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="font-space text-emerald-300 text-sm font-medium">Payment confirmed via PayMongo ✓</p>
        </div>
      )}

      {canMarkDelivered && (
        <div className="glass-card rounded-2xl p-5 border border-[#4A7FE0]/20">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#4A7FE0]/15 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-[#4A7FE0]" />
            </div>
            <div>
              <p className="font-syne font-bold text-[#1A2E4A] text-sm">Received your order already?</p>
              <p className="font-space text-[#8A9EB8] text-xs">Tap the button below so your order can be marked as delivered.</p>
            </div>
          </div>

          {deliveryMessage && (
            <div
              className={cn(
                'text-xs font-space px-4 py-2.5 rounded-xl mb-3 border',
                deliveryMessage.ok
                  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-red-300 bg-red-500/10 border-red-500/20'
              )}
            >
              {deliveryMessage.text}
            </div>
          )}

          <button
            onClick={handleMarkDelivered}
            disabled={markingDelivered}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-syne font-bold text-sm hover:bg-emerald-600 transition-all disabled:opacity-50"
          >
            {markingDelivered ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Mark as Delivered
              </>
            )}
          </button>
        </div>
      )}

      {!canMarkDelivered && order.customerMarkedDelivered && order.deliveryStatus === 'delivered' && (
        <div className="glass-card rounded-2xl p-4 border border-emerald-500/20 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="font-space text-emerald-300 text-sm font-medium">You already confirmed that this order was delivered.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#4A7FE0]/20 flex items-center justify-center">
              <Clock3 className="w-5 h-5 text-[#4A7FE0]" />
            </div>
            <h3 className="font-syne font-bold text-[#1A2E4A]">Status Info</h3>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between gap-4">
              <span className="font-space text-[#6A8098] text-sm">Delivery</span>
              <DeliveryBadge status={order.deliveryStatus} />
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-space text-[#6A8098] text-sm">Payment</span>
              <PaymentBadge status={order.paymentStatus} />
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-space text-[#6A8098] text-sm">Last Updated</span>
              <span className="font-space text-[#1A2E4A] text-sm">{formatDate(order.lastUpdated)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-space text-[#6A8098] text-sm">Order Placed</span>
              <span className="font-space text-[#1A2E4A] text-sm">{formatDate(order.createdAt)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="font-space text-[#6A8098] text-sm">Est. Delivery</span>
              <span className="font-space text-[#1A2E4A] text-sm font-semibold">{order.estimatedDelivery}</span>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-syne font-bold text-[#1A2E4A]">Courier Info</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#8A9EB8]" />
              <span className="font-space text-[#1A2E4A] text-sm">{order.courierName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#8A9EB8]" />
              <span className="font-space text-[#1A2E4A] text-sm">{order.courierPhone}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Package className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="font-syne font-bold text-[#1A2E4A] text-lg">Order Details</h3>
        </div>

        <div className="space-y-3 mb-4">
          {order.items.map((item) => (
            <div key={item.product.id} className="flex items-center gap-3 py-2 border-b border-[#DDE6F5] last:border-0">
              {item.product.image ? (
                <img src={item.product.image} alt={item.product.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[#EEF4FF] flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-[#C0D0E0]" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-space font-medium text-[#1A2E4A] text-sm truncate">{item.product.name}</p>
                <p className="font-space text-[#8A9EB8] text-xs">Qty: {item.quantity}</p>
              </div>

              <span className="font-space font-bold text-[#4A7FE0] text-sm">
                {sym}{(item.product.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-[#DDE6F5]">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-[#8A9EB8]" />
              <span className="font-space text-[#6A8098] text-xs">Delivery Address</span>
            </div>
            <p className="font-space text-[#1A2E4A] text-sm">{order.address}</p>
          </div>

          <div className="text-right sm:text-left">
            <p className="font-space text-[#6A8098] text-xs mb-1">Total</p>
            <p className="font-syne font-extrabold text-[#4A7FE0] text-2xl">{sym}{order.total.toFixed(2)}</p>
            <p className="font-space text-[#8A9EB8] text-xs">inc. {sym}{order.shippingFee.toFixed(2)} shipping</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Search and tracking page for customer orders.
export default function TrackingPage() {
  // State for the searched order ID and the result visibility flags.
  const [searchParams] = useSearchParams();
  const initialOrderId = useMemo(() => (searchParams.get('orderId') || '').trim().toUpperCase(), [searchParams]);
  const [searchInput, setSearchInput] = useState(initialOrderId);
  const [activeOrderId, setActiveOrderId] = useState(initialOrderId);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const { orders, getOrderById, setOrders } = useAppStore();
  const { email, username } = useAuthStore();

  useEffect(() => {
    setSearchInput(initialOrderId);
    setActiveOrderId(initialOrderId);
    setNotFound(false);
    setUnauthorized(false);
  }, [initialOrderId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const res = await apiGet('/api/orders/orders/');
      if (mounted && res.ok && res.data.orders) {
        setOrders(res.data.orders);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [setOrders]);

  // Prevent customers from opening tracking details for other users' orders.
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

  const matchedOrder = activeOrderId ? getOrderById(activeOrderId) : undefined;
  const visibleOrder = matchedOrder && !matchedOrder.customerHidden && orderBelongsToCurrentUser(matchedOrder) ? matchedOrder : undefined;

  useEffect(() => {
    if (!activeOrderId) {
      setNotFound(false);
      setUnauthorized(false);
      return;
    }

    const order = getOrderById(activeOrderId);
    if (!order || order.customerHidden) {
      setNotFound(true);
      setUnauthorized(false);
      return;
    }

    if (!orderBelongsToCurrentUser(order)) {
      setUnauthorized(true);
      setNotFound(false);
      return;
    }

    setNotFound(false);
    setUnauthorized(false);
  }, [activeOrderId, orders, email, username, getOrderById]);

  // Search button for loading an order by its order ID.
  const handleTrack = () => {
    const normalizedOrderId = searchInput.trim().toUpperCase();
    if (!normalizedOrderId) return;

    setActiveOrderId(normalizedOrderId);

    const order = getOrderById(normalizedOrderId);
    if (!order || order.customerHidden) {
      setNotFound(true);
      setUnauthorized(false);
      return;
    }

    if (!orderBelongsToCurrentUser(order)) {
      setUnauthorized(true);
      setNotFound(false);
      return;
    }

    setNotFound(false);
    setUnauthorized(false);
  };

  // Clear the current search and return to the empty tracking state.
  const resetSearch = () => {
    setSearchInput('');
    setActiveOrderId('');
    setNotFound(false);
    setUnauthorized(false);
  };

  return (
    <div className="min-h-screen bg-[#EEF2FA] pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/home" className="w-10 h-10 rounded-xl bg-[#EEF4FF] border border-[#DDE6F5] flex items-center justify-center hover:border-[#C8D9F5] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#3A5070]" />
          </Link>
          <div>
            <h1 className="font-syne font-extrabold text-[#4A7FE0] text-3xl">Track Order</h1>
            <p className="font-space text-[#6A8098] text-sm">Enter your order ID to see the latest status</p>
          </div>
        </div>

        {/* Search card where the customer enters an order ID to track. */}
        <div className="glass-card rounded-2xl p-4 mb-8">
          <div className="flex gap-3 flex-col sm:flex-row">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9AAABB]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTrack()}
                placeholder="Enter your order ID (e.g. AQ-ABC123)"
                className="w-full bg-[#EEF2FA]/60 border border-[#DDE6F5] rounded-xl pl-12 pr-4 py-3.5 font-space text-[#1A2E4A] text-sm placeholder-[#1A2E4A]/25 outline-none focus:border-[#4A7FE0]/60 transition-colors"
              />
            </div>

            <button
              onClick={handleTrack}
              className="bg-[#4A7FE0] text-white font-syne font-bold px-6 py-3.5 rounded-xl hover:bg-[#5B8DEF] active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <Search className="w-4 h-4" />
              Track
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {visibleOrder && <OrderTrackingCard key={visibleOrder.id} order={visibleOrder} />}

          {unauthorized && (
            <motion.div
              key="unauthorized"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-card rounded-2xl p-10 text-center"
            >
              {/* Result card shown when the order exists but belongs to another user. */}
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="font-syne font-bold text-[#1A2E4A] text-xl mb-2">Access Denied</h3>
              <p className="font-space text-[#6A8098] text-sm mb-6">This order does not belong to your account.</p>
              <button onClick={resetSearch} className="font-space text-[#4A7FE0] text-sm font-medium hover:text-[#5B8DEF] transition-colors">
                Try another ID
              </button>
            </motion.div>
          )}

          {notFound && !visibleOrder && (
            <motion.div
              key="not-found"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-card rounded-2xl p-10 text-center"
            >
              {/* Result card shown when the typed order ID does not exist. */}
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="font-syne font-bold text-[#1A2E4A] text-xl mb-2">Order Not Found</h3>
              <p className="font-space text-[#6A8098] text-sm mb-6">
                No order found with ID <span className="text-red-400 font-semibold">{activeOrderId}</span>.
              </p>
              <button onClick={resetSearch} className="font-space text-[#4A7FE0] text-sm font-medium hover:text-[#5B8DEF] transition-colors">
                Try another ID
              </button>
            </motion.div>
          )}

          {!visibleOrder && !notFound && !unauthorized && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
              {/* Placeholder card shown before the customer searches for an order. */}
              <div className="w-20 h-20 rounded-2xl bg-[#EEF4FF] border border-[#DDE6F5] flex items-center justify-center mx-auto mb-5">
                <Package className="w-10 h-10 text-[#D0E0F0]" />
              </div>
              <h3 className="font-syne font-bold text-[#8A9EB8] text-xl mb-2">Enter an Order ID</h3>
              <p className="font-space text-[#B0C4D8] text-sm">Your tracking information will appear here</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
