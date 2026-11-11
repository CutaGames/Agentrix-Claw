//! L8 D3 — the home always-on node (`agentrix-desktop --agentrix-node --config <file>`).
//!
//! A Raspberry Pi or a mini PC at home runs this binary with no window and no WebView: `main` calls
//! `node_main_if_requested` before any Tauri setup (the same way `--agentrix-mcp` and the snapshot hook work), so it
//! also runs on a Linux box without a display. Its whole job:
//!
//! - sign its capability declaration with its own device key now and then;
//! - ask the platform for its next home job (outbound calls only: the node opens no port and has no shell, SSH or
//!   remote desktop; anything but the two known tasks ends as a failed receipt);
//! - local inference: one request to a model server on THIS computer (`127.0.0.1`), nothing else;
//! - Home Assistant bridge: one call per granted job, with the long-lived token kept in a 0600 file here; every
//!   entity and action needs the owner's grant, and locks, alarms, covers and valves need a person's yes each time;
//! - answer every job with a receipt signed by the device key;
//! - stop at once on the emergency stop (the desktop app's state file or the node's own `STOP` file).
//!
//! Where the platform side lives: `backend/src/modules/home-node`, behind `HOME_NODE_V1_ENABLED`.
//! Not exercised against a running platform or a real Home Assistant here (see the impl notes).
pub mod config;
pub mod ha_bridge;
pub mod jobs;
mod keystore;
mod live;
pub mod runner;

use std::path::PathBuf;
use std::time::{Duration, Instant};

pub const NODE_FLAG: &str = "--agentrix-node";

#[derive(Debug, PartialEq, Eq)]
pub struct NodeArgs {
    pub config: Option<PathBuf>,
    /// Do one round (declare, take at most one job) and exit; for a first check by hand.
    pub once: bool,
    /// Print this node's device id (creating the key on first use) and exit; needed to pair the node.
    pub print_device_id: bool,
}

/// `None` = not node mode. `Some(Err)` = node mode with arguments that cannot be trusted.
pub fn parse_args(args: &[String]) -> Option<Result<NodeArgs, String>> {
    if args.first().map(String::as_str) != Some(NODE_FLAG) {
        return None;
    }
    let mut parsed = NodeArgs { config: None, once: false, print_device_id: false };
    let mut rest = args[1..].iter();
    while let Some(flag) = rest.next() {
        match flag.as_str() {
            "--config" => match rest.next() {
                Some(path) if parsed.config.is_none() && !path.is_empty() => parsed.config = Some(PathBuf::from(path)),
                _ => return Some(Err("--config needs one path".to_string())),
            },
            "--once" if !parsed.once => parsed.once = true,
            "--print-device-id" if !parsed.print_device_id => parsed.print_device_id = true,
            other => return Some(Err(format!("unexpected argument {other}"))),
        }
    }
    Some(Ok(parsed))
}

fn default_config_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config").join("agentrix").join("home-node.json"))
}

/// Called first thing in `main`. `Some(code)` means "node mode ran; exit now".
pub fn node_main_if_requested() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let parsed = match parse_args(&args)? {
        Ok(parsed) => parsed,
        Err(reason) => {
            eprintln!("agentrix node: {reason}");
            return Some(2);
        }
    };
    let Some(path) = parsed.config.clone().or_else(default_config_path) else {
        eprintln!("agentrix node: no --config given and HOME is not set");
        return Some(2);
    };
    let config = match config::load_config(&path) {
        Ok(config) => config,
        Err(code) => {
            eprintln!("agentrix node: {code}");
            return Some(2);
        }
    };
    let identity = match live::open_identity(&config) {
        Ok(identity) => identity,
        Err(code) => {
            eprintln!("agentrix node: {code}");
            return Some(1);
        }
    };
    let io = match live::LiveIo::new(config.clone(), identity) {
        Ok(io) => io,
        Err(code) => {
            eprintln!("agentrix node: {code}");
            return Some(2);
        }
    };
    if parsed.print_device_id {
        println!("{}", io.device_id());
        return Some(0);
    }
    eprintln!("agentrix node: started, device {}", io.device_id());
    Some(run(&config, &io, parsed.once))
}

