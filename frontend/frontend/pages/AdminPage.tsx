import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Users, Settings, X, Filter, ChevronUp, ChevronDown, Eye,
  MapPin, Phone, Clock, Truck, CreditCard, CheckCircle, TrendingUp,
  DollarSign, LogOut, UserCog, Lock, ShieldCheck, Plus, Pencil, Trash2,
  ImageIcon, Save, CalendarDays,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, AuditRecord, Order, OrderStatus, PaymentStatus, Product, ShopSettings } from '@/store/appStore';
import { useAuthStore } from '@/store/authStore';
import { API_BASE, apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';

type AdminView = 'orders' | 'customers' | 'products' | 'settings' | 'registered_users' | 'audit' | 'sales';
type SortKey = 'id' | 'customerName' | 'total' | 'paymentStatus' | 'deliveryStatus' | 'createdAt';
type SortDir = 'asc' | 'desc';

const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  businessName: 'AguasShop',
  shippingFee: 50,
  currency: 'PHP',
  currencySymbol: '\u20b1',
};

// Compare two settings objects before deciding whether a sync is needed.
function shopSettingsMatch(left: ShopSettings, right: ShopSettings) {
  return (
    left.businessName === right.businessName
    && Number(left.shippingFee) === Number(right.shippingFee)
    && left.currency === right.currency
    && left.currencySymbol === right.currencySymbol
  );
}

