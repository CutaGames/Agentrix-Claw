use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::sync::Mutex;

static MDNS_DAEMON: Mutex<Option<ServiceDaemon>> = Mutex::new(None);

const SERVICE_TYPE: &str = "_agentrix._tcp.local.";
const SERVICE_PORT: u16 = 9527;

/// Start broadcasting mDNS service on LAN.
/// Called once during app setup.
pub fn start_mdns_broadcast(device_name: &str, version: &str, ws_port: u16) -> Result<(), String> {
    let daemon = ServiceDaemon::new().map_err(|e| format!("mDNS daemon error: {e}"))?;

    let host = format!("{}.local.", hostname::get().unwrap_or_default().to_string_lossy());
    let instance_name = format!("Agentrix-{device_name}");

    let props = [
        ("version", version),
        ("device", device_name),
        ("wsPort", &ws_port.to_string()),
    ];

    let service = ServiceInfo::new(
        SERVICE_TYPE,
        &instance_name,
        &host,
        "",
        ws_port,
        &props[..],
    )
    .map_err(|e| format!("mDNS service info error: {e}"))?;

    daemon
        .register(service)
        .map_err(|e| format!("mDNS register error: {e}"))?;

    *MDNS_DAEMON.lock().unwrap() = Some(daemon);
    Ok(())
}

/// Stop mDNS broadcast gracefully.
pub fn stop_mdns_broadcast() {
    if let Some(daemon) = MDNS_DAEMON.lock().unwrap().take() {
        let _ = daemon.shutdown();
    }
}

/// Discover LAN peers (returns list of discovered services, waits `timeout_ms`).
pub fn discover_peers(timeout_ms: u64) -> Result<Vec<DiscoveredPeer>, String> {
    let daemon = ServiceDaemon::new().map_err(|e| format!("mDNS browse error: {e}"))?;
    let receiver = daemon
        .browse(SERVICE_TYPE)
        .map_err(|e| format!("mDNS browse error: {e}"))?;

    let mut peers = Vec::new();
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);

    while std::time::Instant::now() < deadline {
        match receiver.recv_timeout(std::time::Duration::from_millis(200)) {
            Ok(mdns_sd::ServiceEvent::ServiceResolved(info)) => {
                let ws_port = info
                    .get_properties()
                    .get_property_val_str("wsPort")
                    .and_then(|v| v.parse::<u16>().ok())
                    .unwrap_or(SERVICE_PORT);
                let device = info
                    .get_properties()
                    .get_property_val_str("device")
                    .unwrap_or_default()
                    .to_string();
                let version = info
                    .get_properties()
                    .get_property_val_str("version")
                    .unwrap_or_default()
                    .to_string();
                let addresses: Vec<String> =
                    info.get_addresses().iter().map(|a| a.to_string()).collect();

                peers.push(DiscoveredPeer {
                    name: info.get_fullname().to_string(),
                    device,
                    version,
                    ws_port,
                    addresses,
                });
            }
            Ok(_) => {} // other events
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(_) => break,
        }
    }

    let _ = daemon.shutdown();
    Ok(peers)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiscoveredPeer {
    pub name: String,
    pub device: String,
    pub version: String,
    pub ws_port: u16,
    pub addresses: Vec<String>,
}
