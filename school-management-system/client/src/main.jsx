import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Toaster 
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#002366',
          color: '#fffbf2',
          fontFamily: "'Playfair Display', Georgia, serif",
        },
        success: {
          iconTheme: {
            primary: '#c5a059',
            secondary: '#002366',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fffbf2',
          },
        },
      }}
    />
    <App />
  </React.StrictMode>
);

