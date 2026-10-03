import { useEffect, useState } from "react";

const API = "http://127.0.0.1:8000";

const emptyForm = {
  title: "",
  price: "",
  category: "Food",
  description: "",
  seller_name: "",
  contact: "",
};

function App() {
  const [listings, setListings] = useState([]);
  const [form, setForm] = useState(emptyForm);

  function loadListings() {
    fetch(`${API}/listings`)
      .then((res) => res.json())
      .then((data) => setListings(data));
  }

  useEffect(() => {
    loadListings();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e) {
    e.preventDefault();
    fetch(`${API}/listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, price: Number(form.price) }),
    }).then(() => {
      setForm(emptyForm);
      loadListings();
    });
  }

  return (
    <div className="page">
      <h1>FSUU Campus Market</h1>

      <form className="post-form" onSubmit={handleSubmit}>
        <h2>Sell an item</h2>
        <input name="title" placeholder="Item name" value={form.title} onChange={handleChange} required />
        <input name="price" type="number" placeholder="Price (₱)" value={form.price} onChange={handleChange} required />
        <select name="category" value={form.category} onChange={handleChange}>
          <option>Food</option>
          <option>Preloved</option>
          <option>Services</option>
        </select>
        <textarea name="description" placeholder="Description" value={form.description} onChange={handleChange} />
        <input name="seller_name" placeholder="Your name" value={form.seller_name} onChange={handleChange} required />
        <input name="contact" placeholder="Contact (FB name or phone)" value={form.contact} onChange={handleChange} required />
        <button type="submit">Post item</button>
      </form>

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