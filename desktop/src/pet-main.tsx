/**
 * Pet window entry (E64 / I-030).
 *
 * The pet used to load `index.html` → `App`, which runs every app-level effect
 * (sockets, wake word, clipboard and window polling, panels) in the pet's
 * WebView too. The pet only needs itself: this entry renders just
 * `PetCompanionWindow`, plus the emergency-stop listener and appearance that
 * every Agentrix window installs.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary";
import PetCompanionWindow from "./components/PetCompanionWindow";
import { I18nProvider } from "./i18n/I18nProvider";
import "../../shared/design-tokens/tokens.css";
import "./styles/global.css";
import { installEmergencyStopListener } from "./services/executionFence";
import { installAppearance } from "./services/appearance";

installEmergencyStopListener();
installAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <PetCompanionWindow />
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
