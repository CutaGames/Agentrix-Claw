import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { I18nProvider } from "./i18n/I18nProvider";
// Desktop D1 — shared design tokens v1 (--ax-*), then desktop styles that map onto them.
import "../../shared/design-tokens/tokens.css";
import "./styles/global.css";
import { installEmergencyStopListener } from "./services/executionFence";
import { installStagingGateFetch } from "./services/apiTarget";
import { installAppearance } from "./services/appearance";

// Desktop D0 — every window (main, chat panel, pet) listens for the tray /
// shortcut emergency stop and mirrors kill-switch changes from other windows.
// REQ-desktop-026: started against staging → the page's own fetch carries the gate header.
installStagingGateFetch();
installEmergencyStopListener();
// Desktop D1 — appearance mode (D11) for every window, before first paint.
installAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
