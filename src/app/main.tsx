import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Submit } from "./pages/Submit";
import { Dashboard } from "./pages/Dashboard";
import { Builder } from "./pages/Builder";
import { QuizStart } from "./pages/QuizStart";
import { SelfTake } from "./pages/SelfTake";
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
          <Route path="/build" element={<Builder />} />
          <Route path="/q/:quizId" element={<QuizStart />} />
          <Route path="/s/:shareToken" element={<Submit />} />
          <Route path="/r/:ownerToken" element={<Dashboard />} />
          <Route path="/r/:ownerToken/self" element={<SelfTake />} />
          <Route path="*" element={<div className="card small">Nothing here.</div>} />
        </Routes>
        <footer className="site">
          Your friends&rsquo; answers are stored so the subject can see them, aggregated and
          per person.
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
