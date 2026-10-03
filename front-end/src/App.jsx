import { useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

const emptyListing = { title: "", price: "", category: "Food", description: "" };
const emptyAuth = { name: "", email: "", contact: "", password: "" };

function App() {
  const [listings, setListings] = useState([]);
  const [listingForm, setListingForm] = useState(emptyListing);
  const [authForm, setAuthForm] = useState(emptyAuth);
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user") || "null"));

  function loadListings() {
    fetch(`${API}/listings`)
      .then((res) => res.json())
      .then((data) => setListings(data));
  }

  useEffect(() => {
    loadListings();
  }, []);

  function handleAuthChange(e) {
    setAuthForm({ ...authForm, [e.target.name]: e.target.value });
  }

  function handleListingChange(e) {
    setListingForm({ ...listingForm, [e.target.name]: e.target.value });
  }

  function showError(data) {
    setError(typeof data.detail === "string" ? data.detail : "Please fill in all fields correctly");
  }

  async function handleAuth(e) {
    e.preventDefault();
    setError("");
    const res = await fetch(`${API}/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authForm),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data);
      return;
    }
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setAuthForm(emptyAuth);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }

  async function handleSell(e) {
    e.preventDefault();
    setError("");
    const res = await fetch(`${API}/listings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...listingForm, price: Number(listingForm.price) }),
    });
    if (res.status === 401 || res.status === 403) {
      logout();
      setError("Please log in again");
      return;
    }
    if (!res.ok) {
      showError(await res.json());
      return;
    }
    setListingForm(emptyListing);
    loadListings();
  }

  return (
    <div className="page">
      <header className="header">
        <h1>FSUU Campus Market</h1>
        {user && (
          <div className="user-box">
            <span>Hi, {user.name}!</span>
            <button className="link-btn" onClick={logout}>Log out</button>
          </div>
        )}
      </header>

      {user ? (
        <form className="post-form" onSubmit={handleSell}>
          <h2>Sell an item</h2>
          <input name="title" placeholder="Item name" value={listingForm.title} onChange={handleListingChange} required />
          <input name="price" type="number" placeholder="Price (₱)" value={listingForm.price} onChange={handleListingChange} required />
          <select name="category" value={listingForm.category} onChange={handleListingChange}>
            <option>Food</option>
            <option>Preloved</option>
            <option>Services</option>
          </select>
          <textarea name="description" placeholder="Description" value={listingForm.description} onChange={handleListingChange} />
          <p className="hint">Buyers will contact you at: {user.contact}</p>
          {error && <p className="error">{error}</p>}
          <button type="submit">Post item</button>
        </form>
      ) : (
        <form className="post-form" onSubmit={handleAuth}>
          <h2>{mode === "login" ? "Log in to sell" : "Create an account"}</h2>
          {mode === "register" && (
            <>
              <input name="name" placeholder="Full name" value={authForm.name} onChange={handleAuthChange} required />
              <input name="contact" placeholder="Contact (FB name or phone)" value={authForm.contact} onChange={handleAuthChange} required />
            </>
          )}
          <input name="email" type="email" placeholder="FSUU email" value={authForm.email} onChange={handleAuthChange} required />
          <input name="password" type="password" placeholder="Password" value={authForm.password} onChange={handleAuthChange} required />
          {error && <p className="error">{error}</p>}
          <button type="submit">{mode === "login" ? "Log in" : "Register"}</button>
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
      )}

      <h2>Items for sale</h2>
      {listings.length === 0 && <p>No items yet. Be the first to sell!</p>}

      <div className="grid">
        {listings.map((item) => (
          <div className="card" key={item.id}>
            <span className="tag">{item.category}</span>
            <h3>{item.title}</h3>
            <p className="price">₱{item.price.toLocaleString()}</p>
            <p>{item.description}</p>
            <p className="seller">Seller: {item.seller_name} · {item.contact}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;