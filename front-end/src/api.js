// Address of your FastAPI backend
export const API = "http://127.0.0.1:8000";

export function imageUrl(path) {
  return path ? `${API}${path}` : null;
}

// One helper for every request to the backend.
// - body: sent as JSON
// - form: sent as FormData (used for photo uploads)
export async function api(path, { method = "GET", body, form, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    const err = new Error("Can't reach the backend. Is uvicorn running?");
    err.status = 0;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof data.detail === "string" ? data.detail : "Please fill in all fields correctly");
    err.status = res.status;
    throw err;
  }
  return data;
}

export function peso(value) {
  return `₱${Number(value).toLocaleString()}`;
}

export function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export const CATEGORIES = ["Food", "Preloved", "Services", "School Supplies", "Gadgets", "Others"];
export const REACTIONS = ["👍", "❤️", "😮", "😂"];
