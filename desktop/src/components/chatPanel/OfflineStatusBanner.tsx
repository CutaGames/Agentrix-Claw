import type { CSSProperties } from "react";
import type { NetworkStatus } from "../../services/network";

type Props = {
  networkStatus?: NetworkStatus;
  offlineQueueCount: number;
};

const bannerBaseStyle: CSSProperties = {
  padding: "6px 16px",
  borderBottom: "1px solid var(--border)",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const queueStyle: CSSProperties = {
  margin: "4px 16px",
  padding: "6px 10px",
  borderRadius: 6,
  background: "color-mix(in srgb, var(--warning) 12%, transparent)",
  border: "1px solid color-mix(in srgb, var(--warning) 24%, transparent)",
  fontSize: 11,
  color: "var(--warning)",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export default function OfflineStatusBanner({ networkStatus = "online", offlineQueueCount }: Props) {
  const showNetworkBanner = networkStatus !== "online";
  const showQueue = offlineQueueCount > 0 && networkStatus !== "online";

  if (!showNetworkBanner && !showQueue) {
    return null;
  }

  const isOffline = networkStatus === "offline";

  return (
    <>
      {showNetworkBanner && (
        <div
          style={{
            ...bannerBaseStyle,
            background: isOffline
              ? "color-mix(in srgb, var(--danger) 13%, transparent)"
              : "color-mix(in srgb, var(--warning) 13%, transparent)",
            color: isOffline ? "var(--danger)" : "var(--warning)",
          }}
        >
          <span>{isOffline ? "Offline" : "Degraded"}</span>
          <span>
            {isOffline
              ? "Local mode remains available; cloud messages sync after reconnect."
              : "Connection is unstable; cloud features may retry or fall back."}
          </span>
        </div>
      )}
      {showQueue && (
        <div style={queueStyle}>
          <span>{offlineQueueCount} queued message{offlineQueueCount === 1 ? "" : "s"}</span>
          <span>will send automatically after reconnect.</span>
        </div>
      )}
    </>
  );
}