/// The loop. Waits are short sleeps so an emergency stop or a job is noticed within the poll interval; a failure to
/// reach the platform backs off (never a tight loop) and is reported as a code only.
fn run(config: &config::NodeConfig, io: &live::LiveIo, once: bool) -> i32 {
    let poll = Duration::from_secs(config.poll_seconds());
    let declare_every = Duration::from_secs(config.declare_seconds());
    let mut last_declared: Option<Instant> = None;
    let mut failures: u32 = 0;
    loop {
        let mut worked = false;
        if io.is_stopped() {
            // While stopped the node says nothing and takes nothing; its last declaration simply runs out.
            eprintln!("agentrix node: stopped");
        } else {
            if last_declared.map(|at| at.elapsed() >= declare_every).unwrap_or(true) {
                match io.declare() {
                    Ok(()) => {
                        last_declared = Some(Instant::now());
                        failures = 0;
                    }
                    Err(code) => {
                        failures = failures.saturating_add(1);
                        eprintln!("agentrix node: declare failed: {code}");
                    }
                }
            }
            match io.next_job() {
                Ok(Some(job)) => {
                    worked = true;
                    match runner::process_claim(&job, io.capabilities(), io) {
                        // Only the reference, the kind of ending and the reason code: never the task or the answer.
                        Ok(outcome) => eprintln!("agentrix node: job {} {} ({})", outcome.job_ref, outcome.status, outcome.reason),
                        Err(code) => eprintln!("agentrix node: job not reported: {code}"),
                    }
                }
                Ok(None) => failures = 0,
                Err(code) => {
                    failures = failures.saturating_add(1);
                    eprintln!("agentrix node: poll failed: {code}");
                }
            }
        }
        if once {
            return if failures == 0 { 0 } else { 1 };
        }
        // After work, ask again at once; otherwise wait, longer after repeated failures (at most 5 minutes).
        if !worked {
            let factor = 1u64 << failures.min(6);
            std::thread::sleep((poll * factor as u32).min(Duration::from_secs(300)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn only_the_node_flag_starts_node_mode() {
        assert!(parse_args(&args(&[])).is_none());
        assert!(parse_args(&args(&["--agentrix-mcp", "--client", "cursor"])).is_none());
        assert!(parse_args(&args(&["--config", "x", NODE_FLAG])).is_none());
    }

    #[test]
    fn the_options_are_config_once_and_print_device_id() {
        let parsed = parse_args(&args(&[NODE_FLAG, "--config", "/etc/agentrix/home-node.json", "--once"])).unwrap().unwrap();
        assert_eq!(parsed, NodeArgs { config: Some(PathBuf::from("/etc/agentrix/home-node.json")), once: true, print_device_id: false });
        let id = parse_args(&args(&[NODE_FLAG, "--print-device-id"])).unwrap().unwrap();
        assert_eq!(id, NodeArgs { config: None, once: false, print_device_id: true });
        assert_eq!(parse_args(&args(&[NODE_FLAG])).unwrap().unwrap(), NodeArgs { config: None, once: false, print_device_id: false });
    }

    #[test]
    fn anything_else_is_refused_so_a_settings_file_cannot_smuggle_in_a_shell_or_a_port() {
        for bad in [
            vec![NODE_FLAG, "--listen", "0.0.0.0:8080"],
            vec![NODE_FLAG, "--shell"],
            vec![NODE_FLAG, "--config"],
            vec![NODE_FLAG, "--config", ""],
            vec![NODE_FLAG, "--config", "a", "--config", "b"],
            vec![NODE_FLAG, "--once", "--once"],
            vec![NODE_FLAG, "stray"],
        ] {
            assert!(parse_args(&args(&bad)).unwrap().is_err(), "{bad:?}");
        }
    }
}
