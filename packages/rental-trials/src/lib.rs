//! Two small trials for renting a computer to a stranger on Linux (L8 4B, B4). Both only run on GitHub Actions.
//!
//! - [`wasi`]: a WASI sandbox with wasmtime. The module sees one temporary directory and nothing else: no owner
//!   directory, no network, no clipboard. A stand-in for a transcoder (a hand-written module that reads a file, changes
//!   every byte and writes a file) measures what the sandbox costs.
//! - [`kvm`]: a probe of `/dev/kvm`, the first step of the micro VM trial.
//!
//! Lines that start with `TRIAL:` are the measurements; the job prints them with `--nocapture`.

pub mod kvm;
pub mod wasi;
