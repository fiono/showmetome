import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Submit } from "./pages/Submit";
import { Dashboard } from "./pages/Dashboard";
import "./styles.css";

function App() {
  return (
    <BrowserRouter>
      <div className="shell">
        <header className="site-header">
          <Link to="/" className="site-title mono">
            SHOWMETOME
          </Link>
          <span className="site-tag">how your friends see you</span>
        </header>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/s/:shareToken" element={<Submit />} />
          <Route path="/r/:ownerToken" element={<Dashboard />} />
          <Route path="*" element={<div className="card small">Nothing here.</div>} />
        </Routes>
        <footer className="site">
          Quiz items from the{" "}
          <a href="https://dynomight.net/mbti/">Fastest Personality Test</a> by DYNOMIGHT.
        </footer>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
