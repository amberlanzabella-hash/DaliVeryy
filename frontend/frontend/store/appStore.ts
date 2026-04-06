import { create } from 'zustand';

// Shared product shape used by admin, customer, and cart screens.
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  image: string;
  badge?: string;
  soldOut?: boolean;
}

// One product row inside the customer cart.
export interface CartItem {
  product: Product;
  quantity: number;
}

export type OrderStatus = 'placed' | 'processing' | 'out_for_delivery' | 'delivered';
export type PaymentMethod = 'cash_on_delivery' | 'online_payment';
export type PaymentStatus = 'paid' | 'unpaid' | 'pending';

// Frontend version of an order record coming from the backend.
export interface Order {
  id: string;
  paymongoLinkId?: string;
  orderedBy?: string;
  items: CartItem[];
  customerName: string;
  address: string;
  phone: string;
  notes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryStatus: OrderStatus;
  total: number;
  subtotal: number;
  shippingFee: number;
  createdAt: string;
  estimatedDelivery: string;
  courierName: string;
  courierPhone: string;
  lastUpdated: string;
  customerMarkedDelivered?: boolean;
  customerHidden?: boolean;
  audited?: boolean;
  archived?: boolean;
}

// Frontend version of a daily audit summary.
export interface AuditRecord {
  id: string;
  auditDate: string;
  label: string;
  totalRevenue: number;
  expense: number;
  netRevenue: number;
  totalOrders: number;
  paidOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  createdAt: string;
  updatedAt: string;
}

// Shared business settings used across the whole app.
export interface ShopSettings {
  businessName: string;
  shippingFee: number;
  currency: string;
  currencySymbol: string;
}

// Open and close schedule shown to customers and admins.
export interface StoreStatus {
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
}

// Saved checkout form values for the current customer.
export interface CheckoutDraft {
  customerName: string;
  address: string;
  phone: string;
  notes: string;
  paymentMethod: PaymentMethod;
}

const DEFAULT_SETTINGS: ShopSettings = {
  businessName: 'AguasShop',
  shippingFee: 50,
  currency: 'PHP',
  currencySymbol: '₱',
};

const DEFAULT_STORE_STATUS: StoreStatus = {
  isOpen: true,
  openingTime: '',
  closingTime: '',
};

const DEFAULT_CHECKOUT_DRAFT: CheckoutDraft = {
  customerName: '',
  address: '',
  phone: '',
  notes: '',
  paymentMethod: 'cash_on_delivery',
};

const PRODUCTS_KEY = 'aq_products';
const ORDERS_KEY = 'aq_orders';
const SETTINGS_KEY = 'aq_settings';
const AUDITS_KEY = 'aq_audits';
const STORE_STATUS_KEY = 'aq_store_status';
const CHECKOUT_DRAFT_KEY = 'aq_checkout_draft';
const ADD_TO_CART_DEDUPE_MS = 350;
const recentAddToCartTimestamps = new Map<string, number>();

// Read cached data from localStorage with a safe fallback.
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Save cached data to localStorage without crashing the UI.
function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    //
  }
}

interface AppStore {
  products: Product[];
  setProducts: (products: Product[]) => void;
  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, updates: Partial<Omit<Product, 'id'>>) => void;
  deleteProduct: (id: string) => void;

  cartItems: CartItem[];
  cartBounce: boolean;
  addToCart: (product: Product) => void;
  setCartItems: (items: CartItem[]) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  triggerBounce: () => void;

  orders: Order[];
  placeOrder: (data: {
    items: CartItem[];
    customerName: string;
    address: string;
    phone: string;
    notes: string;
    paymentMethod: PaymentMethod;
    paymongoLinkId?: string;
    orderedBy?: string;
  }) => Order;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  updatePaymentStatus: (orderId: string, status: PaymentStatus) => void;
  updateOrderLinkId: (orderId: string, linkId: string) => void;
  updateOrder: (orderId: string, updates: Partial<Order>) => void;
  getOrderById: (orderId: string) => Order | undefined;
  setOrders: (orders: Order[]) => void;
  upsertOrder: (order: Order) => void;

  audits: AuditRecord[];
  addAudit: (audit: Omit<AuditRecord, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateAudit: (auditId: string, updates: Partial<Omit<AuditRecord, 'id' | 'createdAt'>>) => void;
  deleteAudit: (auditId: string) => void;
  setAudits: (audits: AuditRecord[]) => void;

  settings: ShopSettings;
  updateSettings: (updates: Partial<ShopSettings>) => void;

  storeStatus: StoreStatus;
  setStoreStatus: (storeStatus: StoreStatus) => void;

  checkoutDraft: CheckoutDraft;
  setCheckoutDraft: (draft: Partial<CheckoutDraft>) => void;
  clearCheckoutDraft: () => void;
}

