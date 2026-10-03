import { useState } from "react";
import { api } from "../api";

const emptyForm = { name: "", email: "", contact: "", password: "" };

export default function AuthPage({ onLogin, config }) {
  const [mode, setMode] = useState("login"); // login | register | verify
  const [form, setForm] = useState(emptyForm);
  const [code, setCode] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      if (mode === "verify") {
        onLogin(await api("/verify-email", { method: "POST", body: { email: verifyEmail, code } }));
        return;
      }
      const data = await api(`/${mode}`, { method: "POST", body: form });
      if (data.needs_verification) {
        setVerifyEmail(data.email);
        setMode("verify");
        setInfo(`We sent a 6-digit code to ${data.email}. Check your inbox (and Spam folder).`);
      } else {
        onLogin(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError("");
    setInfo("");
    try {
      await api("/resend-code", { method: "POST", body: { email: verifyEmail } });
      setInfo("A new code is on the way.");
    } catch (err) {
      setError(err.message);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setInfo("");
  }

  const school = config?.school_email || "@urios.edu.ph";

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <span className="brand-mark big">UM</span>
        <h1>Urios Market</h1>
        <p>Buy, sell, and find what you need from fellow Urians. Verified students only, meetups on campus.</p>
        <ul className="auth-points">
          <li>🛒 Sell food, preloved items, and services</li>
          <li>🔎 Post what you're looking for</li>
          <li>💬 Chat, add friends, and rate sellers</li>
        </ul>
      </div>

      <form className="card auth-card" onSubmit={handleSubmit}>
        {mode === "verify" ? (
          <>
            <h2>Check your email</h2>
            {info && <p className="success">{info}</p>}
            <input
              className="code-input"
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button className="btn-primary" type="submit" disabled={loading || code.length !== 6}>
              {loading ? "Checking..." : "Verify and continue"}
            </button>
            <p className="switch">
              Didn't get it?{" "}
              <button type="button" className="link-btn" onClick={resend}>
                Send a new code
              </button>
            </p>
            <p className="switch">
              <button type="button" className="link-btn" onClick={() => switchMode("login")}>
                Back to log in
              </button>
            </p>
          </>
        ) : (
          <>
            <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p className="muted">
              {mode === "login" ? "Log in with your FSUU email." : `Only FSUU emails (${school}) can register.`}
            </p>

            {mode === "register" && (
              <>
                <input name="name" placeholder="Full name" value={form.name} onChange={handleChange} required />
                <input name="contact" placeholder="Contact (FB name or phone)" value={form.contact} onChange={handleChange} required />
              </>
            )}
            <input name="email" type="email" placeholder={`FSUU email (…${school})`} value={form.email} onChange={handleChange} required />
            <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} required />

            {error && <p className="error">{error}</p>}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Register"}
            </button>

            <p className="switch">
              {mode === "login" ? "No account yet? " : "Already have an account? "}
              <button type="button" className="link-btn" onClick={() => switchMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "Register" : "Log in"}
              </button>
            </p>
          </>
        )}
      </form>
    </div>
  );
}
