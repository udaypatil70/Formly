import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GlobalProviders } from "~/providers/global";
import { App } from "~/src/App";
import "~/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlobalProviders>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GlobalProviders>
  </StrictMode>,
);