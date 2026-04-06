import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { useAppStore } from "@/store/appStore";

// Sync localStorage changes across tabs/windows in real-time
window.addEventListener('storage', () => {
  useAppStore.setState({
    products: JSON.parse(localStorage.getItem('aq_products') || '[]'),
    orders: JSON.parse(localStorage.getItem('aq_orders') || '[]'),
    settings: JSON.parse(localStorage.getItem('aq_settings') || 'null') ?? {
      businessName: 'AguasShop', shippingFee: 50, currency: 'PHP', currencySymbol: '₱',
    },
  });
});

// Bootstrap the React app into the root HTML element.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
