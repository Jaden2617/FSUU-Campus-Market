import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Loads Google's sign-in script once
let scriptPromise = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Couldn't load Google sign-in"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// The official "Continue with Google" button.
// Google checks the account, then our backend checks it's an FSUU email.
export default function GoogleButton({ clientId, schoolEmail, mode, onLogin, onError }) {
  const box = useRef(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onLogin, onError });
  callbacks.current = { onLogin, onError };

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !box.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          hd: schoolEmail?.replace(/^@/, "") || undefined, // only show FSUU Google accounts
          ux_mode: "popup",
          context: mode === "register" ? "signup" : "signin",
          callback: async (response) => {
            setLoading(true);
            callbacks.current.onError("");
            try {
              const data = await api("/auth/google", { method: "POST", body: { credential: response.credential } });
              callbacks.current.onLogin(data);
            } catch (err) {
              callbacks.current.onError(err.message);
            } finally {
              setLoading(false);
            }
          },
        });
        const dark = document.documentElement.dataset.theme === "dark";
        box.current.innerHTML = "";
        window.google.accounts.id.renderButton(box.current, {
          type: "standard",
          theme: dark ? "filled_black" : "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "center",
          width: Math.min(400, Math.max(200, box.current.clientWidth || 320)),
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [clientId, schoolEmail, mode]);

  if (!clientId) return null;

  return (
    <>
      <div className="google-box">
        <div ref={box} className={`google-btn ${loading ? "busy" : ""}`} />
        {loading && <p className="muted small center">Signing you in...</p>}
        {failed && <p className="muted small center">Google sign-in couldn't load. Check your internet, or use your email below.</p>}
      </div>
      <div className="or-line">
        <span>or use your FSUU email</span>
      </div>
    </>
  );
}
