// Build the default backend URL for LAN use when no env override is set.
function getDefaultApiBase() {
  if (typeof window === 'undefined') {
    return 'http://localhost:8000';
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
}

// Base URL used by every frontend request to the Django backend.
export const API_BASE = (import.meta.env.VITE_API_BASE || getDefaultApiBase()).replace(/\/$/, '');

// Helper for GET requests to the backend API.
export async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  const data = await res.json();
  return { ok: res.ok && (data.ok ?? true), data };
}

// Helper for POST requests to the backend API.
export async function apiPost(path: string, body: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok && (data.ok ?? true), data };
}