// Create a short local ID for records that still need one on the frontend.
const generateId = () => Math.random().toString(36).substring(2, 10).toUpperCase();
// Build the display-style order ID used by legacy frontend helpers.
const generateOrderId = () => 'AQ-' + generateId();

// Main Zustand store for products, cart, orders, audits, and settings.
export const useAppStore = create<AppStore>((set, get) => ({
  products: loadFromStorage<Product[]>(PRODUCTS_KEY, []),

  // Replace the local product cache with the latest shared product list.
  setProducts: (products) => {
    saveToStorage(PRODUCTS_KEY, products);
    set({ products });
  },

  // Legacy helper for adding a product into local state.
  addProduct: (product) => {
    const newProduct: Product = { ...product, id: generateId() };
    set((state) => {
      const updated = [...state.products, newProduct];
      saveToStorage(PRODUCTS_KEY, updated);
      return { products: updated };
    });
  },

  // Legacy helper for editing a product inside local state.
  updateProduct: (id, updates) => {
    set((state) => {
      const updated = state.products.map((p) => (p.id === id ? { ...p, ...updates } : p));
      saveToStorage(PRODUCTS_KEY, updated);
      return { products: updated };
    });
  },

  // Legacy helper for removing a product from local state.
  deleteProduct: (id) => {
    set((state) => {
      const updated = state.products.filter((p) => p.id !== id);
      saveToStorage(PRODUCTS_KEY, updated);
      return { products: updated };
    });
  },

  cartItems: [],
  cartBounce: false,

  // Add a product to the cart and trigger the cart icon bounce animation.
  addToCart: (product) => {
    if (product.soldOut) {
      return;
    }

    const now = Date.now();
    const lastAddedAt = recentAddToCartTimestamps.get(product.id) ?? 0;
    if (now - lastAddedAt < ADD_TO_CART_DEDUPE_MS) {
      return;
    }
    recentAddToCartTimestamps.set(product.id, now);

    set((state) => {
      const existing = state.cartItems.find((item) => item.product.id === product.id);
      if (existing) {
        return {
          cartItems: state.cartItems.map((item) =>
            item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
          ),
          cartBounce: true,
        };
      }
      return { cartItems: [...state.cartItems, { product, quantity: 1 }], cartBounce: true };
    });
    setTimeout(() => set({ cartBounce: false }), 400);
  },

  // Replace the current cart with items coming from the backend.
  setCartItems: (items) => {
    set({
      cartItems: items.map((item) => ({
        quantity: item.quantity,
        product: { ...item.product },
      })),
    });
  },

  // Remove one product line from the cart.
  removeFromCart: (productId) => {
    set((state) => ({ cartItems: state.cartItems.filter((item) => item.product.id !== productId) }));
  },

  // Change the quantity of a cart item or remove it when it reaches zero.
  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(productId);
      return;
    }
    set((state) => ({
      cartItems: state.cartItems.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      ),
    }));
  },

  // Empty the customer cart after checkout or logout.
  clearCart: () => set({ cartItems: [] }),

  // Play the cart badge bounce animation manually.
  triggerBounce: () => {
    set({ cartBounce: true });
    setTimeout(() => set({ cartBounce: false }), 400);
  },

  orders: loadFromStorage<Order[]>(ORDERS_KEY, []),

  // Legacy helper that builds an order object from the current cart data.
  placeOrder: (data) => {
    const { settings } = get();
    const subtotal = data.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const total = subtotal + settings.shippingFee;

    const newOrder: Order = {
      id: generateOrderId(),
      paymongoLinkId: data.paymongoLinkId,
      orderedBy: data.orderedBy,
      ...data,
      paymentStatus: data.paymentMethod === 'online_payment' ? 'unpaid' : 'pending',
      deliveryStatus: 'placed',
      total,
      subtotal,
      shippingFee: settings.shippingFee,
      createdAt: new Date().toISOString(),
      estimatedDelivery: '2-4 hours',
      courierName: 'Assignment Pending',
      courierPhone: 'TBD',
      lastUpdated: new Date().toISOString(),
      customerMarkedDelivered: false,
      audited: false,
      archived: false,
    };

    set((state) => {
      const updated = [newOrder, ...state.orders];
      saveToStorage(ORDERS_KEY, updated);
      return { orders: updated };
    });

    return newOrder;
  },

  // Update the delivery progress of one order in local state.
  updateOrderStatus: (orderId, status) => {
    set((state) => {
      const updated = state.orders.map((order) =>
        order.id === orderId
          ? { ...order, deliveryStatus: status, lastUpdated: new Date().toISOString() }
          : order
      );
      saveToStorage(ORDERS_KEY, updated);
      return { orders: updated };
    });
  },

  // Update the payment status of one order in local state.
  updatePaymentStatus: (orderId, status) => {
    set((state) => {
      const updated = state.orders.map((order) =>
        order.id === orderId
          ? { ...order, paymentStatus: status, lastUpdated: new Date().toISOString() }
          : order
      );
      saveToStorage(ORDERS_KEY, updated);
      return { orders: updated };
    });
  },

  // Save the PayMongo link ID for a specific order.
  updateOrderLinkId: (orderId, linkId) => {
    set((state) => {
      const updated = state.orders.map((o) =>
        o.id === orderId ? { ...o, paymongoLinkId: linkId } : o
      );
      saveToStorage(ORDERS_KEY, updated);
      return { orders: updated };
    });
  },

  // Merge general order changes into one saved order.
  updateOrder: (orderId, updates) => {
    set((state) => {
      const updated = state.orders.map((o) =>
        o.id === orderId ? { ...o, ...updates, lastUpdated: new Date().toISOString() } : o
      );
      saveToStorage(ORDERS_KEY, updated);
      return { orders: updated };
    });
  },

  // Find one order by ID inside the local order cache.
  getOrderById: (orderId) => get().orders.find((order) => order.id === orderId),

  // Replace the local order cache with the latest backend data.
  setOrders: (orders) => {
    saveToStorage(ORDERS_KEY, orders);
    set({ orders });
  },

  // Insert a new order or replace an existing one in local state.
  upsertOrder: (order) => {
    set((state) => {
      const exists = state.orders.some((o) => o.id === order.id);
      const updated = exists
        ? state.orders.map((o) => (o.id === order.id ? order : o))
        : [order, ...state.orders];
      saveToStorage(ORDERS_KEY, updated);
      return { orders: updated };
    });
  },

  audits: loadFromStorage<AuditRecord[]>(AUDITS_KEY, []),

  // Create a new audit record inside local state.
  addAudit: (audit) => {
    const now = new Date().toISOString();
    const newAudit: AuditRecord = {
      ...audit,
      id: 'AUD-' + generateId(),
      createdAt: now,
      updatedAt: now,
    };
    set((state) => {
      const updated = [newAudit, ...state.audits];
      saveToStorage(AUDITS_KEY, updated);
      return { audits: updated };
    });
  },

  // Edit an existing audit record inside local state.
  updateAudit: (auditId, updates) => {
    set((state) => {
      const updated = state.audits.map((audit) => {
        if (audit.id !== auditId) return audit;
        const merged = { ...audit, ...updates, updatedAt: new Date().toISOString() };
        return {
          ...merged,
          netRevenue: Number(((merged.totalRevenue ?? 0) - (merged.expense ?? 0)).toFixed(2)),
        };
      });
      saveToStorage(AUDITS_KEY, updated);
      return { audits: updated };
    });
  },

  // Remove an audit record from local state.
  deleteAudit: (auditId) => {
    set((state) => {
      const updated = state.audits.filter((audit) => audit.id !== auditId);
      saveToStorage(AUDITS_KEY, updated);
      return { audits: updated };
    });
  },

  // Replace the audit list with the latest backend copy.
  setAudits: (audits) => {
    saveToStorage(AUDITS_KEY, audits);
    set({ audits });
  },

  settings: loadFromStorage<ShopSettings>(SETTINGS_KEY, DEFAULT_SETTINGS),

  // Save shared business settings in the local cache.
  updateSettings: (updates) => {
    set((state) => {
      const updated = { ...state.settings, ...updates };
      saveToStorage(SETTINGS_KEY, updated);
      return { settings: updated };
    });
  },

  storeStatus: loadFromStorage<StoreStatus>(STORE_STATUS_KEY, DEFAULT_STORE_STATUS),

  // Save the latest store open or close status in local cache.
  setStoreStatus: (storeStatus) => {
    saveToStorage(STORE_STATUS_KEY, storeStatus);
    set({ storeStatus });
  },

  checkoutDraft: loadFromStorage<CheckoutDraft>(CHECKOUT_DRAFT_KEY, DEFAULT_CHECKOUT_DRAFT),

  // Save partial checkout form values while the customer is typing.
  setCheckoutDraft: (draft) => {
    set((state) => {
      const updated = { ...state.checkoutDraft, ...draft };
      saveToStorage(CHECKOUT_DRAFT_KEY, updated);
      return { checkoutDraft: updated };
    });
  },

  // Reset the checkout form back to its empty default values.
  clearCheckoutDraft: () => {
    const clearedDraft = { ...DEFAULT_CHECKOUT_DRAFT };
    saveToStorage(CHECKOUT_DRAFT_KEY, clearedDraft);
    set({ checkoutDraft: clearedDraft });
  },
}));