// Reusable payment status badge for the admin dashboard.
function PaymentBadge({ status }: { status: PaymentStatus }) {
  const config = {
    paid: { label: 'Paid', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    unpaid: { label: 'Unpaid', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    pending: { label: 'Pending', color: 'text-[#4A7FE0]', bg: 'bg-[#4A7FE0]/10', border: 'border-[#4A7FE0]/30' },
  };
  const c = config[status];
  return <span className={cn('font-space font-semibold text-xs px-2.5 py-1 rounded-full border', c.color, c.bg, c.border)}>{c.label}</span>;
}

// Reusable delivery status badge for the admin dashboard.
function DeliveryBadge({ status }: { status: OrderStatus }) {
  const config = {
    placed: { label: 'Placed', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    processing: { label: 'Processing', color: 'text-[#4A7FE0]', bg: 'bg-[#4A7FE0]/10', border: 'border-[#4A7FE0]/30' },
    out_for_delivery: { label: 'Out for Delivery', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    delivered: { label: 'Delivered', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  };
  const c = config[status];
  return <span className={cn('font-space font-semibold text-xs px-2.5 py-1 rounded-full border', c.color, c.bg, c.border)}>{c.label}</span>;
}

// Format timestamps into a readable admin date and time.
function formatDate(isoString: string) {
  return new Date(isoString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Convert string or Date inputs into a normalized Date object.
function parseDateValue(value: string | Date) {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

// Prepare a local YYYY-MM-DD string for date input fields.
function toLocalDateInputValue(value: string | Date = new Date()) {
  const date = parseDateValue(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Build a comparable local date key for grouping audit data.
function getOrderDateKey(dateString: string) {
  return toLocalDateInputValue(dateString);
}

// Create a friendly label for an audit record date.
function formatAuditLabel(dateString: string) {
  if (!dateString) return 'Select a date';
  return parseDateValue(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Calculate audit totals from the orders of one chosen day.
function buildAuditSnapshot(orders: Order[], auditDate: string) {
  const normalizedAuditDate = auditDate || toLocalDateInputValue(new Date());
  const dateOrders = orders.filter((order) => getOrderDateKey(order.createdAt) === normalizedAuditDate);

  return {
    auditDate: normalizedAuditDate,
    label: formatAuditLabel(normalizedAuditDate),
    revenue: dateOrders.filter((order) => order.paymentStatus === 'paid').reduce((sum, order) => sum + order.total, 0),
    totalOrders: dateOrders.length,
    paidOrders: dateOrders.filter((order) => order.paymentStatus === 'paid').length,
    deliveredOrders: dateOrders.filter((order) => order.deliveryStatus === 'delivered').length,
    pendingOrders: dateOrders.filter((order) => order.deliveryStatus !== 'delivered').length,
  };
}

// Small toast message used for save and delete feedback.
function ToastMessage({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="fixed top-5 right-5 z-[100] rounded-2xl bg-[#1A2E4A] text-white px-4 py-3 shadow-xl border border-white/10"
    >
      <p className="font-space text-sm font-medium">{text}</p>
    </motion.div>
  );
}

// Sliding panel for viewing and updating one selected order.
function OrderDrawer({ order, onClose, onUpdatePayment, onUpdateDelivery, onUpdateCourier, settings }: {
  order: Order; onClose: () => void;
  onUpdatePayment: (s: PaymentStatus) => void | Promise<void>;
  onUpdateDelivery: (s: OrderStatus) => void | Promise<void>;
  onUpdateCourier: (name: string, phone: string) => void | Promise<void>;
  settings: { currencySymbol: string };
}) {
  const sym = settings.currencySymbol;
  const [courierName, setCourierName] = useState(order.courierName || '');
  const [courierPhone, setCourierPhone] = useState(order.courierPhone || '');
  const [courierSaved, setCourierSaved] = useState(false);

  useEffect(() => {
    setCourierName(order.courierName || '');
    setCourierPhone(order.courierPhone || '');
  }, [order]);

  // Save the courier name and phone number for the selected order.
  const handleSaveCourier = async () => {
    await onUpdateCourier(courierName, courierPhone);
    setCourierSaved(true);
    setTimeout(() => setCourierSaved(false), 2000);
  };

  const deliveryStages: { value: OrderStatus; label: string }[] = [
    { value: 'placed', label: 'Placed' },
    { value: 'processing', label: 'Processing' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
    { value: 'delivered', label: 'Delivered' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-md h-full bg-[#F8FAFF] border-l border-[#DDE6F5] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#F8FAFF]/95 backdrop-blur-md border-b border-[#DDE6F5] p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">Order {order.id}</h2>
            <p className="font-space text-[#8A9EB8] text-xs mt-0.5">{formatDate(order.createdAt)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#F4F8FF] hover:bg-[#E5EEFF] flex items-center justify-center text-[#4A6080] hover:text-[#1A2E4A] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="bg-[#F4F8FF] rounded-2xl p-4 space-y-3">
            <h3 className="font-space font-semibold text-[#4A6080] text-xs uppercase tracking-wider">Customer</h3>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#4A7FE0]/20 flex items-center justify-center">
                <span className="font-syne font-bold text-[#4A7FE0] text-xs">{order.customerName[0]}</span>
              </div>
              <span className="font-space text-[#1A2E4A] text-sm font-medium">{order.customerName}</span>
            </div>
            <div className="flex items-start gap-2 text-[#4A6080]"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span className="font-space text-xs">{order.address}</span></div>
            <div className="flex items-center gap-2 text-[#4A6080]"><Phone className="w-3.5 h-3.5" /><span className="font-space text-xs">{order.phone}</span></div>
            {order.notes && <div className="flex items-start gap-2 text-[#4A6080]"><Clock className="w-3.5 h-3.5 mt-0.5" /><span className="font-space text-xs italic">{order.notes}</span></div>}
          </div>

          <div className="bg-[#F4F8FF] rounded-2xl p-4 space-y-3">
            <h3 className="font-space font-semibold text-[#4A6080] text-xs uppercase tracking-wider">Items</h3>
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="font-space text-[#1A2E4A] text-sm">{item.product.name} × {item.quantity}</span>
                <span className="font-syne font-bold text-[#4A7FE0] text-sm">{sym}{(item.product.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t border-[#DDE6F5] pt-3 space-y-1.5">
              <div className="flex justify-between text-xs font-space text-[#6A8098]"><span>Subtotal</span><span>{sym}{order.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs font-space text-[#6A8098]"><span>Shipping</span><span>{sym}{order.shippingFee.toFixed(2)}</span></div>
              <div className="flex justify-between font-syne font-bold text-[#1A2E4A]"><span>Total</span><span className="text-[#4A7FE0]">{sym}{order.total.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="bg-[#F4F8FF] rounded-2xl p-4 space-y-3">
            <h3 className="font-space font-semibold text-[#4A6080] text-xs uppercase tracking-wider">Payment Status</h3>
            <div className="flex gap-2 flex-wrap">
              {(['paid', 'unpaid', 'pending'] as PaymentStatus[]).map((s) => (
                <button key={s} onClick={() => onUpdatePayment(s)}
                  className={cn('px-3 py-1.5 rounded-xl text-xs font-space font-medium border transition-all capitalize',
                    order.paymentStatus === s ? 'bg-[#4A7FE0] text-white border-[#4A7FE0]' : 'bg-transparent text-[#6A8098] border-[#DDE6F5] hover:border-[#C8D9F5]')}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#F4F8FF] rounded-2xl p-4 space-y-3">
            <h3 className="font-space font-semibold text-[#4A6080] text-xs uppercase tracking-wider">Delivery Status</h3>
            <div className="space-y-2">
              {deliveryStages.map((stage, i) => {
                const currentIndex = deliveryStages.findIndex((s) => s.value === order.deliveryStatus);
                const isActive = i === currentIndex;
                const isDone = i < currentIndex;
                return (
                  <button key={stage.value} onClick={() => onUpdateDelivery(stage.value)}
                    className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left',
                      isActive ? 'bg-[#4A7FE0]/15 border-[#4A7FE0]/30 text-[#4A7FE0]' :
                      isDone ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                      'bg-transparent border-[#DDE6F5] text-[#8A9EB8] hover:border-[#DDE6F5]')}>
                    <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                      isActive ? 'border-[#4A7FE0] bg-[#4A7FE0]' : isDone ? 'border-emerald-400 bg-emerald-400' : 'border-[#C8D9F5]')}>
                      {(isActive || isDone) && <div className="w-2 h-2 rounded-full bg-[#F8FAFF]" />}
                    </div>
                    <span className="font-space text-sm font-medium">{stage.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#F4F8FF] rounded-2xl p-4 space-y-3">
            <h3 className="font-space font-semibold text-[#4A6080] text-xs uppercase tracking-wider">Courier Info</h3>
            <div className="flex items-center gap-2 bg-white border border-[#DDE6F5] rounded-xl px-3 py-2.5 focus-within:border-[#4A7FE0]/40 transition-colors">
              <Truck className="w-3.5 h-3.5 text-[#8A9EB8] shrink-0" />
              <input
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                placeholder="Courier name"
                className="flex-1 bg-transparent outline-none text-sm text-[#1A2E4A] font-space placeholder:text-[#B0C4D8]"
              />
            </div>
            <div className="flex items-center gap-2 bg-white border border-[#DDE6F5] rounded-xl px-3 py-2.5 focus-within:border-[#4A7FE0]/40 transition-colors">
              <Phone className="w-3.5 h-3.5 text-[#8A9EB8] shrink-0" />
              <input
                value={courierPhone}
                onChange={(e) => setCourierPhone(e.target.value)}
                placeholder="Courier phone number"
                className="flex-1 bg-transparent outline-none text-sm text-[#1A2E4A] font-space placeholder:text-[#B0C4D8]"
              />
            </div>
            <button
              onClick={handleSaveCourier}
              className={cn(
                'w-full py-2.5 rounded-xl font-space font-bold text-sm transition-all flex items-center justify-center gap-2',
                courierSaved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[#4A7FE0] text-white hover:bg-[#5B8DEF]'
              )}>
              <Save className="w-4 h-4" />
              {courierSaved ? 'Saved!' : 'Save Courier Info'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Modal for adding a new product or editing an existing one.
function ProductFormModal({ product, onClose, onSave }: {
  product?: Product; onClose: () => void;
  onSave: (data: Omit<Product, 'id'>) => void | Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product?.price?.toString() ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [badge, setBadge] = useState(product?.badge ?? '');
  const [image, setImage] = useState(product?.image ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the chosen product image as base64 so it can be previewed and saved.
  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Save the product form values through the admin page callback.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !price || !description.trim() || !category.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Invalid price.');
      return;
    }

    try {
      setSaving(true);
      await onSave({
        name: name.trim(),
        price: parsedPrice,
        description: description.trim(),
        category: category.trim(),
        badge: badge.trim() || undefined,
        image,
      });
    } finally {
      setSaving(false);
    
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg bg-[#F8FAFF] border border-[#DDE6F5] rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#F4F8FF] hover:bg-[#E5EEFF] flex items-center justify-center text-[#4A6080] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Product Photo</label>
            <div onClick={() => fileRef.current?.click()}
              className="w-full h-36 rounded-2xl border-2 border-dashed border-[#DDE6F5] hover:border-[#4A7FE0]/40 flex items-center justify-center cursor-pointer transition-all overflow-hidden relative">
              {image ? (
                <img src={image} alt="preview" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-[#9AAABB]">
                  <ImageIcon className="w-8 h-8" />
                  <span className="font-space text-xs">Click to upload photo</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
            {image && <button type="button" onClick={() => setImage('')} className="mt-1 text-xs font-space text-red-400 hover:text-red-300">Remove photo</button>}
          </div>
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Product Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 5-Gallon Water Refill"
              className="w-full bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 text-sm text-[#1A2E4A] font-space outline-none focus:border-[#4A7FE0]/40 placeholder:text-[#B0C4D8]" />
          </div>
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Price *</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00"
              className="w-full bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 text-sm text-[#1A2E4A] font-space outline-none focus:border-[#4A7FE0]/40 placeholder:text-[#B0C4D8]" />
          </div>
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Category * <span className="text-[#8A9EB8]">(ex: Rice meals, Drinks, Snacks, Desserts)</span></label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Standard"
              className="w-full bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 text-sm text-[#1A2E4A] font-space outline-none focus:border-[#4A7FE0]/40 placeholder:text-[#B0C4D8]" />
          </div>
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Describe the product or service..."
              className="w-full bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 text-sm text-[#1A2E4A] font-space outline-none focus:border-[#4A7FE0]/40 placeholder:text-[#B0C4D8] resize-none" />
          </div>
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Badge <span className="text-[#8A9EB8]">(optional — e.g. Popular, New)</span></label>
            <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="e.g. Best Seller"
              className="w-full bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 text-sm text-[#1A2E4A] font-space outline-none focus:border-[#4A7FE0]/40 placeholder:text-[#B0C4D8]" />
          </div>
          {error && <div className="text-xs font-space text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-2xl border border-[#DDE6F5] font-space text-sm text-[#4A6080] hover:text-[#1A2E4A] hover:border-[#C8D9F5] transition-all">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-2xl bg-[#4A7FE0] text-white font-space font-bold text-sm hover:bg-[#5B8DEF] disabled:opacity-70 transition-all flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : product ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// Modal for creating or editing a daily audit summary.
function AuditModal({ sym, initialAudit, todayStats, orders, onClose, onSave }: {
  sym: string;
  initialAudit?: AuditRecord | null;
  todayStats: { revenue: number; totalOrders: number; paidOrders: number; deliveredOrders: number; pendingOrders: number; auditDate: string; label: string };
  orders: Order[];
  onClose: () => void;
  onSave: (data: { auditDate: string; label: string; totalRevenue: number; expense: number; totalOrders: number; paidOrders: number; deliveredOrders: number; pendingOrders: number }) => void;
}) {
  const [form, setForm] = useState({
    auditDate: initialAudit?.auditDate ? initialAudit.auditDate.slice(0, 10) : todayStats.auditDate.slice(0, 10),
    totalRevenue: initialAudit?.totalRevenue ?? todayStats.revenue,
    totalOrders: initialAudit?.totalOrders ?? todayStats.totalOrders,
    paidOrders: initialAudit?.paidOrders ?? todayStats.paidOrders,
    deliveredOrders: initialAudit?.deliveredOrders ?? todayStats.deliveredOrders,
    pendingOrders: initialAudit?.pendingOrders ?? todayStats.pendingOrders,
    expense: initialAudit?.expense ?? 0,
  });

  const computedSnapshot = useMemo(() => {
    if (initialAudit) return null;
    return buildAuditSnapshot(orders, form.auditDate);
  }, [form.auditDate, initialAudit, orders]);

  useEffect(() => {
    if (!computedSnapshot) return;

    setForm((prev) => {
      const nextForm = {
        ...prev,
        auditDate: computedSnapshot.auditDate,
        totalRevenue: computedSnapshot.revenue,
        totalOrders: computedSnapshot.totalOrders,
        paidOrders: computedSnapshot.paidOrders,
        deliveredOrders: computedSnapshot.deliveredOrders,
        pendingOrders: computedSnapshot.pendingOrders,
      };

      const didChange =
        prev.auditDate !== nextForm.auditDate ||
        prev.totalRevenue !== nextForm.totalRevenue ||
        prev.totalOrders !== nextForm.totalOrders ||
        prev.paidOrders !== nextForm.paidOrders ||
        prev.deliveredOrders !== nextForm.deliveredOrders ||
        prev.pendingOrders !== nextForm.pendingOrders;

      return didChange ? nextForm : prev;
    });
  }, [computedSnapshot]);

  const canSaveAudit = Boolean(form.auditDate);
  const netRevenue = Math.max(0, form.totalRevenue - form.expense);
  const fields = [
    { key: 'totalRevenue', label: 'Revenue', prefix: sym },
    { key: 'totalOrders', label: 'Total Orders' },
    { key: 'paidOrders', label: 'Paid Orders' },
    { key: 'deliveredOrders', label: 'Delivered Orders' },
    { key: 'pendingOrders', label: 'Pending Orders' },
  ] as const;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-[#F8FAFF] border border-[#DDE6F5] rounded-3xl p-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">{initialAudit ? 'Edit Audit' : 'Create Audit'}</h2>
            <p className="font-space text-[#8A9EB8] text-xs mt-1">{formatAuditLabel(form.auditDate)} summary snapshot</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#F4F8FF] hover:bg-[#E5EEFF] flex items-center justify-center text-[#4A6080] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Audit Date</label>
            <div className="flex items-center gap-2 bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 focus-within:border-[#4A7FE0]/40">
              <CalendarDays className="w-4 h-4 text-[#6A8098]" />
              <input type="date" value={form.auditDate} onChange={(e) => setForm((prev) => ({ ...prev, auditDate: e.target.value }))}
                className="w-full bg-transparent outline-none text-sm text-[#1A2E4A] font-space" />
            </div>
            <p className="font-space text-[#8A9EB8] text-[11px] mt-1">When you change the day, the summary will automatically adjust..</p>
          </div>
          <div className="bg-[#F4F8FF] border border-[#DDE6F5] rounded-2xl p-4 flex flex-col justify-center">
            <p className="font-space text-[#8A9EB8] text-xs">Audit Label Preview</p>
            <p className="font-syne font-bold text-[#1A2E4A] text-lg mt-1">{formatAuditLabel(form.auditDate)}</p>
            <p className="font-space text-[#8A9EB8] text-[11px] mt-1">This is what will appear on the audit history page.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Revenue', value: `${sym}${form.totalRevenue.toFixed(2)}` },
            { label: 'Orders', value: form.totalOrders },
            { label: 'Paid', value: form.paidOrders },
            { label: 'Delivered', value: form.deliveredOrders },
            { label: 'Pending', value: form.pendingOrders },
          ].map((item) => (
            <div key={item.label} className="bg-white border border-[#DDE6F5] rounded-2xl p-3">
              <p className="font-space text-[#8A9EB8] text-[11px]">{item.label}</p>
              <p className="font-syne font-bold text-[#1A2E4A] text-base mt-1">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs text-[#3A5070] font-space mb-2">{field.label}</label>
              <div className="flex items-center bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 focus-within:border-[#4A7FE0]/40">
                {field.key === 'totalRevenue' && <span className="text-sm font-space text-[#6A8098] mr-1">{sym}</span>}
                <input type="number" min="0" step={field.key === 'totalRevenue' ? '0.01' : '1'}
                  value={form[field.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: Number(e.target.value) || 0 }))}
                  className="w-full bg-transparent outline-none text-sm text-[#1A2E4A] font-space" />
              </div>
            </div>
          ))}
          <div>
            <label className="block text-xs text-[#3A5070] font-space mb-2">Business Expense</label>
            <div className="flex items-center bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 focus-within:border-[#4A7FE0]/40">
              <span className="text-sm font-space text-[#6A8098] mr-1">{sym}</span>
              <input type="number" min="0" step="0.01" value={form.expense}
                onChange={(e) => setForm((prev) => ({ ...prev, expense: Number(e.target.value) || 0 }))}
                className="w-full bg-transparent outline-none text-sm text-[#1A2E4A] font-space" placeholder="0.00" />
            </div>
            <p className="font-space text-[#8A9EB8] text-[11px] mt-1">This will be deducted from the revenue for the final audit.</p>
          </div>
          <div className="bg-[#4A7FE0]/10 border border-[#4A7FE0]/20 rounded-2xl p-4 flex flex-col justify-center">
            <p className="font-space text-[#6A8098] text-xs">Net Revenue</p>
            <p className="font-syne font-bold text-[#4A7FE0] text-2xl mt-1">{sym}{netRevenue.toFixed(2)}</p>
            <p className="font-space text-[#8A9EB8] text-[11px] mt-1">Revenue minus business expense.</p>
          </div>
        </div>
        <div className="flex gap-2 pt-5">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl border border-[#DDE6F5] font-space text-sm text-[#4A6080] hover:text-[#1A2E4A] transition-all">Cancel</button>
          <button type="button"
            onClick={() => {
              if (!canSaveAudit) return;
              onSave({ auditDate: form.auditDate, label: formatAuditLabel(form.auditDate), totalRevenue: Number(form.totalRevenue.toFixed(2)), expense: Number(form.expense.toFixed(2)), totalOrders: form.totalOrders, paidOrders: form.paidOrders, deliveredOrders: form.deliveredOrders, pendingOrders: form.pendingOrders });
            }}
            disabled={!canSaveAudit}
            className="flex-1 py-3 rounded-2xl bg-[#4A7FE0] text-white font-space font-bold text-sm hover:bg-[#5B8DEF] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:bg-[#4A7FE0]">
            <Save className="w-4 h-4" />{initialAudit ? 'Save Audit Changes' : 'Save Audit'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Confirmation modal for deleting an audit record.
function DeleteAuditModal({ audit, sym, password, setPassword, error, loading, onClose, onConfirm }: {
  audit: AuditRecord; sym: string; password: string; setPassword: (value: string) => void;
  error: string | null; loading: boolean; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-[#F8FAFF] border border-[#DDE6F5] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">Delete Audit</h2>
            <p className="font-space text-[#8A9EB8] text-xs mt-1">This action cannot be undone.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-[#F4F8FF] hover:bg-[#E5EEFF] flex items-center justify-center text-[#4A6080] transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 mb-4">
          <p className="font-space text-sm text-[#1A2E4A]">Are you sure you want to delete this audit?</p>
          <p className="font-space text-[#8A9EB8] text-xs mt-1">{audit.label} • Net Revenue {sym}{audit.netRevenue.toFixed(2)}</p>
        </div>
        <div>
          <label className="block text-xs text-[#3A5070] font-space mb-2">Enter Admin Password</label>
          <div className="flex items-center gap-2 bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 focus-within:border-[#4A7FE0]/40">
            <Lock className="w-4 h-4 text-[#6A8098]" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password" className="w-full bg-transparent outline-none text-sm text-[#1A2E4A] font-space" />
          </div>
          {error && <p className="font-space text-red-400 text-xs mt-2">{error}</p>}
        </div>
        <div className="flex gap-2 pt-5">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl border border-[#DDE6F5] font-space text-sm text-[#4A6080] hover:text-[#1A2E4A] transition-all">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-space font-bold text-sm hover:bg-red-600 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" />{loading ? 'Deleting...' : 'Delete Audit'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Main admin dashboard for orders, products, settings, and users.
export default function AdminPage() {
  const navigate = useNavigate();
  // Logged-in admin session details used throughout the dashboard.
  const { email: adminEmail, username: adminUsername, logout } = useAuthStore((s) => ({
    email: s.email, username: s.username, logout: s.logout,
  }));
  // Log out the admin and return to the login screen.
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  // Shared orders, products, audits, and settings used across admin sections.
  const {
    orders, setOrders, upsertOrder,
    products, setProducts,
    audits, deleteAudit, setAudits,
    settings, updateSettings,
    storeStatus, setStoreStatus,
  } = useAppStore();
  const initialLocalProductsRef = useRef(products);
  const initialLocalSettingsRef = useRef(settings);

  // Main dashboard state for selected view, filters, sorting, and layout behavior.
  const [activeView, setActiveView] = useState<AdminView>('orders');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterPayment, setFilterPayment] = useState<PaymentStatus | 'all'>('all');
  const [filterDelivery, setFilterDelivery] = useState<OrderStatus | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [storeSaving, setStoreSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Product-management modal state.
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [productStatusSavingId, setProductStatusSavingId] = useState<string | null>(null);

  const [settingsForm, setSettingsForm] = useState({ ...settings });
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [storeHoursForm, setStoreHoursForm] = useState({
    openingTime: storeStatus.openingTime,
    closingTime: storeStatus.closingTime,
  });
  const [storeHoursDirty, setStoreHoursDirty] = useState(false);

  // Password gate state for sensitive admin-only sections.
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [gatePassword, setGatePassword] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateLoading, setGateLoading] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<{
    id: number; username: string; email: string;
    is_staff: boolean; is_verified: boolean; date_joined: string;
  }[]>([]);

  // Clear-orders confirmation state plus sales filter input.
  const [showClearOrders, setShowClearOrders] = useState(false);
  const [clearOrdersPassword, setClearOrdersPassword] = useState('');
  const [clearOrdersError, setClearOrdersError] = useState<string | null>(null);
  const [clearOrdersNeedsForce, setClearOrdersNeedsForce] = useState(false);
  const [salesDateFilter, setSalesDateFilter] = useState('');

  // Audit create, edit, and delete modal state.
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [editingAudit, setEditingAudit] = useState<AuditRecord | null>(null);
  const [auditDateFilter, setAuditDateFilter] = useState('');
  const [showDeleteAuditModal, setShowDeleteAuditModal] = useState(false);
  const [deletingAudit, setDeletingAudit] = useState<AuditRecord | null>(null);
  const [deleteAuditPassword, setDeleteAuditPassword] = useState('');
  const [deleteAuditError, setDeleteAuditError] = useState<string | null>(null);
  const [deleteAuditLoading, setDeleteAuditLoading] = useState(false);

  // Small feedback message shown after save, delete, or sync actions.
  const [toastMessage, setToastMessage] = useState('');

  // Load the shared product list from the backend.
  const refreshProducts = async () => {
    const res = await apiGet('/api/products/products/');
    if (res.ok && Array.isArray(res.data.products)) {
      setProducts(res.data.products);
      return true;
    }
    return false;
  };

  // One-time helper for moving old browser-only products into the backend.
  const seedLegacyProductsToServer = async () => {
    const localProducts = initialLocalProductsRef.current;
    if (localProducts.length === 0) {
      return false;
    }

    const results = await Promise.all(
      localProducts.map(({ id: _id, ...product }) => apiPost('/api/products/products/create/', product))
    );

    return results.some((result) => result.ok);
  };

  // One-time helper for moving old browser-only settings into the backend.
  const seedLegacySettingsToServer = async (serverSettings: ShopSettings) => {
    const localSettings = initialLocalSettingsRef.current;
    const hasLegacyLocalSettings = !shopSettingsMatch(localSettings, DEFAULT_SHOP_SETTINGS);
    const serverStillDefault = shopSettingsMatch(serverSettings, DEFAULT_SHOP_SETTINGS);

    if (!hasLegacyLocalSettings || !serverStillDefault) {
      return false;
    }

    const res = await apiPost('/api/orders/store-status/update/', localSettings);
    if (!res.ok || !res.data.settings) {
      return false;
    }

    updateSettings(res.data.settings);
    if (res.data.store) setStoreStatus(res.data.store);
    return true;
  };

  // Open the password gate before showing the registered users page.
  const handleOpenUsers = () => { setGatePassword(''); setGateError(null); setShowPasswordModal(true); };
  // Prepare the create-audit modal using the currently selected day.
  const handleOpenCreateAudit = () => {
    const nextAuditDate = auditDateFilter || todayAuditStats.auditDate;
    setEditingAudit(null);
    if (nextAuditDate && audits.some((audit) => audit.auditDate.slice(0, 10) === nextAuditDate)) {
      setToastMessage('These orders are already audited. Please check the audit window.');
      return;
    }
    setShowAuditModal(true);
  };
  // Open the edit modal for a chosen audit record.
  const handleOpenEditAudit = (audit: AuditRecord) => { setEditingAudit(audit); setShowAuditModal(true); };
  // Open the delete confirmation for a chosen audit record.
  const handleOpenDeleteAudit = (audit: AuditRecord) => {
    setDeletingAudit(audit); setDeleteAuditPassword(''); setDeleteAuditError(null); setShowDeleteAuditModal(true);
  };

  // Button for opening or closing the store for customers.
  const handleToggleStore = async () => {
    if (storeSaving) return;

    const previousStoreStatus = storeStatus;
    const nextIsOpen = !storeStatus.isOpen;

    try {
      setStoreSaving(true);
      setStoreStatus({
        ...storeStatus,
        isOpen: nextIsOpen,
      });

      const res = await apiPost('/api/orders/store-status/update/', {
        isOpen: nextIsOpen,
      });

      if (!res.ok || !res.data.store) {
        setStoreStatus(previousStoreStatus);
        setToastMessage(res.data?.error || 'Unable to update store status.');
        return;
      }

      setStoreStatus(res.data.store);
      setToastMessage(res.data.store.isOpen ? 'Store is now open.' : 'Store is now closed.');
    } catch (error) {
      setStoreStatus(previousStoreStatus);
      setToastMessage('Failed to update store status.');
      console.error(error);
    } finally {
      setStoreSaving(false);
    }
  };

  // Save the store opening and closing hours.
  const handleStoreTimeSave = async () => {
    if (storeSaving) return;

    if (!storeStatus.isOpen) {
      setToastMessage('Open the store first before setting store hours.');
      return;
    }

    if (!storeHoursForm.openingTime || !storeHoursForm.closingTime) {
      setToastMessage('Please set both opening and closing time.');
      return;
    }

    try {
      setStoreSaving(true);

      const res = await apiPost('/api/orders/store-status/update/', {
        isOpen: true,
        openingTime: storeHoursForm.openingTime,
        closingTime: storeHoursForm.closingTime,
      });

      if (res.ok && res.data.store) {
        setStoreStatus(res.data.store);
        setStoreHoursForm({
          openingTime: res.data.store.openingTime,
          closingTime: res.data.store.closingTime,
        });
        setStoreHoursDirty(false);
        setToastMessage('Store hours saved successfully.');
      } else {
        setToastMessage(res.data?.error || 'Unable to save store hours.');
      }
    } catch (error) {
      setToastMessage('Failed to save store hours.');
      console.error(error);
    } finally {
      setStoreSaving(false);
    }
  };

  // Create or update an audit record in the backend.
  const handleSaveAudit = async (data: { auditDate: string; label: string; totalRevenue: number; expense: number; totalOrders: number; paidOrders: number; deliveredOrders: number; pendingOrders: number }) => {
    const payload = {
      ...data,
      auditDate: toLocalDateInputValue(data.auditDate),
      netRevenue: Number((data.totalRevenue - data.expense).toFixed(2)),
    };

    try {
      const res = editingAudit
        ? await apiPost(`/api/orders/audits/${editingAudit.id}/update/`, payload)
        : await apiPost('/api/orders/audits/create/', payload);

      if (!res.ok || !res.data.audit) {
        setToastMessage(res.data?.error || 'Unable to save audit.');
        return;
      }

      const { auditsWereRefreshed, ordersWereRefreshed } = await refreshAuditData();

      setToastMessage(
        auditsWereRefreshed && ordersWereRefreshed
          ? (editingAudit ? 'Audit updated successfully.' : 'Audit saved successfully.')
          : 'Audit saved, but the page data could not be fully refreshed.'
      );
      setShowAuditModal(false);
      setEditingAudit(null);
      setActiveView('audit');
    } catch (error) {
      setToastMessage('Failed to save audit.');
      console.error(error);
    }
  };

  // Delete the selected audit after the admin confirms the password.
  const handleConfirmDeleteAudit = async () => {
    if (!deletingAudit) return;
    if (!deleteAuditPassword.trim()) { setDeleteAuditError('Admin password is required.'); return; }
    setDeleteAuditLoading(true); setDeleteAuditError(null);
    try {
      const res = await fetch(`${API_BASE}/api/accounts/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: deleteAuditPassword }),
      });
      const data = await res.json();
      if (!data.ok) { setDeleteAuditError(data.error ?? 'Invalid admin password.'); return; }
      const deleteRes = await apiPost(`/api/orders/audits/${deletingAudit.id}/delete/`, { email: adminEmail, password: deleteAuditPassword });
      if (!deleteRes.ok) {
        setDeleteAuditError(deleteRes.data?.error || 'Unable to delete audit.');
        return;
      }

      const { auditsWereRefreshed, ordersWereRefreshed } = await refreshAuditData();
      if (!auditsWereRefreshed) deleteAudit(deletingAudit.id);
      setShowDeleteAuditModal(false);
      setDeletingAudit(null);
      setDeleteAuditPassword('');
      setToastMessage(
        auditsWereRefreshed && ordersWereRefreshed
          ? 'Audit deleted successfully.'
          : 'Audit deleted, but the page data could not be fully refreshed.'
      );
    } catch {
      setDeleteAuditError('Cannot reach the server.');
    } finally {
      setDeleteAuditLoading(false);
    }
  };

  // Verify the admin password before opening protected admin sections.
  const handleGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null); setGateLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/accounts/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: gatePassword }),
      });
      const data = await res.json();
      if (!data.ok) { setGateError(data.error ?? 'Invalid password.'); return; }
      setRegisteredUsers(data.users);
      setShowPasswordModal(false);
      setActiveView('registered_users');
    } catch {
      setGateError('Cannot reach the server.');
    } finally {
      setGateLoading(false);
    }
  };

  // Load the latest store status and shop settings from the backend.
  const refreshStoreConfig = async () => {
    const storeRes = await apiGet('/api/orders/store-status/');
    if (storeRes.ok && storeRes.data.store) setStoreStatus(storeRes.data.store);
    if (storeRes.ok && storeRes.data.settings) updateSettings(storeRes.data.settings);
    return storeRes;
  };

  // Save business name, shipping fee, and currency settings.
  const handleSaveSettings = async () => {
    if (settingsSaving) return;

    try {
      setSettingsSaving(true);
      const res = await apiPost('/api/orders/store-status/update/', settingsForm);

      if (!res.ok || !res.data.settings) {
        setToastMessage(res.data?.error || 'Unable to save shop settings.');
        return;
      }

      updateSettings(res.data.settings);
      if (res.data.store) setStoreStatus(res.data.store);
      setSettingsDirty(false);
      setToastMessage('Shop settings saved successfully.');
    } catch (error) {
      console.error(error);
      setToastMessage('Failed to save shop settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Create or update a product record through the backend API.
  const handleSaveProduct = async (data: Omit<Product, 'id'>) => {
    try {
      const endpoint = editingProduct
        ? `/api/products/products/${editingProduct.id}/update/`
        : '/api/products/products/create/';
      const res = await apiPost(endpoint, data);

      if (!res.ok || !res.data.product) {
        setToastMessage(res.data?.error || 'Unable to save product.');
        return;
      }

      const refreshed = await refreshProducts();
      if (!refreshed) {
        setProducts(
          editingProduct
            ? products.map((product) => (product.id === editingProduct.id ? res.data.product : product))
            : [res.data.product, ...products]
        );
      }

      setShowProductForm(false);
      setEditingProduct(undefined);
      setToastMessage(editingProduct ? 'Product updated successfully.' : 'Product added successfully.');
    } catch (error) {
      console.error(error);
      setToastMessage('Failed to save product.');
    }
  };

  // Button for marking a product as sold out or available again.
  const handleToggleProductSoldOut = async (product: Product) => {
    if (productStatusSavingId === product.id) return;

    try {
      setProductStatusSavingId(product.id);
      const nextSoldOut = !product.soldOut;
      const res = await apiPost(`/api/products/products/${product.id}/update/`, { soldOut: nextSoldOut });

      if (!res.ok || !res.data.product) {
        setToastMessage(res.data?.error || 'Unable to update product availability.');
        return;
      }

      const refreshed = await refreshProducts();
      if (!refreshed) {
        setProducts(products.map((item) => (item.id === product.id ? res.data.product : item)));
      }

      setToastMessage(nextSoldOut ? `${product.name} marked as sold out.` : `${product.name} is available again.`);
    } catch (error) {
      console.error(error);
      setToastMessage('Failed to update product availability.');
    } finally {
      setProductStatusSavingId(null);
    }
  };

  // Delete the selected product from the shared catalog.
  const handleDeleteProduct = async () => {
    if (!deleteConfirm) return;

    const productId = deleteConfirm;

    try {
      const res = await apiPost(`/api/products/products/${productId}/delete/`, {});
      if (!res.ok) {
        setToastMessage(res.data?.error || 'Unable to delete product.');
        return;
      }

      const refreshed = await refreshProducts();
      if (!refreshed) {
        setProducts(products.filter((product) => product.id !== productId));
      }

      setDeleteConfirm(null);
      setToastMessage('Product deleted successfully.');
    } catch (error) {
      console.error(error);
      setToastMessage('Failed to delete product.');
    }
  };

  // Load orders, audits, and sales summary for the admin dashboard.
  const refreshAuditData = async () => {
    const [ordersRes, auditsRes] = await Promise.all([
      apiGet('/api/orders/orders/'),
      apiGet('/api/orders/audits/'),
    ]);

    const ordersWereRefreshed = Boolean(ordersRes.ok && ordersRes.data.orders);
    const auditsWereRefreshed = Boolean(auditsRes.ok && auditsRes.data.audits);

    if (ordersWereRefreshed) setOrders(ordersRes.data.orders);
    if (auditsWereRefreshed) setAudits(auditsRes.data.audits);

    return { ordersWereRefreshed, auditsWereRefreshed };
  };

  useEffect(() => {
    (async () => {
      const [ordersRes, auditsRes, storeRes, productsRes] = await Promise.all([
        apiGet('/api/orders/orders/'),
        apiGet('/api/orders/audits/'),
        apiGet('/api/orders/store-status/'),
        apiGet('/api/products/products/'),
      ]);

      let sharedSettings: ShopSettings | null = null;

      if (ordersRes.ok && ordersRes.data.orders) setOrders(ordersRes.data.orders);
      if (auditsRes.ok && auditsRes.data.audits) setAudits(auditsRes.data.audits);
      if (storeRes.ok && storeRes.data.store) setStoreStatus(storeRes.data.store);
      if (storeRes.ok && storeRes.data.settings) {
        sharedSettings = storeRes.data.settings;
        updateSettings(storeRes.data.settings);
      }

      if (sharedSettings) {
        const seededSettings = await seedLegacySettingsToServer(sharedSettings);
        if (seededSettings) {
          setToastMessage('Existing local shop settings were synced to the shared server config.');
        }
      }

      if (productsRes.ok && Array.isArray(productsRes.data.products)) {
        if (productsRes.data.products.length > 0) {
          setProducts(productsRes.data.products);
        } else {
          const seeded = await seedLegacyProductsToServer();
          const refreshed = await refreshProducts();
          if (seeded && refreshed) {
            setToastMessage('Existing local products were synced to the shared server list.');
          }
        }
      }
    })();
  }, [setOrders, setAudits, setStoreStatus, setProducts, updateSettings]);

  useEffect(() => {
    if (settingsDirty || settingsSaving) return;
    setSettingsForm({ ...settings });
  }, [settings, settingsDirty, settingsSaving]);

  useEffect(() => {
    if (storeHoursDirty || storeSaving) return;
    setStoreHoursForm({
      openingTime: storeStatus.openingTime,
      closingTime: storeStatus.closingTime,
    });
  }, [storeStatus.openingTime, storeStatus.closingTime, storeHoursDirty, storeSaving]);

  useEffect(() => {
    // Refresh admin data when the tab becomes active again.
    const syncSharedData = () => {
      void refreshStoreConfig();
      void refreshProducts();
    };

    window.addEventListener('focus', syncSharedData);
    return () => window.removeEventListener('focus', syncSharedData);
  }, [setStoreStatus, setProducts, updateSettings]);

  const activeOrders = useMemo(() => orders.filter((order) => !order.archived), [orders]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: activeOrders.length,
      paid: activeOrders.filter((o) => o.paymentStatus === 'paid').length,
      pending: activeOrders.filter((o) => o.deliveryStatus !== 'delivered').length,
      deliveredToday: activeOrders.filter((o) => o.deliveryStatus === 'delivered' && new Date(o.lastUpdated).toDateString() === today).length,
      revenue: activeOrders.filter((o) => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.total, 0),
    };
  }, [activeOrders]);

  const todayAuditStats = useMemo(() => buildAuditSnapshot(orders, toLocalDateInputValue(new Date())), [orders]);

  const draftAuditDate = auditDateFilter || todayAuditStats.auditDate;

  const createAuditStats = useMemo(() => buildAuditSnapshot(orders, draftAuditDate), [draftAuditDate, orders]);

  const auditModalStats = useMemo(() => {
    if (editingAudit) {
      return buildAuditSnapshot(orders, editingAudit.auditDate.slice(0, 10));
    }
    return createAuditStats;
  }, [createAuditStats, editingAudit, orders]);

  const filteredSales = useMemo(() => {
    if (!salesDateFilter) return orders;
    return orders.filter((order) => getOrderDateKey(order.createdAt) === salesDateFilter);
  }, [orders, salesDateFilter]);

  const filteredAudits = useMemo(() => {
    if (!auditDateFilter) return audits;
    return audits.filter((audit) => audit.auditDate.slice(0, 10) === auditDateFilter);
  }, [audits, auditDateFilter]);

  const filteredOrders = useMemo(() => {
    let filtered = [...activeOrders];
    if (filterPayment !== 'all') filtered = filtered.filter((o) => o.paymentStatus === filterPayment);
    if (filterDelivery !== 'all') filtered = filtered.filter((o) => o.deliveryStatus === filterDelivery);
    filtered.sort((a, b) => {
      let valA: string | number = a[sortKey as keyof Order] as string | number;
      let valB: string | number = b[sortKey as keyof Order] as string | number;
      if (sortKey === 'total') { valA = Number(valA); valB = Number(valB); }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return filtered;
  }, [activeOrders, filterPayment, filterDelivery, sortKey, sortDir]);

  // Change the sort field or direction of the registered users table.
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Show the current sort direction icon for a table column.
  const SortIcon = ({ field }: { field: SortKey }) => {
    if (sortKey !== field) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-[#4A7FE0]" /> : <ChevronDown className="w-3 h-3 text-[#4A7FE0]" />;
  };

  // Clear archived or old orders after admin confirmation.
  const handleClearOrdersConfirm = async () => {
    setClearOrdersError(null);
    const res = await apiPost('/api/orders/orders/clear/', { email: adminEmail, password: clearOrdersPassword, force: clearOrdersNeedsForce });
    if (!res.ok) {
      if (res.data.needsConfirmation) {
        setClearOrdersNeedsForce(true);
        setClearOrdersError(res.data.warning || 'These sales are not audited yet. Are you sure you want to clear the active order queue?');
        return;
      }
      setClearOrdersError(res.data.error || 'Failed to clear the active orders queue.');
      return;
    }

    const clearedOrderIds = Array.isArray(res.data.clearedOrderIds) ? res.data.clearedOrderIds : [];
    const { ordersWereRefreshed } = await refreshAuditData();

    if (!ordersWereRefreshed && clearedOrderIds.length > 0) {
      setOrders(
        orders.map((order) =>
          clearedOrderIds.includes(order.id) ? { ...order, archived: true } : order
        )
      );
    }

    setShowClearOrders(false);
    setClearOrdersPassword('');
    setClearOrdersError(null);
    setClearOrdersNeedsForce(false);
    setToastMessage(
      clearedOrderIds.length === 0
        ? 'No active orders to clear.'
        : ordersWereRefreshed
          ? 'Active order queue cleared. Customer order history was kept.'
          : 'Active order queue cleared, but the latest order history could not be fully refreshed.'
    );
  };

  const sym = settings.currencySymbol;

  const navItems = [
    { key: 'orders' as AdminView, label: 'Orders', icon: Package },
    { key: 'customers' as AdminView, label: 'Customers', icon: Users },
    { key: 'products' as AdminView, label: 'Products', icon: ImageIcon },
    { key: 'settings' as AdminView, label: 'Settings', icon: Settings },
    { key: 'registered_users' as AdminView, label: 'Reg. Users', icon: UserCog, protected: true },
    { key: 'audit' as AdminView, label: 'Audit', icon: CreditCard },
    { key: 'sales' as AdminView, label: 'Sales', icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-[#F4F8FF] flex">
      {/* Main admin layout with a sidebar on the left and page content on the right. */}
      {/* Sidebar navigation for switching between admin dashboard sections. */}
      <aside className={cn('shrink-0 bg-white border-r border-[#DDE6F5] shadow-sm flex flex-col transition-all duration-300', sidebarOpen ? 'w-56' : 'w-16')}>
        <div className="h-16 flex items-center px-4 border-b border-[#DDE6F5]">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-[#4A7FE0] flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-white" /></div>
            {sidebarOpen && <span className="font-syne font-bold text-[#1A2E4A] text-sm whitespace-nowrap">Dali<span className="text-[#4A7FE0]">Very</span> <span className="text-[#8A9EB8] font-normal text-xs">Admin</span></span>}
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button key={item.key}
              onClick={() => (item as any).protected ? handleOpenUsers() : setActiveView(item.key)}
              className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                activeView === item.key ? 'bg-[#4A7FE0]/15 text-[#4A7FE0] border border-[#4A7FE0]/20' : 'text-[#6A8098] hover:bg-[#EEF4FF] hover:text-[#1A2E4A]')}>
              <item.icon className="w-5 h-5 shrink-0" />
              {sidebarOpen && <span className="font-space text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className="m-3 p-2.5 rounded-xl bg-[#F7FAFF] border border-[#DDE6F5] text-[#9AAABB] hover:text-[#4A6080] transition-colors flex items-center justify-center">
          {sidebarOpen ? <ChevronDown className="w-4 h-4 rotate-90" /> : <ChevronUp className="w-4 h-4 rotate-90" />}
        </button>
      </aside>

      {/* Main content area that changes based on the selected admin view. */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-[#F8FAFF]/80 backdrop-blur-md border-b border-[#DDE6F5] flex items-center justify-between px-6 sticky top-0 z-20">
          <h1 className="font-syne font-bold text-[#1A2E4A] text-xl capitalize">{activeView.replace('_', ' ')}</h1>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#4A7FE0]/20 border border-[#4A7FE0]/30 flex items-center justify-center shrink-0">
              <span className="font-syne font-bold text-[#4A7FE0] text-xs">{(adminUsername ?? 'A').charAt(0).toUpperCase()}</span>
            </div>
            <div className="text-right hidden sm:block">
              <p className="font-space font-semibold text-[#1A2E4A] text-sm">{adminUsername ?? 'Admin'}</p>
              <p className="font-space text-[#8A9EB8] text-xs">{adminEmail}</p>
            </div>
            <button onClick={handleLogout}
              className="ml-1 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all text-xs font-space font-medium">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <div className="p-6">
          {/* Orders view for store control and active order management. */}
          {activeView === 'orders' && (
            <div className="space-y-6">
              <div className="bg-white border border-[#DDE6F5] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">Store Control</h2>
                  <p className="font-space text-[#8A9EB8] text-xs mt-1">
                    Control whether students can place orders
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex items-center gap-3">
  <span className="font-space text-sm text-[#1A2E4A]">
    Store is {storeStatus.isOpen ? 'Open' : 'Closed'}
  </span>

  <button
    type="button"
    onClick={handleToggleStore}
    disabled={storeSaving}
    className={cn(
      'px-4 py-2 rounded-xl text-sm font-space font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed',
      storeStatus.isOpen
        ? 'bg-green-500 hover:bg-green-600'
        : 'bg-red-500 hover:bg-red-600'
    )}
  >
    {storeSaving ? 'Saving...' : storeStatus.isOpen ? 'Close' : 'Open'}
  </button>
</div>

                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={storeHoursForm.openingTime}
                      disabled={!storeStatus.isOpen}
                      onChange={(e) => {
                        setStoreHoursDirty(true);
                        setStoreHoursForm((current) => ({ ...current, openingTime: e.target.value }));
                      }}
                      className={cn(
                        'px-3 py-2 rounded-xl border text-sm font-space',
                        storeStatus.isOpen
                          ? 'border-[#DDE6F5] bg-[#F8FAFF] text-[#1A2E4A]'
                          : 'border-[#E5EAF3] bg-[#F1F4F9] text-[#A0AEC0] cursor-not-allowed'
                      )}
                    />
                    <span className="font-space text-[#8A9EB8] text-sm">to</span>
                    <input
                      type="time"
                      value={storeHoursForm.closingTime}
                      disabled={!storeStatus.isOpen}
                      onChange={(e) => {
                        setStoreHoursDirty(true);
                        setStoreHoursForm((current) => ({ ...current, closingTime: e.target.value }));
                      }}
                      className={cn(
                        'px-3 py-2 rounded-xl border text-sm font-space',
                        storeStatus.isOpen
                          ? 'border-[#DDE6F5] bg-[#F8FAFF] text-[#1A2E4A]'
                          : 'border-[#E5EAF3] bg-[#F1F4F9] text-[#A0AEC0] cursor-not-allowed'
                      )}
                    />
                    <button
                      type="button"
                       onClick={handleStoreTimeSave}
                        disabled={!storeStatus.isOpen || storeSaving}
                        className={cn(
                        'px-4 py-2 rounded-xl text-sm font-space font-bold transition-all',
                        storeStatus.isOpen
                          ? 'bg-[#4A7FE0] text-white hover:bg-[#5B8DEF]'
                          : 'bg-[#BFC9D9] text-white cursor-not-allowed'
                      )}
                    >
                      Save Time
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total Orders', value: stats.total, icon: Package, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Paid Orders', value: stats.paid, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  { label: 'Pending', value: stats.pending, icon: Truck, color: 'text-[#4A7FE0]', bg: 'bg-[#4A7FE0]/10' },
                  { label: 'Delivered Today', value: stats.deliveredToday, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                  { label: 'Revenue', value: `${sym}${stats.revenue.toFixed(2)}`, icon: DollarSign, color: 'text-[#4A7FE0]', bg: 'bg-[#4A7FE0]/10' },
                ].map((stat, i) => (
                  <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="bg-[#F8FAFF] border border-[#DDE6F5] rounded-2xl p-4">
                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-3', stat.bg)}>
                      <stat.icon className={cn('w-4 h-4', stat.color)} />
                    </div>
                    <div className="font-syne font-bold text-[#1A2E4A] text-xl">{stat.value}</div>
                    <div className="font-space text-[#8A9EB8] text-xs mt-0.5">{stat.label}</div>
                  </motion.div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Filter className="w-4 h-4 text-[#8A9EB8]" />
                {(['all', 'paid', 'unpaid', 'pending'] as const).map((f) => (
                  <button key={f} onClick={() => setFilterPayment(f)}
                    className={cn('px-3 py-1.5 rounded-xl text-xs font-space border capitalize transition-all',
                      filterPayment === f ? 'bg-[#4A7FE0] text-white border-[#4A7FE0]' : 'bg-transparent text-[#6A8098] border-[#DDE6F5] hover:border-[#C8D9F5]')}>
                    {f === 'all' ? 'All Payment' : f}
                  </button>
                ))}
                <div className="w-px h-4 bg-white/10" />
                {(['all', 'placed', 'processing', 'out_for_delivery', 'delivered'] as const).map((f) => (
                  <button key={f} onClick={() => setFilterDelivery(f)}
                    className={cn('px-3 py-1.5 rounded-xl text-xs font-space border capitalize transition-all',
                      filterDelivery === f ? 'bg-[#4A7FE0] text-white border-[#4A7FE0]' : 'bg-transparent text-[#6A8098] border-[#DDE6F5] hover:border-[#C8D9F5]')}>
                    {f === 'all' ? 'All Delivery' : f.replace('_', ' ')}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={handleOpenCreateAudit}
                    className="px-3 py-1.5 rounded-xl text-xs font-space border border-[#4A7FE0]/20 text-[#4A7FE0] hover:bg-[#4A7FE0]/10 transition-all">
                    Audit
                  </button>
                  <button onClick={() => setShowClearOrders(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-space border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all">
                    Clear All Orders
                  </button>
                </div>
              </div>

              <div className="bg-white border border-[#DDE6F5] rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#DDE6F5]">
                      {[
                        { label: 'Order ID', key: 'id' }, { label: 'Customer', key: 'customerName' },
                        { label: 'Total', key: 'total' }, { label: 'Payment', key: 'paymentStatus' },
                        { label: 'Delivery', key: 'deliveryStatus' }, { label: 'Date', key: 'createdAt' },
                      ].map((col) => (
                        <th key={col.key} onClick={() => handleSort(col.key as SortKey)}
                          className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs cursor-pointer hover:text-[#3A5070] transition-colors select-none">
                          <span className="flex items-center gap-1">{col.label}<SortIcon field={col.key as SortKey} /></span>
                        </th>
                      ))}
                      <th className="py-3.5 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 && (
                      <tr><td colSpan={7} className="py-12 text-center font-space text-[#9AAABB] text-sm">No orders yet.</td></tr>
                    )}
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="border-b border-[#DDE6F5] hover:bg-[#F7FAFF] transition-colors">
                        <td className="py-3.5 px-4"><span className="font-syne font-bold text-[#4A7FE0] text-sm">{order.id}</span></td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#4A7FE0]/15 flex items-center justify-center"><span className="font-syne font-bold text-[#4A7FE0] text-xs">{order.customerName[0]}</span></div>
                            <span className="font-space text-[#1A2E4A] text-sm">{order.customerName}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4"><span className="font-syne font-bold text-[#1A2E4A] text-sm">{sym}{order.total.toFixed(2)}</span></td>
                        <td className="py-3.5 px-4"><PaymentBadge status={order.paymentStatus} /></td>
                        <td className="py-3.5 px-4"><DeliveryBadge status={order.deliveryStatus} /></td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#6A8098] text-xs">{formatDate(order.createdAt)}</span></td>
                        <td className="py-3.5 px-4">
                          <button onClick={() => setSelectedOrder(order)}
                            className="w-8 h-8 rounded-xl bg-[#F4F8FF] hover:bg-[#4A7FE0]/15 border border-[#DDE6F5] hover:border-[#4A7FE0]/30 flex items-center justify-center text-[#8A9EB8] hover:text-[#4A7FE0] transition-all">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === 'customers' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#DDE6F5] rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#DDE6F5]">
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Customer</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Phone</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Orders</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Total Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 && (
                      <tr><td colSpan={4} className="py-12 text-center font-space text-[#9AAABB] text-sm">No customers yet.</td></tr>
                    )}
                    {Array.from(orders.reduce((map, order) => {
                      const existing = map.get(order.customerName) || { orders: 0, spent: 0, phone: order.phone };
                      map.set(order.customerName, { orders: existing.orders + 1, spent: existing.spent + order.total, phone: order.phone });
                      return map;
                    }, new Map<string, { orders: number; spent: number; phone: string }>())).map(([name, data]) => (
                      <tr key={name} className="border-b border-[#DDE6F5] hover:bg-[#F7FAFF] transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#4A7FE0]/20 flex items-center justify-center"><span className="font-syne font-bold text-[#4A7FE0] text-xs">{name[0]}</span></div>
                            <span className="font-space text-[#1A2E4A] text-sm font-medium">{name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#4A6080] text-sm">{data.phone}</span></td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#1A2E4A] text-sm">{data.orders}</span></td>
                        <td className="py-3.5 px-4"><span className="font-syne font-bold text-[#4A7FE0] text-sm">{sym}{data.spent.toFixed(2)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Products view for adding, editing, deleting, and marking items sold out. */}
          {activeView === 'products' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="font-space text-[#8A9EB8] text-sm">{products.length} product{products.length !== 1 ? 's' : ''}</p>
                <button onClick={() => { setEditingProduct(undefined); setShowProductForm(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A7FE0] text-white font-space font-bold text-sm hover:bg-[#5B8DEF] transition-all">
                  <Plus className="w-4 h-4" /> Add Product
                </button>
              </div>
              {products.length === 0 && (
                <div className="bg-[#F8FAFF] border border-[#DDE6F5] rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
                  <ImageIcon className="w-10 h-10 text-[#C0D0E0]" />
                  <p className="font-space text-[#8A9EB8] text-sm">No products yet. Click "Add Product" to get started.</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product) => (
                  <motion.div key={product.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="bg-white border border-[#DDE6F5] rounded-2xl overflow-hidden shadow-sm">
                    <div className="h-40 bg-[#EEF4FF] relative overflow-hidden">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-10 h-10 text-[#C0D0E0]" /></div>
                      )}
                      {product.badge && (
                        <span className="absolute top-2 left-2 bg-[#4A7FE0] text-white text-xs font-space font-bold px-2 py-0.5 rounded-lg">{product.badge}</span>
                      )}
                      {product.soldOut && (
                        <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-space font-bold px-2 py-0.5 rounded-lg">Sold Out</span>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-syne font-bold text-[#1A2E4A] text-sm">{product.name}</h3>
                          <span className="text-xs font-space text-[#4A7FE0]/70">{product.category}</span>
                        </div>
                        <span className="font-syne font-bold text-[#4A7FE0] text-sm shrink-0">{sym}{product.price.toFixed(2)}</span>
                      </div>
                      <p className="font-space text-[#6A8098] text-xs line-clamp-2">{product.description}</p>
                      <div className="flex items-center gap-2 text-[11px] font-space">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-1 border',
                          product.soldOut
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                        )}>
                          {product.soldOut ? 'Currently Sold Out' : 'Available to order'}
                        </span>
                      </div>
                      {/* Buttons for editing, toggling sold out, or deleting a product. */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <button onClick={() => { setEditingProduct(product); setShowProductForm(true); }}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#F4F8FF] border border-[#DDE6F5] hover:border-[#4A7FE0]/30 hover:text-[#4A7FE0] text-[#4A6080] text-xs font-space transition-all">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => void handleToggleProductSoldOut(product)}
                          disabled={productStatusSavingId === product.id}
                          className={cn(
                            'py-2 rounded-xl border text-xs font-space transition-all disabled:opacity-60 disabled:cursor-not-allowed',
                            product.soldOut
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-600 hover:bg-amber-500/20'
                          )}
                        >
                          {productStatusSavingId === product.id
                            ? 'Saving...'
                            : product.soldOut
                              ? 'Mark Available'
                              : 'Mark Sold Out'}
                        </button>
                        <button onClick={() => setDeleteConfirm(product.id)}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-space transition-all">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Audit view for daily revenue snapshots and audit history. */}
          {activeView === 'audit' && (
            <div className="space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                <div>
                  <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">Daily Audit History</h2>
                  <p className="font-space text-[#8A9EB8] text-sm">You can see saved audits here.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="min-w-[230px]">
                    <label className="block text-xs text-[#3A5070] font-space mb-2">Calendar Picker</label>
                    <div className="flex items-center gap-2 bg-white border border-[#DDE6F5] rounded-xl px-4 py-2.5">
                      <CalendarDays className="w-4 h-4 text-[#6A8098]" />
                      <input type="date" value={auditDateFilter} onChange={(e) => setAuditDateFilter(e.target.value)}
                        className="w-full bg-transparent outline-none text-sm text-[#1A2E4A] font-space" />
                    </div>
                  </div>
                  <button onClick={handleOpenCreateAudit}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A7FE0] text-white font-space font-bold text-sm hover:bg-[#5B8DEF] transition-all w-fit">
                    <Plus className="w-4 h-4" /> New Audit
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Audit Records', value: filteredAudits.length },
                  { label: 'Today Revenue', value: `${sym}${todayAuditStats.revenue.toFixed(2)}` },
                  { label: 'Today Orders', value: todayAuditStats.totalOrders },
                  { label: 'Today Net Preview', value: `${sym}${todayAuditStats.revenue.toFixed(2)}` },
                ].map((card) => (
                  <div key={card.label} className="bg-[#F8FAFF] border border-[#DDE6F5] rounded-2xl p-4">
                    <div className="font-syne font-bold text-[#1A2E4A] text-xl">{card.value}</div>
                    <div className="font-space text-[#8A9EB8] text-xs mt-0.5">{card.label}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-[#DDE6F5] rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#DDE6F5]">
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Audit Date</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Revenue</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Expense</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Net Revenue</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Orders</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Paid</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Delivered</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Pending</th>
                      <th className="py-3.5 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudits.length === 0 && (
                      <tr><td colSpan={9} className="py-12 text-center font-space text-[#9AAABB] text-sm">No audit records found. Click "New Audit" or change the calendar picker.</td></tr>
                    )}
                    {filteredAudits.map((audit) => (
                      <tr key={audit.id} className="border-b border-[#DDE6F5] hover:bg-[#F7FAFF] transition-colors">
                        <td className="py-3.5 px-4"><div><p className="font-space text-[#1A2E4A] text-sm font-medium">{audit.label}</p><p className="font-space text-[#8A9EB8] text-[11px]">Saved {formatDate(audit.createdAt)}</p></div></td>
                        <td className="py-3.5 px-4"><span className="font-syne font-bold text-[#1A2E4A] text-sm">{sym}{audit.totalRevenue.toFixed(2)}</span></td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#6A8098] text-sm">{sym}{audit.expense.toFixed(2)}</span></td>
                        <td className="py-3.5 px-4"><span className="font-syne font-bold text-[#4A7FE0] text-sm">{sym}{audit.netRevenue.toFixed(2)}</span></td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#1A2E4A] text-sm">{audit.totalOrders}</span></td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#1A2E4A] text-sm">{audit.paidOrders}</span></td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#1A2E4A] text-sm">{audit.deliveredOrders}</span></td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#1A2E4A] text-sm">{audit.pendingOrders}</span></td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleOpenEditAudit(audit)}
                              className="w-8 h-8 rounded-xl bg-[#F4F8FF] hover:bg-[#4A7FE0]/15 border border-[#DDE6F5] hover:border-[#4A7FE0]/30 flex items-center justify-center text-[#8A9EB8] hover:text-[#4A7FE0] transition-all">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleOpenDeleteAudit(audit)}
                              className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center text-red-400 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sales view for browsing recorded customer orders by date. */}
          {activeView === 'sales' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">Daily Sales</h2>
                  <p className="font-space text-[#8A9EB8] text-sm">All customer orders are recorded here.</p>
                </div>
                <input type="date" value={salesDateFilter} onChange={(e) => setSalesDateFilter(e.target.value)}
                  className="bg-white border border-[#DDE6F5] rounded-xl px-4 py-2.5 font-space text-[#1A2E4A] text-sm outline-none" />
              </div>
              <div className="bg-white border border-[#DDE6F5] rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead><tr className="border-b border-[#DDE6F5]">
                    <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Order</th>
                    <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Customer</th>
                    <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Total</th>
                    <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Payment</th>
                    <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Delivery</th>
                    <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Audited</th>
                  </tr></thead>
                  <tbody>
                    {filteredSales.length === 0 && <tr><td colSpan={6} className="py-12 text-center font-space text-[#9AAABB] text-sm">No sales found.</td></tr>}
                    {filteredSales.map((order) => (
                      <tr key={order.id} className="border-b border-[#DDE6F5] hover:bg-[#F7FAFF]">
                        <td className="py-3.5 px-4 font-space text-[#4A7FE0] text-sm font-medium">{order.id}<div className="text-[11px] text-[#8A9EB8]">{formatDate(order.createdAt)}</div></td>
                        <td className="py-3.5 px-4 font-space text-[#1A2E4A] text-sm">{order.customerName}</td>
                        <td className="py-3.5 px-4 font-syne font-bold text-[#1A2E4A] text-sm">{sym}{order.total.toFixed(2)}</td>
                        <td className="py-3.5 px-4"><PaymentBadge status={order.paymentStatus} /></td>
                        <td className="py-3.5 px-4"><DeliveryBadge status={order.deliveryStatus} /></td>
                        <td className="py-3.5 px-4 font-space text-sm text-[#1A2E4A]">{order.audited ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Settings view for shared business name, fee, and currency controls. */}
          {activeView === 'settings' && (
            <div className="max-w-xl space-y-4">
              <div className="bg-[#F8FAFF] border border-[#DDE6F5] rounded-2xl p-6 space-y-5">
                <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">Shop Settings</h2>
                <div>
                  <label className="font-space text-[#6A8098] text-xs mb-1.5 block">Business Name</label>
                  <input type="text" value={settingsForm.businessName}
                    onChange={(e) => {
                      setSettingsDirty(true);
                      setSettingsForm((s) => ({ ...s, businessName: e.target.value }));
                    }}
                    className="w-full bg-[#F4F8FF] border border-[#DDE6F5] rounded-xl px-4 py-3 font-space text-[#1A2E4A] text-sm outline-none focus:border-[#4A7FE0]/60 transition-colors" />
                </div>
                <div>
                  <label className="font-space text-[#6A8098] text-xs mb-1.5 block">Shipping / Delivery Fee</label>
                  <input type="number" min="0" step="0.01" value={settingsForm.shippingFee}
                    onChange={(e) => {
                      setSettingsDirty(true);
                      setSettingsForm((s) => ({ ...s, shippingFee: Number(e.target.value) || 0 }));
                    }}
                    className="w-full bg-[#F4F8FF] border border-[#DDE6F5] rounded-xl px-4 py-3 font-space text-[#1A2E4A] text-sm outline-none focus:border-[#4A7FE0]/60 transition-colors" />
                </div>
                <div>
                  <label className="font-space text-[#6A8098] text-xs mb-1.5 block">Currency</label>
                  <div className="flex gap-2">
                    {[{ currency: 'PHP', symbol: '₱' }, { currency: 'USD', symbol: '$' }, { currency: 'EUR', symbol: '€' }].map((c) => (
                      <button key={c.currency} type="button"
                        onClick={() => {
                          setSettingsDirty(true);
                          setSettingsForm((s) => ({ ...s, currency: c.currency, currencySymbol: c.symbol }));
                        }}
                        className={cn('flex-1 py-3 rounded-xl text-sm font-space font-bold border transition-all',
                          settingsForm.currency === c.currency ? 'bg-[#4A7FE0] text-white border-[#4A7FE0]' : 'bg-[#F4F8FF] text-[#4A6080] border-[#DDE6F5] hover:border-[#C8D9F5]')}>
                        {c.symbol} {c.currency}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Button for saving the shared business settings. */}
                <button onClick={handleSaveSettings} disabled={settingsSaving}
                  className="w-full bg-[#4A7FE0] text-white font-syne font-bold py-3.5 rounded-xl hover:bg-[#5B8DEF] disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}

          {/* Registered users view for listing admin and customer accounts. */}
          {activeView === 'registered_users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="font-syne font-bold text-[#1A2E4A] text-lg">Registered Users</h2>
                  <p className="font-space text-[#8A9EB8] text-xs mt-0.5">{registeredUsers.length} total accounts</p>
                </div>
              </div>
              <div className="bg-white border border-[#DDE6F5] rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#DDE6F5]">
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">User</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Email</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Role</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Verified</th>
                      <th className="text-left py-3.5 px-4 font-space text-[#8A9EB8] text-xs">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredUsers.map((u) => (
                      <tr key={u.id} className="border-b border-[#DDE6F5] hover:bg-[#F7FAFF] transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#4A7FE0]/20 flex items-center justify-center shrink-0"><span className="font-syne font-bold text-[#4A7FE0] text-xs">{u.username[0].toUpperCase()}</span></div>
                            <span className="font-space text-[#1A2E4A] text-sm font-medium">{u.username}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#4A6080] text-sm">{u.email}</span></td>
                        <td className="py-3.5 px-4">
                          <span className={cn('font-space font-semibold text-xs px-2.5 py-1 rounded-full border',
                            u.is_staff ? 'text-[#4A7FE0] bg-[#4A7FE0]/10 border-[#4A7FE0]/30' : 'text-blue-400 bg-blue-500/10 border-blue-500/30')}>
                            {u.is_staff ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={cn('font-space font-semibold text-xs px-2.5 py-1 rounded-full border',
                            u.is_verified ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-red-400 bg-red-500/10 border-red-500/30')}>
                            {u.is_verified ? '✓ Verified' : '✗ Unverified'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4"><span className="font-space text-[#6A8098] text-xs">{u.date_joined}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {toastMessage && (
          <ToastMessage text={toastMessage} onClose={() => setToastMessage('')} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProductForm && (
          <ProductFormModal product={editingProduct} onClose={() => setShowProductForm(false)}
            onSave={handleSaveProduct} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-[#F8FAFF] border border-[#DDE6F5] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-syne font-bold text-[#1A2E4A] text-lg mb-2">Delete Product?</h3>
              <p className="font-space text-[#6A8098] text-sm mb-5">This action cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 rounded-2xl border border-[#DDE6F5] font-space text-sm text-[#4A6080] hover:text-[#1A2E4A] transition-all">Cancel</button>
                <button onClick={handleDeleteProduct}
                  className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-space font-bold text-sm hover:bg-red-400 transition-all">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAuditModal && (
          <AuditModal sym={sym} initialAudit={editingAudit} todayStats={auditModalStats} orders={orders}
            onClose={() => { setShowAuditModal(false); setEditingAudit(null); }}
            onSave={handleSaveAudit} />
        )}
        {showDeleteAuditModal && deletingAudit && (
          <DeleteAuditModal audit={deletingAudit} sym={sym} password={deleteAuditPassword}
            setPassword={setDeleteAuditPassword} error={deleteAuditError} loading={deleteAuditLoading}
            onClose={() => { setShowDeleteAuditModal(false); setDeletingAudit(null); setDeleteAuditPassword(''); setDeleteAuditError(null); }}
            onConfirm={handleConfirmDeleteAudit} />
        )}
        {showClearOrders && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowClearOrders(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-[#F8FAFF] border border-[#DDE6F5] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-syne font-bold text-[#1A2E4A] text-lg mb-2">Clear All Orders?</h3>
              <p className="font-space text-[#6A8098] text-sm mb-3">This will clear the active orders queue only. Customer purchase history and sales records will stay saved.</p>
              {clearOrdersError && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 text-red-500 px-3 py-2 text-xs font-space">{clearOrdersError}</div>}
              <input type="password" value={clearOrdersPassword} onChange={(e) => setClearOrdersPassword(e.target.value)}
                placeholder="Admin password" className="w-full mb-4 bg-[#F4F8FF] border border-[#DDE6F5] rounded-xl px-4 py-3 font-space text-[#1A2E4A] text-sm outline-none" />
              <div className="flex gap-2">
                <button onClick={() => { setShowClearOrders(false); setClearOrdersError(null); setClearOrdersNeedsForce(false); }}
                  className="flex-1 py-3 rounded-2xl border border-[#DDE6F5] font-space text-sm text-[#4A6080] hover:text-[#1A2E4A] transition-all">Cancel</button>
                <button onClick={handleClearOrdersConfirm}
                  className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-space font-bold text-sm hover:bg-red-400 transition-all">
                  {clearOrdersNeedsForce ? 'Clear Anyway' : 'Clear Queue'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPasswordModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPasswordModal(false)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-[#F8FAFF] border border-[#DDE6F5] rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[#4A7FE0]/15 border border-[#4A7FE0]/20 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-[#4A7FE0]" />
                </div>
                <div>
                  <p className="font-syne font-bold text-[#1A2E4A] text-sm">Admin Verification</p>
                  <p className="font-space text-[#8A9EB8] text-xs">Enter your password to view registered users</p>
                </div>
              </div>
              <form onSubmit={handleGateSubmit} className="space-y-4">
                <div className="flex items-center gap-2 bg-[#EEF4FF] border border-[#DDE6F5] rounded-2xl px-4 py-3 focus-within:border-[#4A7FE0]/40">
                  <Lock className="w-4 h-4 text-[#8A9EB8] shrink-0" />
                  <input type="password" value={gatePassword} onChange={(e) => setGatePassword(e.target.value)}
                    placeholder="Your admin password" autoFocus
                    className="w-full bg-transparent outline-none text-sm text-[#1A2E4A] placeholder:text-[#9AAABB] font-space" />
                </div>
                {gateError && <div className="text-xs font-space text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">{gateError}</div>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowPasswordModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-[#DDE6F5] font-space text-sm text-[#4A6080] hover:text-[#1A2E4A] hover:border-[#C8D9F5] transition-all">Cancel</button>
                  <button type="submit" disabled={gateLoading || !gatePassword}
                    className="flex-1 py-2.5 rounded-xl bg-[#4A7FE0] text-white font-space font-bold text-sm hover:bg-[#5B8DEF] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                    {gateLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirm'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedOrder && (
          <OrderDrawer
            order={selectedOrder}
            settings={settings}
            onClose={() => setSelectedOrder(null)}
            onUpdatePayment={async (status) => {
              const { ok, data } = await apiPost(
                `/api/orders/orders/${selectedOrder.id}/update/`,
                { paymentStatus: status }
              );

              if (ok && data.order) {
                upsertOrder(data.order);
                setSelectedOrder(data.order);
              }
            }}
            onUpdateDelivery={async (status) => {
              const { ok, data } = await apiPost(
                `/api/orders/orders/${selectedOrder.id}/update/`,
                { deliveryStatus: status }
              );

              if (ok && data.order) {
                upsertOrder(data.order);
                setSelectedOrder(data.order);
              }
            }}
            onUpdateCourier={async (name, phone) => {
              const { ok, data } = await apiPost(
                `/api/orders/orders/${selectedOrder.id}/update/`,
                {
                  courierName: name,
                  courierPhone: phone,
                }
              );

              if (ok && data.order) {
                upsertOrder(data.order);
                setSelectedOrder(data.order);
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
