//! Step one of the micro VM trial: does this computer have KVM at all? Opening `/dev/kvm` only opens the device, it
//! does not start a virtual machine and changes nothing.

use std::fs::OpenOptions;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KvmProbe {
    pub exists: bool,
    /// The current user can open the device for reading and writing.
    pub rw_openable: bool,
}

pub fn probe(path: &Path) -> KvmProbe {
    let exists = path.exists();
    let rw_openable = exists && OpenOptions::new().read(true).write(true).open(path).is_ok();
    KvmProbe { exists, rw_openable }
}

/// `vmx` (Intel) or `svm` (AMD) in the CPU flags; false when `/proc/cpuinfo` cannot be read.
pub fn cpu_has_virtualization(cpuinfo: &str) -> bool {
    cpuinfo
        .lines()
        .filter(|line| line.starts_with("flags"))
        .any(|line| line.split_whitespace().any(|flag| flag == "vmx" || flag == "svm"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_path_that_is_not_there_has_no_kvm() {
        let probe = probe(Path::new("/this/path/does/not/exist/kvm"));
        assert_eq!(probe, KvmProbe { exists: false, rw_openable: false });
    }

    #[test]
    fn cpu_flags_are_read_for_vmx_or_svm_only_as_whole_words() {
        assert!(cpu_has_virtualization("processor\t: 0\nflags\t\t: fpu vme vmx sse\n"));
        assert!(cpu_has_virtualization("flags : fpu svm"));
        assert!(!cpu_has_virtualization("flags : fpu vmxx notsvm"));
        assert!(!cpu_has_virtualization("model name : vmx svm"));
        assert!(!cpu_has_virtualization(""));
    }

    /// A measurement, not a check: it never fails because the runner has no KVM. The job prints these lines.
    #[test]
    fn report_what_this_runner_has() {
        let found = probe(Path::new("/dev/kvm"));
        let cpuinfo = std::fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
        let kernel = std::fs::read_to_string("/proc/version").unwrap_or_default();
        println!("TRIAL: kvm /dev/kvm exists={} rw_openable={}", found.exists, found.rw_openable);
        println!("TRIAL: kvm cpu_vmx_or_svm={}", cpu_has_virtualization(&cpuinfo));
        println!("TRIAL: kvm kernel={}", kernel.trim().chars().take(120).collect::<String>());
    }
}
