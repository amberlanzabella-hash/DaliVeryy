import { Product } from "../store/appStore";

export const products: Product[] = [
  {
    id: '1',
    name: 'Express Parcel',
    price: 29.99,
    description: 'Same-day delivery for parcels up to 5kg. Guaranteed within 4 hours.',
    category: 'Express',
    image: 'https://images.unsplash.com/photo-1609198093338-9ff073a0f28c?w=400&q=80',
    badge: 'Popular',
  },
  {
    id: '2',
    name: 'Standard Delivery',
    price: 14.99,
    description: 'Reliable next-day delivery for regular packages up to 10kg.',
    category: 'Standard',
    image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=400&q=80',
  },
  {
    id: '3',
    name: 'Fragile Item Delivery',
    price: 39.99,
    description: 'Specialized handling and packaging for delicate or fragile items.',
    category: 'Special',
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80',
    badge: 'Special Care',
  },
  {
    id: '4',
    name: 'Bulk Freight',
    price: 79.99,
    description: 'Heavy freight delivery for shipments over 20kg. Warehouse pickup available.',
    category: 'Freight',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
  },
  {
    id: '5',
    name: 'Cold Chain Delivery',
    price: 49.99,
    description: 'Temperature-controlled delivery for perishables and pharmaceuticals.',
    category: 'Special',
    image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=400&q=80',
    badge: 'Premium',
  },
  {
    id: '6',
    name: 'Document Courier',
    price: 9.99,
    description: 'Fast and secure delivery for important documents and contracts.',
    category: 'Express',
    image: 'https://images.unsplash.com/photo-1568667256549-094345857637?w=400&q=80',
  },
  {
    id: '7',
    name: 'International Shipping',
    price: 99.99,
    description: 'Door-to-door international shipping with full customs support.',
    category: 'International',
    image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&q=80',
    badge: 'Worldwide',
  },
  {
    id: '8',
    name: 'Economy Parcel',
    price: 7.99,
    description: 'Budget-friendly delivery for non-urgent packages within 3-5 business days.',
    category: 'Standard',
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400&q=80',
  },
];

export const categories = ['All', 'Express', 'Standard', 'Special', 'Freight', 'International'];
