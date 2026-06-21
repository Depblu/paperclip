import React from "react";
import { createRoot } from "react-dom/client";
import { CampusApp } from "./CampusApp";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root_missing");

createRoot(root).render(
  <React.StrictMode>
    <CampusApp />
  </React.StrictMode>,
);
