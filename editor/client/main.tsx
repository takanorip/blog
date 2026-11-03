import { Toasty } from "@cloudflare/kumo/components/toast";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { toastManager } from "./toast";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <Toasty toastManager={toastManager}>
      <App />
    </Toasty>
  </StrictMode>,
);
