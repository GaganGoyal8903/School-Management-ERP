import { useEffect, useState } from "react";

function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem("autovyn_theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("autovyn_theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button type="button" className="theme-toggle-btn" onClick={() => setDark((prev) => !prev)}>
      {dark ? "Light" : "Dark"}
    </button>
  );
}

export default ThemeToggle;
