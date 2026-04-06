import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { API_BASE, apiPost, apiGet } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
import {
  Trash2,
  Plus,
  Minus,
  ChevronRight,
  Package,
  MapPin,
  CreditCard,
  Banknote,
  X,
  CheckCircle,
  ShoppingCart,
  ArrowLeft,
} from 'lucide-react';
import { useAppStore, PaymentMethod } from '@/store/appStore';
import { cn } from '@/lib/utils';

interface OrderConfirmModalProps {
  orderId: string;
  estimatedDelivery: string;
  onClose: () => void;
  onTrack: () => void;
}

// Confirmation modal shown after a successful order placement.
function OrderConfirmModal({ orderId, estimatedDelivery, onClose, onTrack }: OrderConfirmModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-card rounded-3xl p-8 max-w-md w-full relative text-center"
        style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.6), 0 0 40px rgba(245,158,11,0.1)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-[#F4F8FF] flex items-center justify-center hover:bg-[#E5EEFF] transition-colors"
        >
          <X className="w-4 h-4 text-[#4A6080]" />
        </button>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle className="w-10 h-10 text-emerald-400" />
        </motion.div>

        <h2 className="font-syne font-extrabold text-[#1A2E4A] text-2xl mb-2">
          Order Confirmed! 🎉
        </h2>
        <p className="font-space text-[#4A6080] text-sm mb-6">
          Your order has been placed successfully
        </p>

        <div className="bg-[#EEF2FA]/60 rounded-2xl p-5 mb-6 text-left space-y-3">
          <div className="flex justify-between items-center">
            <span className="font-space text-[#6A8098] text-sm">Order ID</span>
            <span className="font-syne font-bold text-[#4A7FE0] text-base">{orderId}</span>
          </div>
          <div className="h-px bg-[#F4F8FF]" />
          <div className="flex justify-between items-center">
            <span className="font-space text-[#6A8098] text-sm">Est. Delivery</span>
            <span className="font-space font-semibold text-[#1A2E4A] text-sm">{estimatedDelivery}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={onTrack}
            className="w-full bg-[#4A7FE0] text-white font-syne font-bold py-3.5 rounded-xl hover:bg-[#5B8DEF] transition-colors flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            Track My Order
          </button>
          <button
            onClick={onClose}
            className="w-full border border-[#DDE6F5] text-[#3A5070] font-space font-medium py-3.5 rounded-xl hover:bg-[#EEF4FF] transition-colors"
          >
            Continue Shopping
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Customer cart and checkout page.
export default function CartPage() {
  // Shared cart, settings, and checkout state coming from the global store.
  const {
    cartItems,
    removeFromCart,
    updateQuantity,
    clearCart,
    clearCheckoutDraft,
    settings,
    storeStatus,
    setStoreStatus,
    products,
    setProducts,
    checkoutDraft,
    setCheckoutDraft,
  } = useAppStore();

  const sym = settings.currencySymbol;
  const navigate = useNavigate();
  // Logged-in customer email used for order ownership and cart sync.
  const { email } = useAuthStore();

  // Local state for the checkout form fields shown on this page.
  const [form, setForm] = useState({
    customerName: checkoutDraft.customerName,
    address: checkoutDraft.address,
    phone: checkoutDraft.phone,
    notes: checkoutDraft.notes,
  });
  // Local state for payment choice and UI feedback while submitting.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(checkoutDraft.paymentMethod);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<{ id: string; estimatedDelivery: string } | null>(null);

  // Helper that checks if the store can accept orders right now.
  const isStoreAvailable = (store: Record<string, unknown>) =>
    Boolean(store.isAcceptingOrders ?? store.isOpen ?? store.is_open);

  // Sync store open and close status before checkout.
  const fetchLatestStoreStatus = async () => {
    const res = await apiGet('/api/orders/store-status/');
    if (res.ok && res.data.store) {
      setStoreStatus(res.data.store);
      return res.data.store as Record<string, unknown>;
    }
    return null;
  };

  // Sync product availability before checkout.
  const fetchLatestProducts = async () => {
    const res = await apiGet('/api/products/products/');
    if (res.ok && Array.isArray(res.data.products)) {
      setProducts(res.data.products);
      return res.data.products as typeof products;
    }
    return null;
  };

  useEffect(() => {
    void fetchLatestStoreStatus();

    // Refresh store status when the user returns to this page.
    const syncStoreStatus = () => {
      void fetchLatestStoreStatus();
    };

    window.addEventListener('focus', syncStoreStatus);
    return () => window.removeEventListener('focus', syncStoreStatus);
  }, [setStoreStatus]);

  useEffect(() => {
    void fetchLatestProducts();

    // Refresh products when the user returns to this page.
    const syncProducts = () => {
      void fetchLatestProducts();
    };

    window.addEventListener('focus', syncProducts);
    return () => window.removeEventListener('focus', syncProducts);
  }, [setProducts]);

  // Derived values used by the order summary and checkout button.
  const canPlaceOrders = isStoreAvailable(storeStatus as unknown as Record<string, unknown>);
  const soldOutProductIds = new Set(products.filter((product) => product.soldOut).map((product) => product.id));
  const soldOutItems = cartItems.filter((item) => soldOutProductIds.has(item.product.id));
  const hasSoldOutItems = soldOutItems.length > 0;

  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const shippingFee = cartItems.length > 0 ? settings.shippingFee : 0;
  const total = subtotal + shippingFee;

  useEffect(() => {
    const nextForm = {
      customerName: checkoutDraft.customerName,
      address: checkoutDraft.address,
      phone: checkoutDraft.phone,
      notes: checkoutDraft.notes,
    };

    setForm((currentForm) => {
      if (
        currentForm.customerName === nextForm.customerName &&
        currentForm.address === nextForm.address &&
        currentForm.phone === nextForm.phone &&
        currentForm.notes === nextForm.notes
      ) {
        return currentForm;
      }

      return nextForm;
    });

    setPaymentMethod((currentMethod) =>
      currentMethod === checkoutDraft.paymentMethod ? currentMethod : checkoutDraft.paymentMethod
    );
  }, [checkoutDraft]);

  useEffect(() => {
    setCheckoutDraft({
      customerName: form.customerName,
      address: form.address,
      phone: form.phone,
      notes: form.notes,
      paymentMethod,
    });
  }, [form, paymentMethod, setCheckoutDraft]);

  // Validate checkout fields before placing the order.
  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.customerName.trim()) errs.customerName = 'Name is required';
    if (!form.address.trim()) errs.address = 'Address is required';
    if (!form.phone.trim()) errs.phone = 'Phone number is required';
    else if (!/^\+?[\d\s\-()]{7,}$/.test(form.phone))
      errs.phone = 'Enter a valid phone number';
    return errs;
  };

  // Submit the order and clear the saved cart when successful.
  const handleSubmit = async () => {
  const errs = validate();
  if (Object.keys(errs).length > 0) {
    setErrors(errs);
    return;
  }

  const latestProducts = await fetchLatestProducts();
  const latestSoldOutIds = new Set((latestProducts ?? products).filter((product) => product.soldOut).map((product) => product.id));
  const unavailableItems = cartItems.filter((item) => latestSoldOutIds.has(item.product.id));

  if (unavailableItems.length > 0) {
    const names = [...new Set(unavailableItems.map((item) => item.product.name))];
    alert(`These items are currently sold out: ${names.join(', ')}. Remove them from your cart first.`);
    return;
  }

  const latestStoreStatus = await fetchLatestStoreStatus();
  const effectiveStoreStatus = latestStoreStatus ?? (storeStatus as unknown as Record<string, unknown>);

  if (!isStoreAvailable(effectiveStoreStatus)) {
    alert('Store is currently closed. Ordering is unavailable right now.');
    return;
  }

  setLoading(true);

  const subtotalValue = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const shippingValue = cartItems.length > 0 ? settings.shippingFee : 0;
  const totalValue = subtotalValue + shippingValue;

  const orderPayload = {
    id: 'AQ-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
    items: cartItems,
    customerName: form.customerName,
    address: form.address,
    phone: form.phone,
    notes: form.notes,
    paymentMethod,
    paymentStatus: paymentMethod === 'online_payment' ? 'unpaid' : 'pending',
    deliveryStatus: 'placed',
    total: totalValue,
    subtotal: subtotalValue,
    shippingFee: shippingValue,
    estimatedDelivery: '2-4 hours',
    courierName: 'Assignment Pending',
    courierPhone: 'TBD',
    customerMarkedDelivered: false,
    audited: false,
    orderedBy: email ?? '',
  };

  const createRes = await apiPost('/api/orders/orders/create/', orderPayload);

  if (!createRes.ok) {
    alert(createRes.data?.error || 'Unable to place order right now.');
    setLoading(false);
    return;
  }

  if (createRes.data?.order) {
    useAppStore.getState().upsertOrder(createRes.data.order);
  }

  clearCart();
  clearCheckoutDraft();

  if (paymentMethod === 'online_payment') {
    try {
      const res = await fetch(`${API_BASE}/api/payments/create-link/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderPayload.id,
          amount: orderPayload.total,
          description: `AguasShop Order`,
        }),
      });

      const data = await res.json();

      if (data.ok) {
        useAppStore.getState().updateOrderLinkId(orderPayload.id, data.link_id);
        window.open(data.checkout_url, '_blank');
        navigate(`/track?orderId=${orderPayload.id}`);
        return;
      } else {
        alert('Payment link creation failed: ' + data.error);
      }
    } catch {
      alert('Cannot reach payment server.');
    }

    setLoading(false);
  } else {
    setLoading(false);
    setConfirmedOrder({
      id: orderPayload.id,
      estimatedDelivery: orderPayload.estimatedDelivery,
    });
  }
};

  // Empty-state screen shown when there is nothing to check out yet.
  if (cartItems.length === 0 && !confirmedOrder) {
    return (
      <div className="min-h-screen bg-[#EEF2FA] flex items-center justify-center pt-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center px-4"
        >
          <div className="w-24 h-24 rounded-full bg-[#EEF4FF] border border-[#DDE6F5] flex items-center justify-center mx-auto mb-6">
            <ShoppingCart className="w-12 h-12 text-[#C0D0E0]" />
          </div>
          <h2 className="font-syne font-extrabold text-[#1A2E4A] text-3xl mb-3">
            Your cart is empty
          </h2>
          <p className="font-space text-[#6A8098] mb-8">
            Add some delivery services to get started
          </p>
          <Link
            to="/home"
            className="inline-flex items-center gap-2 bg-[#4A7FE0] text-white font-syne font-bold px-8 py-4 rounded-2xl hover:bg-[#5B8DEF] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Browse Services
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF2FA] pt-24 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/home" className="w-10 h-10 rounded-xl bg-[#EEF4FF] border border-[#DDE6F5] flex items-center justify-center hover:border-[#C8D9F5] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#3A5070]" />
          </Link>
          <div>
            <h1 className="font-syne font-extrabold text-[#1A2E4A] text-3xl">Checkout</h1>
            <p className="font-space text-[#6A8098] text-sm">
              {cartItems.length} item{cartItems.length !== 1 ? 's' : ''} in your cart
            </p>
          </div>
        </div>

        {/* Two-column checkout layout: forms on the left, totals on the right. */}
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left: Form */}
          <div className="lg:col-span-3 space-y-6">
            {/* Order Summary */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="font-syne font-bold text-[#1A2E4A] text-xl mb-5 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#4A7FE0]" />
                Order Summary
              </h2>
              <div className="space-y-4">
                <AnimatePresence>
                  {cartItems.map((item) => {
                    const itemSoldOut = soldOutProductIds.has(item.product.id);

                    return (
                    <motion.div
                      key={item.product.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      className="flex items-center gap-4 py-3 border-b border-[#DDE6F5] last:border-0"
                    >
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-14 h-14 rounded-xl object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-space font-semibold text-[#1A2E4A] text-sm truncate">
                            {item.product.name}
                          </p>
                          {itemSoldOut && (
                            <span className="shrink-0 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[11px] font-space font-semibold text-red-500">
                              Sold Out
                            </span>
                          )}
                        </div>
                        <p className="font-space text-[#4A7FE0] text-sm font-bold">
                          {sym}{item.product.price.toFixed(2)}
                        </p>
                        {itemSoldOut && (
                          <p className="font-space text-red-500 text-xs mt-1">
                            Remove this item before placing your order.
                          </p>
                        )}
                      </div>
                      {/* Quantity Controls */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-lg bg-[#F4F8FF] flex items-center justify-center hover:bg-[#E5EEFF] transition-colors"
                        >
                          <Minus className="w-3 h-3 text-[#1A2E4A]" />
                        </button>
                        <span className="font-space font-bold text-[#1A2E4A] w-6 text-center text-sm">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          disabled={itemSoldOut}
                          className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                            itemSoldOut
                              ? 'bg-[#EEF2FA] text-[#B0C4D8] cursor-not-allowed'
                              : 'bg-[#F4F8FF] hover:bg-[#E5EEFF]'
                          )}
                        >
                          <Plus className="w-3 h-3 text-[#1A2E4A]" />
                        </button>
                      </div>
                      <div className="text-right shrink-0 w-16">
                        <p className="font-space font-bold text-[#1A2E4A] text-sm">
                         {sym}{(item.product.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors group"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* Shipping Details */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="font-syne font-bold text-[#1A2E4A] text-xl mb-5 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#4A7FE0]" />
                Shipping Details
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="font-space text-[#4A6080] text-sm mb-1.5 block">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, customerName: e.target.value }));
                      setErrors((err) => ({ ...err, customerName: '' }));
                    }}
                    placeholder="ex: Mary Aguas"
                    className={cn(
                      'w-full bg-[#EEF2FA]/60 border rounded-xl px-4 py-3 font-space text-[#1A2E4A] text-sm placeholder-[#1A2E4A]/25 outline-none transition-colors',
                      errors.customerName
                        ? 'border-red-500/60 focus:border-red-500'
                        : 'border-[#DDE6F5] focus:border-[#4A7FE0]/60'
                    )}
                  />
                  {errors.customerName && (
                    <p className="font-space text-red-400 text-xs mt-1">{errors.customerName}</p>
                  )}
                </div>

                <div>
                  <label className="font-space text-[#4A6080] text-sm mb-1.5 block">
                    Delivery Address *
                  </label>
                  <textarea
                    value={form.address}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, address: e.target.value }));
                      setErrors((err) => ({ ...err, address: '' }));
                    }}
                    placeholder="123 Main Street, City, State, ZIP"
                    rows={3}
                    className={cn(
                      'w-full bg-[#EEF2FA]/60 border rounded-xl px-4 py-3 font-space text-[#1A2E4A] text-sm placeholder-[#1A2E4A]/25 outline-none transition-colors resize-none',
                      errors.address
                        ? 'border-red-500/60 focus:border-red-500'
                        : 'border-[#DDE6F5] focus:border-[#4A7FE0]/60'
                    )}
                  />
                  {errors.address && (
                    <p className="font-space text-red-400 text-xs mt-1">{errors.address}</p>
                  )}
                </div>

                <div>
                  <label className="font-space text-[#4A6080] text-sm mb-1.5 block">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, phone: e.target.value }));
                      setErrors((err) => ({ ...err, phone: '' }));
                    }}
                    placeholder="(+63) 917 123 4567"
                    className={cn(
                      'w-full bg-[#EEF2FA]/60 border rounded-xl px-4 py-3 font-space text-[#1A2E4A] text-sm placeholder-[#1A2E4A]/25 outline-none transition-colors',
                      errors.phone
                        ? 'border-red-500/60 focus:border-red-500'
                        : 'border-[#DDE6F5] focus:border-[#4A7FE0]/60'
                    )}
                  />
                  {errors.phone && (
                    <p className="font-space text-red-400 text-xs mt-1">{errors.phone}</p>
                  )}
                </div>

                <div>
                  <label className="font-space text-[#4A6080] text-sm mb-1.5 block">
                    Delivery Notes (optional)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Leave at the door, ring the bell, etc."
                    rows={2}
                    className="w-full bg-[#EEF2FA]/60 border border-[#DDE6F5] focus:border-[#4A7FE0]/60 rounded-xl px-4 py-3 font-space text-[#1A2E4A] text-sm placeholder-[#1A2E4A]/25 outline-none transition-colors resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="font-syne font-bold text-[#1A2E4A] text-xl mb-5 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#4A7FE0]" />
                Payment Method
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    value: 'cash_on_delivery' as PaymentMethod,
                    label: 'Cash on Delivery',
                    desc: 'Pay when your order arrives',
                    icon: Banknote,
                  },
                  {
                    value: 'online_payment' as PaymentMethod,
                    label: 'Online Payment',
                    desc: 'Secure card or bank payment',
                    icon: CreditCard,
                  },
                ].map((method) => (
                  <button
                    key={method.value}
                    onClick={() => setPaymentMethod(method.value)}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 text-left',
                      paymentMethod === method.value
                        ? 'border-[#4A7FE0]/60 bg-[#4A7FE0]/10'
                        : 'border-[#DDE6F5] bg-[#F7FAFF] hover:border-[#C8D9F5]'
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        paymentMethod === method.value
                          ? 'bg-[#4A7FE0]/20'
                          : 'bg-[#F4F8FF]'
                      )}
                    >
                      <method.icon
                        className={cn(
                          'w-5 h-5',
                          paymentMethod === method.value ? 'text-[#4A7FE0]' : 'text-[#6A8098]'
                        )}
                      />
                    </div>
                    <div>
                      <p
                        className={cn(
                          'font-space font-semibold text-sm',
                          paymentMethod === method.value ? 'text-[#1A2E4A]' : 'text-[#3A5070]'
                        )}
                      >
                        {method.label}
                      </p>
                      <p className="font-space text-[#8A9EB8] text-xs mt-0.5">{method.desc}</p>
                    </div>
                    {paymentMethod === method.value && (
                      <div className="ml-auto w-5 h-5 rounded-full bg-[#4A7FE0] flex items-center justify-center shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-[#EEF2FA]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Cost Summary */}
          <div className="lg:col-span-2">
            {/* Sticky cost summary card that stays visible while the customer scrolls. */}
            <div className="glass-card rounded-2xl p-6 sticky top-24">
              <h2 className="font-syne font-bold text-[#1A2E4A] text-xl mb-5">
                Order Total
              </h2>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="font-space text-[#4A6080] text-sm">Subtotal</span>
                  <span className="font-space text-[#1A2E4A] text-sm font-medium">
                    {sym}{subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-space text-[#4A6080] text-sm">Shipping Fee</span>
                  <span className="font-space text-[#1A2E4A] text-sm font-medium">
                   {sym}{shippingFee.toFixed(2)}
                  </span>
                </div>
                <div className="h-px bg-[#F0F5FF]" />
                <div className="flex justify-between">
                  <span className="font-syne font-bold text-[#1A2E4A]">Total</span>
                  <span className="font-syne font-extrabold text-[#4A7FE0] text-xl">
                    {sym}{total.toFixed(2)}
                  </span>
                </div>
              </div>

              {hasSoldOutItems && (
                <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                  <p className="font-space text-red-500 text-sm font-semibold">
                    Some items in your cart are sold out. Remove them first to continue.
                  </p>
                </div>
              )}

              {/* Button for submitting the customer checkout form. */}
              <button
                onClick={handleSubmit}
                disabled={loading || cartItems.length === 0 || !canPlaceOrders || hasSoldOutItems}
                className={cn(
                  'w-full py-4 rounded-xl font-syne font-bold text-base transition-all duration-200 flex items-center justify-center gap-2',
                  loading || !canPlaceOrders || hasSoldOutItems
                    ? 'bg-[#4A7FE0]/50 text-white/60 cursor-not-allowed'
                    : 'bg-[#4A7FE0] text-white hover:bg-[#5B8DEF] active:scale-95 glow-blue'
                )}
              >
                {loading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-[#0F1C2E]/30 border-t-[#0F1C2E] rounded-full"
                    />
                    Processing...
                  </>
                ) : (
                  <>
                    Place Order
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <p className="font-space text-[#9AAABB] text-xs text-center mt-4">
                By placing your order, you agree to our Terms of Service
              </p>

              {/* Summary Items */}
              {cartItems.length > 0 && (
                <div className="mt-6 pt-6 border-t border-[#DDE6F5] space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.product.id} className="flex justify-between items-center gap-3">
                      <span className="font-space text-[#6A8098] text-xs truncate max-w-[60%]">
                        {item.product.name} ×{item.quantity}
                        {soldOutProductIds.has(item.product.id) ? ' • Sold Out' : ''}
                      </span>
                      <span className="font-space text-[#3A5070] text-xs font-medium">
                        {sym}{item.product.price.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmedOrder && (
          <OrderConfirmModal
            orderId={confirmedOrder.id}
            estimatedDelivery={confirmedOrder.estimatedDelivery}
            onClose={() => {
              setConfirmedOrder(null);
              navigate('/home');
            }}
            onTrack={() => {
              navigate(`/track?orderId=${confirmedOrder.id}`);
              setConfirmedOrder(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

