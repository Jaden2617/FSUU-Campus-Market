import { useEffect, useState } from "react";

// Tiny router using the part of the address after "#",
// e.g. uriosmarket.onrender.com/#/profile/5
function readHash() {
  const path = window.location.hash.replace(/^#/, "") || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function useRoute() {
  const [path, setPath] = useState(readHash);
  useEffect(() => {
    const onChange = () => {
      setPath(readHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const parts = path.split("/").filter(Boolean);
  return { path, parts };
}

export function navigate(path) {
  if (readHash() === path) return;
  window.location.hash = path;
}
