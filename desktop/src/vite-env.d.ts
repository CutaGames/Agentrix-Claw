/// <reference types="vite/client" />

declare module "*.svg" {
  const content: string;
  export default content;
}

// Tauri window dragging — extend CSS properties
import "react";
declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}
