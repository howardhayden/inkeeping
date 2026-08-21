import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ContinuityLab } from "./continuity-lab";
import "./globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("IN KEEPING could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <ContinuityLab />
  </StrictMode>,
);
