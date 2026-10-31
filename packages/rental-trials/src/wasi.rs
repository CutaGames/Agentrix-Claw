//! Trial one: a WASI sandbox with wasmtime 27 for a stranger's job (transcoding, say).
//!
//! What the module is given: exactly one directory, a fresh temporary one, as guest descriptor 3. What it is not given:
//! the owner's directories, any socket, any clipboard, any environment variable, any argument. Preview 1 has no call that
//! makes a connection, and the clipboard is not a WASI interface at all, so a module that imports either does not even
//! link. The module also runs on a fuel budget, so a runaway loop stops by itself.
//!
//! The "transcoder" below is a hand-written stand-in (it reads `input.bin`, changes every byte and writes `output.bin`),
//! not a real media transcoder: the numbers say what the sandbox costs on a runner, not how fast ffmpeg would be.

use std::path::Path;
use wasmtime::{Config, Engine, Instance, Linker, Module, Store};
use wasmtime_wasi::preview1::{self, WasiP1Ctx};
use wasmtime_wasi::{DirPerms, FilePerms, WasiCtxBuilder};

/// Guest descriptor of the one directory that is handed in.
pub const WORK_DIR_FD: i32 = 3;
/// Fuel for a normal job: about a billion simple instructions.
pub const DEFAULT_FUEL: u64 = 1_000_000_000;

pub struct Sandbox {
    engine: Engine,
}

impl Sandbox {
    pub fn new() -> wasmtime::Result<Self> {
        let mut config = Config::new();
        config.consume_fuel(true);
        Ok(Sandbox { engine: Engine::new(&config)? })
    }

    /// Compile `wat` and give it `work_dir` (when there is one) as its only directory, then instantiate it.
    pub fn instantiate(&self, wat: &str, work_dir: Option<&Path>, fuel: u64) -> wasmtime::Result<(Store<WasiP1Ctx>, Instance)> {
        let module = Module::new(&self.engine, wat)?;
        let mut builder = WasiCtxBuilder::new();
        // Nothing is inherited: no stdio, no environment, no arguments, no network (never `inherit_network`).
        if let Some(dir) = work_dir {
            builder.preopened_dir(dir, "/work", DirPerms::all(), FilePerms::all())?;
        }
        let mut store = Store::new(&self.engine, builder.build_p1());
        store.set_fuel(fuel)?;
        let mut linker: Linker<WasiP1Ctx> = Linker::new(&self.engine);
        preview1::add_to_linker_sync(&mut linker, |ctx: &mut WasiP1Ctx| ctx)?;
        let instance = linker.instantiate(&mut store, &module)?;
        Ok((store, instance))
    }
}

/// Calls the probe module's `open(dirfd, path_len)` with `path` written at the start of its memory; returns the WASI errno.
pub fn probe_open(store: &mut Store<WasiP1Ctx>, instance: &Instance, dirfd: i32, path: &str) -> wasmtime::Result<i32> {
    let memory = instance.get_memory(&mut *store, "memory").ok_or_else(|| wasmtime::Error::msg("no memory export"))?;
    memory.write(&mut *store, 0, path.as_bytes())?;
    let open = instance.get_typed_func::<(i32, i32), i32>(&mut *store, "open")?;
    open.call(&mut *store, (dirfd, path.len() as i32))
}

