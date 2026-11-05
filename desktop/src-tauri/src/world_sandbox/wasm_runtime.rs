//! L2 WASM runtime for Tier_C untrusted compute (design §5.1 L2, R5.6, R6.3).
//!
//! Wraps a `wasmtime` engine that executes a Plot's Tier_C logic module
//! (`compute.run`) under three hard guarantees:
//!
//!   1. **No host syscalls.** We never register WASI nor any ambient host
//!      function. The guest module gets an empty `Linker` plus, optionally,
//!      the small set of host functions that map to capabilities it *declared*
//!      (deny-by-default, see [`super::capability_guard`]). A module that
//!      imports anything we did not explicitly provide fails to instantiate —
//!      this *is* the deny-by-default boundary at the linker level.
//!
//!   2. **Intent-only.** The guest cannot touch the scene. `compute.run`
//!      passes JSON `input` in and reads JSON `output` (a list of intents)
//!      back out via a tiny linear-memory ABI; the *host* later applies those
//!      intents through `scene.*` / `ui.*` under the same capability gate
//!      (design §11.2 "WASM 不能直接碰场景,只能返回意图").
//!
//!   3. **Bounded.** `consume_fuel` + `epoch_interruption` are enabled so the
//!      Resource_Watchdog (task 5.3) can cap CPU and abort a runaway tick.
//!      This task wires the knobs; the watchdog policy lands in 5.3.
//!
//! ## Guest ABI (`wsab` = world-sandbox ABI)
//!
//! A Tier_C WASM module compiled for this runtime must export:
//!   - `memory`                                  — its linear memory
//!   - `wsab_alloc(size: i32) -> i32`            — bump/allocator returning a ptr
//!   - `<entry>(ptr: i32, len: i32) -> i64`      — the logic entry (e.g. `tick`),
//!        reading `len` input bytes at `ptr` and returning a packed result
//!        `((out_ptr as i64) << 32) | (out_len as i64 & 0xffff_ffff)`.
//!
//! The host writes UTF-8 JSON input at an allocated ptr, calls `<entry>`, then
//! reads `out_len` bytes at `out_ptr` as UTF-8 JSON output.

use wasmtime::{Config, Engine, Linker, Module, Store};

use super::{SandboxError, DEFAULT_TICK_FUEL};

/// Per-instance store state. Kept minimal on purpose — no ambient host data is
/// exposed to the guest, preserving the no-syscall guarantee.
pub struct WasmState {
    /// Reserved for future host-function context (e.g. capability audit sink).
    _private: (),
}

impl WasmState {
    fn new() -> Self {
        Self { _private: () }
    }
}

/// A compiled, ready-to-run Tier_C logic module.
///
/// Holds the shared [`Engine`] and a validated [`Module`]. Each `compute.run`
/// gets a fresh [`Store`] + [`Instance`] so executions cannot leak state into
/// one another.
pub struct WasmModule {
    engine: Engine,
    module: Module,
}

impl WasmModule {
    /// Build the hardened engine configuration shared by every Tier_C module.
    ///
    /// Cranelift compiles the untrusted bytecode ahead of execution; fuel and
    /// epoch interruption are enabled so the watchdog can bound CPU time.
    fn hardened_config() -> Config {
        let mut config = Config::new();
        // Watchdog hooks (task 5.3 enforces budgets; here we only enable them).
        config.consume_fuel(true);
        config.epoch_interruption(true);
        // Keep the guest small and deterministic-friendly: no SIMD/threads/etc.
        // that would widen the attack surface beyond what Tier_C needs.
        config.wasm_threads(false);
        config.wasm_reference_types(false);
        config.wasm_bulk_memory(true);
        config
    }

    /// Validate + compile untrusted WASM `bytes` into a runnable module.
    ///
    /// Compilation alone enforces structural validity; it does not yet grant
    /// the module any capability — that happens at instantiation time via the
    /// (intentionally near-empty) linker.
    pub fn compile(bytes: &[u8]) -> Result<Self, SandboxError> {
        let engine = Engine::new(&Self::hardened_config())
            .map_err(|e| SandboxError::EngineInit(e.to_string()))?;
        let module = Module::new(&engine, bytes)
            .map_err(|e| SandboxError::ModuleCompile(e.to_string()))?;
        Ok(Self { engine, module })
    }

    /// Allow the watchdog (task 5.3) to interrupt a stuck instance by bumping
    /// the engine epoch. Exposed here so callers hold the engine handle.
    pub fn engine(&self) -> &Engine {
        &self.engine
    }

