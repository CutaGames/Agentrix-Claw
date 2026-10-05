//! L5 device rental, tasks that need a per-task virtual machine (E100 ③):
//! `sandbox.code.v1`, `media.transcode.v1`, `render.image.v1`. **Interface and
//! a fake only.** The real backend (Apple's Containerization / Virtualization
//! framework, one light VM per task) needs Apple silicon, macOS 26 and the
//! `com.apple.security.virtualization` entitlement (signing, OA-14); none of
//! these is on hand (OA-95 #7), and E100 ④ rules out a slow-boot fallback
//! below macOS 26. Windows is not planned (REQ-desktop-060 §1).
//!
//! What the interface pins down, so a real backend cannot skip it:
//! - every task gets a fresh VM from a pinned image (SHA-256) and a fresh
//!   scratch disk; nothing from the owner is mounted; input and output go
//!   only through the task channel, with size caps;
//! - no network unless the task category declares it, and then outbound only
//!   to listed hosts;
//! - the VM is destroyed when the task ends, whatever the outcome — success,
//!   failure, timeout or the emergency stop;
//! - the emergency stop is checked before boot and polled while running; an
//!   unreadable stop counts as engaged (the caller passes that check).
use std::time::{Duration, Instant};

/// Capability types that would run in a VM (`shared/types/device-capability.ts`).
pub const VM_CAPABILITY_TYPES: [&str; 3] = ["sandbox.code.v1", "media.transcode.v1", "render.image.v1"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NetworkPolicy {
    None,
    /// Outbound only, to these hosts (exact names, no wildcards).
    Outbound(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VmSpec {
    pub capability_type: String,
    /// `sha256` of the root filesystem image (lowercase hex).
    pub image_sha256: String,
    pub cpus: u32,
    pub memory_mib: u32,
    pub scratch_mib: u32,
    pub network: NetworkPolicy,
    pub wall: Duration,
    pub max_input_bytes: usize,
    pub max_output_bytes: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VmUnavailable {
    NeedsAppleSilicon,
    NeedsMacOs26,
    NeedsEntitlement,
    UnsupportedOs,
}

/// Can this computer run per-task VMs at all? The real check; no backend
/// exists yet, so even a capable Mac answers `NeedsEntitlement` for now.
pub fn host_support(os: &str, arch: &str, macos_major: Option<u32>) -> Result<(), VmUnavailable> {
    if os != "macos" {
        return Err(VmUnavailable::UnsupportedOs);
    }
    if arch != "aarch64" {
        return Err(VmUnavailable::NeedsAppleSilicon);
    }
    if macos_major.map_or(true, |major| major < 26) {
        return Err(VmUnavailable::NeedsMacOs26);
    }
    Err(VmUnavailable::NeedsEntitlement)
}

pub fn validate_spec(spec: &VmSpec) -> Result<(), &'static str> {
    if !VM_CAPABILITY_TYPES.contains(&spec.capability_type.as_str()) {
        return Err("vm_type_unknown");
    }
    if spec.image_sha256.len() != 64 || !spec.image_sha256.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')) {
        return Err("vm_image_pin_invalid");
    }
    if !(1..=64).contains(&spec.cpus) || !(256..=65_536).contains(&spec.memory_mib) || !(64..=262_144).contains(&spec.scratch_mib) {
        return Err("vm_resources_invalid");
    }
    if spec.wall.is_zero() || spec.wall > Duration::from_secs(3600) {
        return Err("vm_wall_invalid");
    }
    if let NetworkPolicy::Outbound(hosts) = &spec.network {
        let host_ok = |h: &String| {
            !h.is_empty() && h.len() <= 253 && h.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
        };
        if hosts.is_empty() || hosts.len() > 16 || !hosts.iter().all(host_ok) {
            return Err("vm_network_invalid");
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VmEnd {
    Completed,
    Failed,
    Timeout,
    OutputLimit,
    KillSwitch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VmOutcome {
    pub end: VmEnd,
    pub wall_ms: u64,
    /// Only on `Completed`.
    pub output: Option<Vec<u8>>,
}

/// One running VM, as the backend sees it.
pub trait VmBackend {
    type Handle;
    /// Boot a fresh VM from the pinned image with an empty scratch disk.
    fn boot(&mut self, spec: &VmSpec) -> Result<Self::Handle, &'static str>;
    /// Hand the input over the task channel and start the task.
    fn start(&mut self, handle: &mut Self::Handle, input: &[u8]) -> Result<(), &'static str>;
    /// `Some(result)` once the task has finished; `None` while running.
    fn poll(&mut self, handle: &mut Self::Handle) -> Option<Result<Vec<u8>, &'static str>>;
    /// Stop the VM and delete it and its scratch disk. Must be safe to call
    /// on a VM that already stopped.
    fn destroy(&mut self, handle: Self::Handle);
}

/// Run one task in a fresh VM. The VM is destroyed on every path.
pub fn run_vm_task<B: VmBackend>(
    backend: &mut B,
    spec: &VmSpec,
    input: &[u8],
    engaged: &dyn Fn() -> bool,
    poll_every: Duration,
) -> Result<VmOutcome, &'static str> {
    if engaged() {
        return Err("kill_switch_engaged");
    }
    validate_spec(spec)?;
    if input.len() > spec.max_input_bytes {
        return Err("input_too_large");
    }
    let started = Instant::now();
    let mut handle = backend.boot(spec)?;
    if let Err(error) = backend.start(&mut handle, input) {
        backend.destroy(handle);
        return Err(error);
    }
    let end = loop {
        if engaged() {
            break (VmEnd::KillSwitch, None);
        }
        if started.elapsed() > spec.wall {
            break (VmEnd::Timeout, None);
        }
        match backend.poll(&mut handle) {
            Some(Ok(output)) if output.len() > spec.max_output_bytes => break (VmEnd::OutputLimit, None),
            Some(Ok(output)) => break (VmEnd::Completed, Some(output)),
            Some(Err(_)) => break (VmEnd::Failed, None),
            None => std::thread::sleep(poll_every),
        }
    };
    backend.destroy(handle);
    Ok(VmOutcome { end: end.0, wall_ms: started.elapsed().as_millis() as u64, output: end.1 })
}

// ── The fake ────────────────────────────────────────────────────────────────

/// An in-memory stand-in for tests and the page's dry run. "Runs" a task by
/// applying `job` to the input after `ticks` polls; keeps a scratch area per
/// VM so tests can prove nothing survives between tasks.
pub struct FakeVm {
    pub job: fn(&[u8], &mut Vec<u8>) -> Result<Vec<u8>, &'static str>,
    pub ticks: u32,
    pub fail_boot: bool,
    pub fail_start: bool,
    pub booted: u32,
    pub destroyed: u32,
    pub live: u32,
    pub last_network: Option<NetworkPolicy>,
}

pub struct FakeHandle {
    scratch: Vec<u8>,
    input: Vec<u8>,
    remaining: u32,
    started: bool,
}

impl FakeVm {
    pub fn new(job: fn(&[u8], &mut Vec<u8>) -> Result<Vec<u8>, &'static str>, ticks: u32) -> Self {
        FakeVm { job, ticks, fail_boot: false, fail_start: false, booted: 0, destroyed: 0, live: 0, last_network: None }
    }
}

impl VmBackend for FakeVm {
    type Handle = FakeHandle;
    fn boot(&mut self, spec: &VmSpec) -> Result<FakeHandle, &'static str> {
        if self.fail_boot {
            return Err("vm_boot_failed");
        }
        self.booted += 1;
        self.live += 1;
        self.last_network = Some(spec.network.clone());
        Ok(FakeHandle { scratch: Vec::new(), input: Vec::new(), remaining: self.ticks, started: false })
    }
    fn start(&mut self, handle: &mut FakeHandle, input: &[u8]) -> Result<(), &'static str> {
        if self.fail_start {
            return Err("vm_start_failed");
        }
        handle.input = input.to_vec();
        handle.started = true;
        Ok(())
    }
    fn poll(&mut self, handle: &mut FakeHandle) -> Option<Result<Vec<u8>, &'static str>> {
        if !handle.started {
            return Some(Err("vm_not_started"));
        }
        if handle.remaining > 0 {
            handle.remaining -= 1;
            return None;
        }
        Some((self.job)(&handle.input, &mut handle.scratch))
    }
    fn destroy(&mut self, handle: FakeHandle) {
        drop(handle);
        self.destroyed += 1;
        self.live = self.live.saturating_sub(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn spec() -> VmSpec {
        VmSpec {
            capability_type: "sandbox.code.v1".into(),
            image_sha256: "a".repeat(64),
            cpus: 2,
            memory_mib: 2048,
            scratch_mib: 1024,
            network: NetworkPolicy::None,
            wall: Duration::from_secs(5),
            max_input_bytes: 1024,
            max_output_bytes: 64,
        }
    }
    fn never() -> bool {
        false
    }
    const TICK: Duration = Duration::from_millis(1);
    /// Echoes the input, and reports what the scratch disk held before this task.
    fn echo_and_scratch(input: &[u8], scratch: &mut Vec<u8>) -> Result<Vec<u8>, &'static str> {
        let mut out = format!("seen:{}|", scratch.len()).into_bytes();
        out.extend_from_slice(input);
        scratch.extend_from_slice(b"left behind");
        Ok(out)
    }
    fn fails(_: &[u8], _: &mut Vec<u8>) -> Result<Vec<u8>, &'static str> {
        Err("task_failed")
    }
    fn big(_: &[u8], _: &mut Vec<u8>) -> Result<Vec<u8>, &'static str> {
        Ok(vec![b'x'; 1000])
    }

    #[test]
    fn this_computer_cannot_run_vms_and_no_host_can_until_there_is_a_backend() {
        assert_eq!(host_support("macos", "x86_64", Some(14)), Err(VmUnavailable::NeedsAppleSilicon));
        assert_eq!(host_support("macos", "aarch64", Some(15)), Err(VmUnavailable::NeedsMacOs26));
        assert_eq!(host_support("macos", "aarch64", None), Err(VmUnavailable::NeedsMacOs26));
        assert_eq!(host_support("macos", "aarch64", Some(26)), Err(VmUnavailable::NeedsEntitlement));
        assert_eq!(host_support("windows", "x86_64", None), Err(VmUnavailable::UnsupportedOs));
        assert_eq!(host_support("linux", "aarch64", None), Err(VmUnavailable::UnsupportedOs));
        assert!(host_support(std::env::consts::OS, std::env::consts::ARCH, Some(14)).is_err());
    }

    #[test]
    fn spec_needs_a_known_type_a_pinned_image_bounded_resources_and_exact_hosts() {
        assert_eq!(validate_spec(&spec()), Ok(()));
        let cases: Vec<(Box<dyn Fn(&mut VmSpec)>, &str)> = vec![
            (Box::new(|s| s.capability_type = "llm.generate.v1".into()), "vm_type_unknown"),
            (Box::new(|s| s.image_sha256 = "A".repeat(64)), "vm_image_pin_invalid"),
            (Box::new(|s| s.image_sha256 = "a".repeat(63)), "vm_image_pin_invalid"),
            (Box::new(|s| s.cpus = 0), "vm_resources_invalid"),
            (Box::new(|s| s.memory_mib = 100), "vm_resources_invalid"),
            (Box::new(|s| s.scratch_mib = 0), "vm_resources_invalid"),
            (Box::new(|s| s.wall = Duration::ZERO), "vm_wall_invalid"),
            (Box::new(|s| s.wall = Duration::from_secs(3601)), "vm_wall_invalid"),
            (Box::new(|s| s.network = NetworkPolicy::Outbound(vec![])), "vm_network_invalid"),
            (Box::new(|s| s.network = NetworkPolicy::Outbound(vec!["*.example.com".into()])), "vm_network_invalid"),
            (Box::new(|s| s.network = NetworkPolicy::Outbound(vec!["evil.example/path".into()])), "vm_network_invalid"),
        ];
        for (edit, expected) in cases {
            let mut s = spec();
            edit(&mut s);
            assert_eq!(validate_spec(&s), Err(expected));
        }
        let mut ok = spec();
        ok.network = NetworkPolicy::Outbound(vec!["registry.example.com".into()]);
        assert_eq!(validate_spec(&ok), Ok(()));
    }

    #[test]
    fn every_task_gets_a_fresh_vm_and_nothing_survives() {
        let mut vm = FakeVm::new(echo_and_scratch, 2);
        let first = run_vm_task(&mut vm, &spec(), b"one", &never, TICK).unwrap();
        let second = run_vm_task(&mut vm, &spec(), b"two", &never, TICK).unwrap();
        assert_eq!(first.end, VmEnd::Completed);
        assert_eq!(first.output.as_deref(), Some(&b"seen:0|one"[..]));
        // The second task does not see what the first left on its disk.
        assert_eq!(second.output.as_deref(), Some(&b"seen:0|two"[..]));
        assert_eq!((vm.booted, vm.destroyed, vm.live), (2, 2, 0));
        assert_eq!(vm.last_network, Some(NetworkPolicy::None));
    }

    #[test]
    fn the_vm_is_destroyed_on_every_path() {
        let mut failing = FakeVm::new(fails, 0);
        assert_eq!(run_vm_task(&mut failing, &spec(), b"", &never, TICK).unwrap().end, VmEnd::Failed);
        assert_eq!((failing.destroyed, failing.live), (1, 0));

        let mut huge = FakeVm::new(big, 0);
        let out = run_vm_task(&mut huge, &spec(), b"", &never, TICK).unwrap();
        assert_eq!((out.end, out.output), (VmEnd::OutputLimit, None));
        assert_eq!(huge.live, 0);

        let mut slow = FakeVm::new(echo_and_scratch, u32::MAX);
        let mut s = spec();
        s.wall = Duration::from_millis(30);
        let timed = run_vm_task(&mut slow, &s, b"", &never, TICK).unwrap();
        assert_eq!((timed.end, timed.output), (VmEnd::Timeout, None));
        assert_eq!(slow.live, 0);

        let mut no_start = FakeVm::new(echo_and_scratch, 0);
        no_start.fail_start = true;
        assert_eq!(run_vm_task(&mut no_start, &spec(), b"", &never, TICK), Err("vm_start_failed"));
        assert_eq!((no_start.booted, no_start.destroyed, no_start.live), (1, 1, 0));

        let mut no_boot = FakeVm::new(echo_and_scratch, 0);
        no_boot.fail_boot = true;
        assert_eq!(run_vm_task(&mut no_boot, &spec(), b"", &never, TICK), Err("vm_boot_failed"));
        assert_eq!(no_boot.live, 0);
    }

    #[test]
    fn the_emergency_stop_refuses_before_boot_and_stops_a_running_vm() {
        let mut vm = FakeVm::new(echo_and_scratch, u32::MAX);
        assert_eq!(run_vm_task(&mut vm, &spec(), b"", &|| true, TICK), Err("kill_switch_engaged"));
        assert_eq!(vm.booted, 0);

        let polls = Cell::new(0u32);
        let pull_after_three = || {
            polls.set(polls.get() + 1);
            polls.get() > 3
        };
        let stopped = run_vm_task(&mut vm, &spec(), b"", &pull_after_three, TICK).unwrap();
        assert_eq!((stopped.end, stopped.output), (VmEnd::KillSwitch, None));
        assert_eq!((vm.booted, vm.destroyed, vm.live), (1, 1, 0));
    }

    #[test]
    fn refuses_bad_specs_and_large_inputs_before_boot() {
        let mut vm = FakeVm::new(echo_and_scratch, 0);
        let mut s = spec();
        s.image_sha256 = "nope".into();
        assert_eq!(run_vm_task(&mut vm, &s, b"", &never, TICK), Err("vm_image_pin_invalid"));
        assert_eq!(run_vm_task(&mut vm, &spec(), &[0u8; 2048], &never, TICK), Err("input_too_large"));
        assert_eq!(vm.booted, 0);
    }
}
