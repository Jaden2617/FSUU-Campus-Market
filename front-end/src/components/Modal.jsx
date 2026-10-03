import { useEffect } from "react";
import Icon from "./Icon";

// A pop-up window. Closes with the X, the Esc key, or by clicking outside.
export default function Modal({ title, onClose, children, wide = false, as = "div", onSubmit }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  const Box = as;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Box className={`card modal ${wide ? "wide" : ""}`} onSubmit={onSubmit}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <Icon name="close" size={20} />
          </button>
        </header>
        {children}
      </Box>
    </div>
  );
}

// 1 to 5 stars. Clickable when onChange is given.
export function Stars({ value = 0, onChange, size = 18 }) {
  return (
    <span className={`stars ${onChange ? "clickable" : ""}`} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button type="button" key={n} onClick={() => onChange(n)} className={n <= value ? "on" : ""} title={`${n} star${n > 1 ? "s" : ""}`}>
            <Icon name="star" size={size} filled={n <= value} />
          </button>
        ) : (
          <span key={n} className={n <= Math.round(value) ? "on" : ""}>
            <Icon name="star" size={size} filled={n <= Math.round(value)} />
          </span>
        )
      )}
    </span>
  );
}