    /// Obtain a cheap, sendable [`WasmWatchdogHandle`] for this module's engine.
    ///
    /// The Resource_Watchdog (task 5.3) hands this handle to its monitor thread
    /// so it can abort a runaway `compute.run` from outside the executing
    /// thread by incrementing the engine epoch (design §5.3, R6.6/R6.7).
    pub fn watchdog_handle(&self) -> WasmWatchdogHandle {
        WasmWatchdogHandle {
            engine: self.engine.clone(),
        }
    }

    /// Abort any in-flight execution on this module's engine by bumping the
    /// engine epoch. An epoch-interrupted guest traps at its next epoch check
    /// (see [`run_entry`], which sets `set_epoch_deadline(1)`), surfacing as a
    /// [`SandboxError::Trap`]. Convenience for the single-handle case.
    pub fn abort(&self) {
        self.engine.increment_epoch();
    }

    /// Execute the module's `entry` function over JSON `input`, returning the
    /// JSON output the host will later apply as intents.
    ///
    /// `fuel` bounds CPU (defaults to [`DEFAULT_TICK_FUEL`] when `None`). The
    /// linker is empty: the guest reaches *no* host syscall. If the guest
    /// imports anything, instantiation fails with [`SandboxError::Instantiate`].
    pub fn run_entry(
        &self,
        entry: &str,
        input: &[u8],
        fuel: Option<u64>,
    ) -> Result<Vec<u8>, SandboxError> {
        let mut store = Store::new(&self.engine, WasmState::new());
        store
            .set_fuel(fuel.unwrap_or(DEFAULT_TICK_FUEL))
            .map_err(|e| SandboxError::Fuel(e.to_string()))?;
        // One epoch tick deadline; the watchdog thread increments the engine
        // epoch to force an interrupt when a budget is exceeded (task 5.3).
        store.set_epoch_deadline(1);

        // Deny-by-default at the linker level: nothing ambient is registered.
        let linker: Linker<WasmState> = Linker::new(&self.engine);

        let instance = linker
            .instantiate(&mut store, &self.module)
            .map_err(|e| SandboxError::Instantiate(e.to_string()))?;

        let memory = instance
            .get_memory(&mut store, "memory")
            .ok_or_else(|| SandboxError::Abi("guest does not export `memory`".into()))?;

        let alloc = instance
            .get_typed_func::<i32, i32>(&mut store, "wsab_alloc")
            .map_err(|e| SandboxError::Abi(format!("missing `wsab_alloc`: {e}")))?;

        let entry_fn = instance
            .get_typed_func::<(i32, i32), i64>(&mut store, entry)
            .map_err(|e| SandboxError::Abi(format!("missing entry `{entry}`: {e}")))?;

        // 1) Allocate guest memory for the input bytes.
        let len = i32::try_from(input.len())
            .map_err(|_| SandboxError::Abi("input too large".into()))?;
        let in_ptr = alloc
            .call(&mut store, len)
            .map_err(|e| SandboxError::Trap(e.to_string()))?;

        // 2) Write the input JSON into the guest's linear memory.
        memory
            .write(&mut store, in_ptr as usize, input)
            .map_err(|e| SandboxError::Abi(format!("write input: {e}")))?;

        // 3) Invoke the logic entry; a trap here = fuel/epoch/guest panic.
        let packed = entry_fn
            .call(&mut store, (in_ptr, len))
            .map_err(|e| SandboxError::Trap(e.to_string()))?;

        // 4) Unpack (out_ptr, out_len) and read the output JSON back out.
        let out_ptr = ((packed >> 32) & 0xffff_ffff) as usize;
        let out_len = (packed & 0xffff_ffff) as usize;
        let mut out = vec![0u8; out_len];
        memory
            .read(&store, out_ptr, &mut out)
            .map_err(|e| SandboxError::Abi(format!("read output: {e}")))?;
        Ok(out)
    }
}

/// A cheap, `Clone`/`Send` handle the Resource_Watchdog thread uses to abort a
/// stuck Tier_C tick from outside the executing thread (design §5.3, R6.6/6.7).
///
/// Holds a clone of the module's [`Engine`] (an `Arc` internally, so cloning is
/// cheap and shares the same epoch counter). Calling [`abort`](Self::abort)
/// increments that epoch; any guest running with epoch interruption enabled
/// traps at its next epoch check. This is the L2 counterpart of the TS
/// `Resource_Watchdog`'s terminate decision: once the watchdog decides a budget
/// is exceeded, it bumps the epoch to force the WASM instance to stop.
#[derive(Clone)]
pub struct WasmWatchdogHandle {
    engine: Engine,
}

impl WasmWatchdogHandle {
    /// Force any epoch-interrupted execution on this engine to trap at its next
    /// epoch check, aborting a runaway `compute.run` that exceeded its budget.
    pub fn abort(&self) {
        self.engine.increment_epoch();
    }
}
