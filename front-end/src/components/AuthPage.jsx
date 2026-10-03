import { useState } from "react";
import { api } from "../api";

const emptyForm = { name: "", email: "", contact: "", password: "" };

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api(`/${mode}`, { method: "POST", body: form });
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <span className="brand-mark big">CM</span>
        <h1>FSUU Campus Market</h1>
        <p>Buy, sell, and find what you need from fellow Urians. Verified students only, meetups on campus.</p>
        <ul className="auth-points">
          <li>🛒 Sell food, preloved items, and services</li>
          <li>🔎 Post what you're looking for</li>
          <li>💬 Chat with buyers and sellers</li>
        </ul>
      </div>

      <form className="card auth-card" onSubmit={handleSubmit}>
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="muted">
          {mode === "login" ? "Log in with your FSUU email." : "Only FSUU emails can register."}
        </p>

        {mode === "register" && (
          <>
            <input name="name" placeholder="Full name" value={form.name} onChange={handleChange} required />
            <input
              name="contact"
              placeholder="Contact (FB name or phone)"
              value={form.contact}
              onChange={handleChange}
              required
            />
          </>
        )}
        <input name="email" type="email" placeholder="FSUU email" value={form.email} onChange={handleChange} required />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
        />

        {error && <p className="error">{error}</p>}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Register"}
        </button>

        <p className="switch">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Register" : "Log in"}
          </button>
        </p>
      </form>
    </div>
  );
}
