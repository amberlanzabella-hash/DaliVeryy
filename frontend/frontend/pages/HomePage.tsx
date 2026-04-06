import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Package, Truck, Shield, Clock, Star, ArrowRight, Check, ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, Product } from '@/store/appStore';
import daliveryLogo from '../../../dalivery_logo.png';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/utils';

// Reusable card for showing one product in the customer catalog.
function ProductCard({ product }: { product: Product }) {
  const { addToCart, cartItems, settings } = useAppStore();
  const [added, setAdded] = useState(false);
  const inCart = cartItems.find((i) => i.product.id === product.id);
  const sym = settings.currencySymbol;
  const isSoldOut = Boolean(product.soldOut);

  // Button for adding this product to the cart when it is available.
  const handleAdd = () => {
    if (isSoldOut) return;
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      layout
      className="glass-card rounded-2xl overflow-hidden group hover:border-[#4A7FE0]/20 transition-all duration-300"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
    >
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-[#EEF4FF]">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-[#C0D0E0]" />
          </div>
        )}
        <div className={cn(
          'absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent',
          isSoldOut && 'bg-black/45'
        )} />
        {product.badge && (
          <span className="absolute top-3 left-3 bg-[#4A7FE0] text-white text-xs font-bold px-2.5 py-1 rounded-full font-space">
            {product.badge}
          </span>
        )}
        {isSoldOut && (
          <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full font-space">
            Sold Out
          </span>
        )}
        {!isSoldOut && inCart && (
          <span className="absolute top-3 right-3 bg-emerald-500/20 text-emerald-400 text-xs font-medium px-2 py-1 rounded-full border border-emerald-500/30 font-space">
            In Cart ×{inCart.quantity}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-syne font-bold text-[#1A2E4A] text-lg leading-tight">{product.name}</h3>
          <span className="font-syne font-bold text-[#4A7FE0] text-lg ml-2 shrink-0">
            {sym}{product.price.toFixed(2)}
          </span>
        </div>
        <p className="font-space text-[#4A6080] text-sm mb-4 leading-relaxed line-clamp-2">
          {product.description}
        </p>
        {isSoldOut && (
          <p className="font-space text-red-500 text-xs font-semibold mb-4">
            This product is currently sold out and cannot be ordered.
          </p>
        )}
        <div className="flex items-center justify-between">
          <span className="font-space text-xs text-[#8A9EB8] bg-[#F4F8FF] px-2.5 py-1 rounded-full border border-[#DDE6F5]">
            {product.category}
          </span>
          {/* Button for adding an available product to the cart. */}
          <button
            onClick={handleAdd}
            disabled={isSoldOut}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl font-space text-sm font-semibold transition-all duration-200',
              isSoldOut
                ? 'bg-[#E5ECF8] text-[#8A9EB8] border border-[#D5DFEF] cursor-not-allowed'
                : added
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-[#4A7FE0] text-white hover:bg-[#5B8DEF] active:scale-95'
            )}
          >
            {isSoldOut ? (
              'Sold Out'
            ) : added ? (
              <><Check className="w-4 h-4" />Added!</>
            ) : (
              <><ShoppingCart className="w-4 h-4" />Add to Cart</>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// Customer homepage that shows the hero section and live product list.
export default function HomePage() {
  // State for the selected product category filter.
  const [activeCategory, setActiveCategory] = useState('All');
  const navigate = useNavigate();
  const { products, settings, setProducts } = useAppStore();

  useEffect(() => {
    let isMounted = true;

    // Load the latest products from the shared backend.
    const refreshProducts = async () => {
      const res = await apiGet('/api/products/products/');
      if (!isMounted || !res.ok || !Array.isArray(res.data.products)) return;
      setProducts(res.data.products);
    };

    // Refresh products when the user returns to the app window.
    const handleFocus = () => {
      void refreshProducts();
    };

    // Refresh products when the tab becomes visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshProducts();
      }
    };

    void refreshProducts();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshProducts();
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
  }, [setProducts]);

  // Build the category chips shown above the product grid.
  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category)))];

  // Filter the visible products based on the selected category.
  const filteredProducts =
    activeCategory === 'All'
      ? products
      : products.filter((p) => p.category === activeCategory);

  // Short marketing highlights displayed in the hero section.
  const features = [
    { icon: Clock, label: 'Fast Delivery', desc: 'Cash? Cashless? We Accept Both!' },
    { icon: Shield, label: 'Food Safety', desc: 'Ensures protected packaging' },
    { icon: Truck, label: 'Track It!', desc: 'Monitor Your Food, Anywhere.' },
  ];

  return (
    <div className="min-h-screen bg-[#EEF2FA]">
      {/* Hero Section */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0 mesh-gradient" />
        <div className="noise-overlay" />

        {/* Decorative Elements */}
        <div className="absolute top-1/4 right-0 w-96 h-96 rounded-full bg-[#4A7FE0]/5 blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 rounded-full bg-blue-500/5 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <div className="inline-flex items-center gap-2 bg-[#4A7FE0]/10 border border-[#4A7FE0]/20 rounded-full px-4 py-2 mb-6">
                <span className="w-2 h-2 rounded-full bg-[#4A7FE0] animate-pulse" />
                <span className="font-space text-[#4A7FE0] text-sm font-medium">
                  Student Budget Friendly.
                </span>
              </div>

              <h1 className="font-syne font-extrabold text-[#1A2E4A] leading-tight mb-6">
                <span className="text-5xl sm:text-6xl lg:text-7xl block text-[#1A2E4A]/20">Affordable</span>
                <span className="text-5xl sm:text-6xl lg:text-7xl block text-[#4A7FE0]">
                  Delicious,
                </span>
                <span className="text-5xl sm:text-6xl lg:text-7xl block">Each Bite.</span>
              </h1>

              <p className="font-space text-[#4A6080] text-lg leading-relaxed mb-8 max-w-md">
                DaliVery wants to ensure that the food you order to us is freshly cooked, delicious, affordable,
                and assures that each bite is appetizing. We are committed to providing you with a delightful dining experience that satisfies your cravings which suits your budget.
              </p>

              {/* Main customer actions for starting a new order or tracking an existing one. */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => {
                    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="flex items-center justify-center gap-2 bg-[#4A7FE0] text-white font-syne font-bold text-base px-8 py-4 rounded-2xl hover:bg-[#5B8DEF] active:scale-95 transition-all duration-200 glow-blue"
                >
                  Start Your Order
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => navigate('/track')}
                  className="flex items-center justify-center gap-2 border border-[#10b981] text-[#3A5070] font-space font-medium text-base px-8 py-4 rounded-2xl hover:bg-[#EEF4FF] active:scale-95 transition-all duration-200"
                >
                  Track My Order
                </button>
              </div>

              {/* Feature Pills */}
              <div className="flex flex-wrap gap-3 mt-10">
                {features.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="flex items-center gap-2 bg-[#EEF4FF]/80 border border-[#DDE6F5] rounded-xl px-4 py-2.5"
                  >
                    <f.icon className="w-4 h-4 text-[#4A7FE0]" />
                    <div>
                      <div className="font-space font-semibold text-[#1A2E4A] text-xs">
                        {f.label}
                      </div>
                      <div className="font-space text-[#8A9EB8] text-xs">{f.desc}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right: Hero Visual */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
              className="hidden lg:flex items-center justify-center relative"
            >
              <div className="relative w-full max-w-md">
                {/* Floating Stats Cards */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute -top-6 -left-6 z-10 glass-card rounded-2xl p-4 min-w-[160px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                      <Check className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="font-syne font-bold text-[#1A2E4A] text-lg">99.9%</div>
                      <div className="font-space text-[#6A8098] text-xs">Loved by students</div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                  className="absolute -bottom-6 -right-6 z-10 glass-card rounded-2xl p-4 min-w-[160px]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#4A7FE0]/20 flex items-center justify-center">
                      <Star className="w-5 h-5 text-[#4A7FE0]" />
                    </div>
                    <div>
                      <div className="font-syne font-bold text-[#1A2E4A] text-lg">Affordable</div>
                      <div className="font-space text-[#6A8098] text-xs">For Everyone!</div>
                    </div>
                  </div>
                </motion.div>

                {/* Main Image */}
                <div className="rounded-3xl overflow-hidden glow-blue bg-white/70 border border-[#DDE6F5] backdrop-blur-sm">
                  <div className="relative flex h-[420px] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(74,127,224,0.18),_transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(238,244,255,0.92))] p-8">
                    <img
                      src={daliveryLogo}
                      alt="DaliVery logo"
                      className="h-full w-full object-contain drop-shadow-[0_18px_30px_rgba(43,75,131,0.18)]"
                    />
                    <div className="pointer-events-none absolute inset-x-10 bottom-8 h-12 rounded-full bg-[#4A7FE0]/10 blur-2xl" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section id="products" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="font-syne font-extrabold text-[#1A2E4A] text-4xl sm:text-5xl mb-4">
              Today's <span className="text-[#4A7FE0]">Menu:</span>
            </h2>
            <p className="font-space text-[#4A6080] text-lg max-w-xl mx-auto">
               Order your delicious on-the-go energy food to boost your day!
            </p>
          </motion.div>

          {/* Category Filter */}
          <div className="flex gap-3 overflow-x-auto pb-4 mb-10 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'shrink-0 px-5 py-2.5 rounded-full font-space text-sm font-medium transition-all duration-200',
                  activeCategory === cat
                    ? 'bg-[#4A7FE0] text-white shadow-lg shadow-amber-500/20'
                    : 'bg-[#EEF4FF]/80 text-[#3A5070] border border-[#DDE6F5] hover:border-[#4A7FE0]/30 hover:text-[#4a7fe0]'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map((product, index) => (
                <motion.div key={product.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: index * 0.05 }}>
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          {filteredProducts.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Package className="w-12 h-12 text-[#4A7FE0]/30" />
              <p className="font-syne font-bold text-[#9AAABB] text-lg">No products available yet.</p>
              <p className="font-space text-[#C0D0E0] text-sm">Check back soon!</p>
            </div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card rounded-3xl p-8 sm:p-12 relative overflow-hidden">
            <div className="absolute inset-0 mesh-gradient opacity-50" />
            <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { num: 'Lots', label: 'Of Delicious Food Choice!' },
                { num: 'Delicious', label: 'Food And Always Fresh' },
                { num: 'Affordable', label: 'To Everyone: Locals and Students' },
                { num: 'Opens', label: 'Daily!' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="font-syne font-extrabold text-[#4A7FE0] text-4xl sm:text-4xl mb-2">
                    {stat.num}
                  </div>
                  <div className="font-space text-[#4A6080] text-sm">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#DDE6F5] py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#4A7FE0] flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <span className="font-syne font-bold text-[#1A2E4A]">
              Dali<span className="text-[#4A7FE0]">Very</span>
            </span>
          </div>
          <div className="flex items-center gap-6">
            <p className="font-space text-[#8A9EB8] text-sm">
              © 2024 DaliVery. All rights reserved.
            </p>
            <a
              href="/admin"
              className="font-space text-[#C0D0E0] text-xs hover:text-[#6A8098] transition-colors"
            >
            
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
