import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Results from "./Results.jsx";

// /results is the private review view (not linked from the public nav);
// everything else is the storefront. Hosting rewrites all paths here.
const Page = window.location.pathname.replace(/\/+$/, "") === "/results" ? Results : App;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
