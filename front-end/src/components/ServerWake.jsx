import { useEffect, useState } from "react";
import { API } from "../api";

// The free online server sleeps when nobody uses it for 15 minutes.
// This shows a friendly notice while it wakes up (can take about a minute).
export default function ServerWake() {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    let done = false;
    const timer = setTimeout(() => !done && setWaking(true), 2500);

    async function ping() {
      while (!done) {
        try {
          const res = await fetch(`${API}/`);
          if (res.ok) break;
        } catch {
          // server not ready yet, try again
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      done = true;
      clearTimeout(timer);
      setWaking(false);
    }
    ping();

    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, []);

  if (!waking) return null;
  return (
    <div className="wake-banner" role="status">
      <span className="spinner" />
      Waking up the server. This can take up to a minute the first time...
    </div>
  );
}