/// Opens a path relative to a descriptor for reading, and reports the WASI errno (0 = success). It also exposes
/// `prestat` (is this descriptor a pre-opened directory?) and `accept` (the only socket call preview 1 has).
pub const PROBE_WAT: &str = r#"
(module
  (import "wasi_snapshot_preview1" "path_open" (func $path_open (param i32 i32 i32 i32 i32 i64 i64 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_prestat_get" (func $prestat_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "sock_accept" (func $sock_accept (param i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (func (export "open") (param $dirfd i32) (param $len i32) (result i32)
    (call $path_open (local.get $dirfd) (i32.const 0) (i32.const 0) (local.get $len) (i32.const 0)
                     (i64.const 2) (i64.const 0) (i32.const 0) (i32.const 512)))
  (func (export "prestat") (param $fd i32) (result i32)
    (call $prestat_get (local.get $fd) (i32.const 512)))
  (func (export "accept") (param $fd i32) (result i32)
    (call $sock_accept (local.get $fd) (i32.const 0) (i32.const 512))))
"#;

/// Stand-in transcoder: reads `input.bin` (up to 1 MiB) from descriptor 3, xors every byte with 90, writes `output.bin`.
/// `run` returns 0 or the first WASI errno that went wrong.
pub const TRANSCODER_WAT: &str = r#"
(module
  (import "wasi_snapshot_preview1" "path_open" (func $path_open (param i32 i32 i32 i32 i32 i64 i64 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_read" (func $fd_read (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_close" (func $fd_close (param i32) (result i32)))
  (memory (export "memory") 20)
  (data (i32.const 0) "input.bin")
  (data (i32.const 16) "output.bin")
  (func (export "run") (result i32)
    (local $err i32) (local $fd i32) (local $n i32) (local $i i32)
    (local.set $err (call $path_open (i32.const 3) (i32.const 0) (i32.const 0) (i32.const 9) (i32.const 0)
                                     (i64.const 2) (i64.const 0) (i32.const 0) (i32.const 32)))
    (if (local.get $err) (then (return (local.get $err))))
    (local.set $fd (i32.load (i32.const 32)))
    (i32.store (i32.const 48) (i32.const 4096))
    (i32.store (i32.const 52) (i32.const 1048576))
    (local.set $err (call $fd_read (local.get $fd) (i32.const 48) (i32.const 1) (i32.const 36)))
    (drop (call $fd_close (local.get $fd)))
    (if (local.get $err) (then (return (local.get $err))))
    (local.set $n (i32.load (i32.const 36)))
    (local.set $i (i32.const 0))
    (block $done
      (loop $again
        (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
        (i32.store8 (i32.add (i32.const 4096) (local.get $i))
                    (i32.xor (i32.load8_u (i32.add (i32.const 4096) (local.get $i))) (i32.const 90)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $again)))
    (local.set $err (call $path_open (i32.const 3) (i32.const 0) (i32.const 16) (i32.const 10) (i32.const 9)
                                     (i64.const 64) (i64.const 0) (i32.const 0) (i32.const 32)))
    (if (local.get $err) (then (return (local.get $err))))
    (local.set $fd (i32.load (i32.const 32)))
    (i32.store (i32.const 52) (local.get $n))
    (local.set $err (call $fd_write (local.get $fd) (i32.const 48) (i32.const 1) (i32.const 40)))
    (drop (call $fd_close (local.get $fd)))
    (local.get $err)))
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::Instant;

    const SUCCESS: i32 = 0;
    const BADF: i32 = 8;

    /// A fresh directory under the system temp directory, removed when dropped.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(label: &str) -> TempDir {
            let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
            let path = std::env::temp_dir().join(format!("rental-trial-{}-{}-{}", label, std::process::id(), nanos));
            fs::create_dir_all(&path).unwrap();
            TempDir(path)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// Two sibling directories: the one handed to the module, and a stand-in for the owner's home with a secret in it.
    fn work_and_home() -> (TempDir, TempDir, PathBuf) {
        let work = TempDir::new("work");
        let home = TempDir::new("home");
        fs::write(work.0.join("input.bin"), b"hello").unwrap();
        let secret = home.0.join("secret.txt");
        fs::write(&secret, b"the owner's secret").unwrap();
        (work, home, secret)
    }

    #[test]
    fn the_module_reads_and_writes_inside_the_one_directory_and_the_cost_is_measured() {
        let work = TempDir::new("transcode");
        let input: Vec<u8> = (0..1_048_576u32).map(|i| (i % 251) as u8).collect();
        fs::write(work.0.join("input.bin"), &input).unwrap();

        let started = Instant::now();
        let sandbox = Sandbox::new().unwrap();
        let (mut store, instance) = sandbox.instantiate(TRANSCODER_WAT, Some(&work.0), DEFAULT_FUEL).unwrap();
        let compile_ms = started.elapsed().as_millis();

        let run = instance.get_typed_func::<(), i32>(&mut store, "run").unwrap();
        let ran = Instant::now();
        let errno = run.call(&mut store, ()).unwrap();
        let run_ms = ran.elapsed().as_millis();
        assert_eq!(errno, SUCCESS);

        let output = fs::read(work.0.join("output.bin")).unwrap();
        assert_eq!(output.len(), input.len());
        assert!(input.iter().zip(&output).all(|(a, b)| a ^ 90 == *b));
        println!("TRIAL: wasi stand-in transcoder bytes={} engine_and_compile_ms={} run_ms={} fuel_used={}", input.len(), compile_ms, run_ms, DEFAULT_FUEL - store.get_fuel().unwrap());
    }

    #[test]
    fn nothing_outside_the_one_directory_can_be_opened() {
        let (work, home, secret) = work_and_home();
        let sandbox = Sandbox::new().unwrap();
        let (mut store, instance) = sandbox.instantiate(PROBE_WAT, Some(&work.0), DEFAULT_FUEL).unwrap();
        // control: the file inside the directory opens, so the refusals below are not an artefact of the probe
        assert_eq!(probe_open(&mut store, &instance, WORK_DIR_FD, "input.bin").unwrap(), SUCCESS);

        let home_name = home.0.file_name().unwrap().to_string_lossy().to_string();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&secret, work.0.join("link.txt")).unwrap();
        let attempts = vec![
            format!("../{}/secret.txt", home_name),
            secret.to_string_lossy().to_string(),
            home.0.to_string_lossy().to_string(),
            "..".to_string(),
            "/etc/passwd".to_string(),
            "link.txt".to_string(),
        ];
        for path in &attempts {
            let errno = probe_open(&mut store, &instance, WORK_DIR_FD, path).unwrap();
            println!("TRIAL: wasi open {:?} -> errno {}", path.replace(&home_name, "<owner-home>"), errno);
            assert_ne!(errno, SUCCESS, "opening {path:?} must be refused");
        }
    }

    #[test]
    fn only_one_directory_is_handed_in() {
        let (work, _home, _secret) = work_and_home();
        let sandbox = Sandbox::new().unwrap();
        let (mut store, instance) = sandbox.instantiate(PROBE_WAT, Some(&work.0), DEFAULT_FUEL).unwrap();
        let prestat = instance.get_typed_func::<i32, i32>(&mut store, "prestat").unwrap();
        assert_eq!(prestat.call(&mut store, WORK_DIR_FD).unwrap(), SUCCESS);
        assert_eq!(prestat.call(&mut store, WORK_DIR_FD + 1).unwrap(), BADF);
        // with no directory at all, there is nothing to open anything in
        let (mut bare_store, bare) = sandbox.instantiate(PROBE_WAT, None, DEFAULT_FUEL).unwrap();
        assert_ne!(probe_open(&mut bare_store, &bare, WORK_DIR_FD, "input.bin").unwrap(), SUCCESS);
    }

    #[test]
    fn there_is_no_network() {
        let (work, _home, _secret) = work_and_home();
        let sandbox = Sandbox::new().unwrap();
        let (mut store, instance) = sandbox.instantiate(PROBE_WAT, Some(&work.0), DEFAULT_FUEL).unwrap();
        let accept = instance.get_typed_func::<i32, i32>(&mut store, "accept").unwrap();
        for fd in [WORK_DIR_FD, WORK_DIR_FD + 1, 0, 1, 2] {
            assert_ne!(accept.call(&mut store, fd).unwrap(), SUCCESS, "descriptor {fd} must not accept a connection");
        }
        // preview 1 has no connect call: a module that imports one does not link
        let wat = r#"(module (import "wasi_snapshot_preview1" "sock_connect" (func (param i32 i32) (result i32))))"#;
        let error = sandbox.instantiate(wat, Some(&work.0), DEFAULT_FUEL).err().expect("must not link");
        assert!(format!("{error:#}").contains("sock_connect"), "{error:#}");
    }

    #[test]
    fn there_is_no_clipboard_and_no_other_host_function() {
        let (work, _home, _secret) = work_and_home();
        let sandbox = Sandbox::new().unwrap();
        for wat in [
            r#"(module (import "env" "clipboard_read" (func (result i32))))"#,
            r#"(module (import "wasi_snapshot_preview1" "clipboard_read" (func (result i32))))"#,
        ] {
            let error = sandbox.instantiate(wat, Some(&work.0), DEFAULT_FUEL).err().expect("must not link");
            assert!(format!("{error:#}").contains("clipboard_read"), "{error:#}");
        }
    }

    #[test]
    fn a_runaway_module_runs_out_of_fuel() {
        let wat = r#"(module (func (export "spin") (loop $again (br $again))))"#;
        let sandbox = Sandbox::new().unwrap();
        let (mut store, instance) = sandbox.instantiate(wat, None, 5_000_000).unwrap();
        let spin = instance.get_typed_func::<(), ()>(&mut store, "spin").unwrap();
        let started = Instant::now();
        assert!(spin.call(&mut store, ()).is_err());
        println!("TRIAL: wasi runaway loop stopped after {} ms on a 5 million fuel budget", started.elapsed().as_millis());
    }
}
