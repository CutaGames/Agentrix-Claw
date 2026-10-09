//! JSON-RPC newline framing and the locked `agent acp` stdio process host.

use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::policy::{redact_text, TrustPolicy};
use crate::developer_runtime::types::{
    CommandLock, VendorProbe, DEFAULT_REQUEST_TIMEOUT_MS, MAX_LINE_BYTES, MAX_PENDING_RPC,
};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub enum Incoming {
    Request { id: Value, method: String, params: Value },
    Notification { method: String, params: Value },
    Response { id: Value, result: Option<Value>, error: Option<Value> },
}

pub struct JsonRpcSession {
    next_id: u64,
    pending: HashMap<u64, String>,
    timed_out_ids: HashMap<u64, Instant>,
    timeout: Duration,
    max_pending: usize,
    max_line_bytes: usize,
    closed: bool,
    inbox: VecDeque<Incoming>,
}

impl Default for JsonRpcSession {
    fn default() -> Self {
        Self {
            next_id: 1,
            pending: HashMap::new(),
            timed_out_ids: HashMap::new(),
            timeout: Duration::from_millis(DEFAULT_REQUEST_TIMEOUT_MS),
            max_pending: MAX_PENDING_RPC,
            max_line_bytes: MAX_LINE_BYTES,
            closed: false,
            inbox: VecDeque::new(),
        }
    }
}

impl JsonRpcSession {
    pub fn encode_request(&mut self, method: &str, params: Value) -> RuntimeResult<String> {
        Ok(self.encode_request_id(method, params)?.1)
    }

    pub fn encode_request_id(&mut self, method: &str, params: Value) -> RuntimeResult<(u64, String)> {
        self.assert_open()?;
        if self.pending.len() >= self.max_pending {
            return Err(RuntimeError::fail_closed("rpc_backpressure"));
        }
        let id = self.next_id;
        self.next_id += 1;
        self.pending.insert(id, method.to_string());
        Ok((
            id,
            encode_line(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))?,
        ))
    }

    pub fn encode_notification(&self, method: &str, params: Value) -> RuntimeResult<String> {
        self.assert_open()?;
        encode_line(&json!({ "jsonrpc": "2.0", "method": method, "params": params }))
    }

    pub fn accept_line(&mut self, line: &str) -> RuntimeResult<Option<Incoming>> {
        self.assert_open()?;
        if line.len() > self.max_line_bytes {
            self.closed = true;
            return Err(RuntimeError::fail_closed("rpc_backpressure"));
        }
        let incoming = parse_line(line)?;
        match &incoming {
            Incoming::Response { id, error, .. } => {
                if let Some(error) = error {
                    assert_strict_error(error)?;
                }
                let rpc_id = exact_u64_id(id)?;
                if self.pending.remove(&rpc_id).is_some() {
                    Ok(Some(incoming))
                } else if self.timed_out_ids.remove(&rpc_id).is_some() {
                    Ok(None)
                } else {
                    self.fail_all_pending();
                    Err(RuntimeError::fail_closed("unknown_rpc_id"))
                }
            }
            Incoming::Request { method, params, .. } => {
                assert_agent_request(method, params)?;
                self.inbox.push_back(incoming.clone());
                Ok(Some(incoming))
            }
            Incoming::Notification { method, params } => {
                assert_agent_notification(method, params)?;
                self.inbox.push_back(incoming.clone());
                Ok(Some(incoming))
            }
        }
    }

    pub fn expire_pending(&mut self, started: Instant) {
        if !self.timed_out(started) {
            return;
        }
        for (id, _) in self.pending.drain() {
            self.timed_out_ids.insert(id, Instant::now());
        }
    }

    pub fn fail_all_pending(&mut self) {
        self.closed = true;
        self.pending.clear();
        self.timed_out_ids.clear();
        self.inbox.clear();
    }

    pub fn timed_out(&self, started: Instant) -> bool {
        started.elapsed() > self.timeout
    }

    pub fn close(&mut self) {
        self.closed = true;
        self.pending.clear();
    }

    fn assert_open(&self) -> RuntimeResult<()> {
        if self.closed {
            Err(RuntimeError::fail_closed("closed"))
        } else {
            Ok(())
        }
    }

    pub fn push_inbox(&mut self, incoming: Incoming) {
        self.inbox.push_back(incoming);
    }

    pub fn pop_inbox(&mut self) -> Option<Incoming> {
        self.inbox.pop_front()
    }
}

pub fn encode_line(value: &Value) -> RuntimeResult<String> {
    let object = value
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if object.get("jsonrpc") != Some(&Value::String("2.0".into())) {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    Ok(format!("{value}\n"))
}

pub fn parse_line(line: &str) -> RuntimeResult<Incoming> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(RuntimeError::fail_closed("empty_line"));
    }
    let parsed: Value =
        serde_json::from_str(trimmed).map_err(|_| RuntimeError::fail_closed("invalid_json"))?;
    let object = parsed
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if object.get("jsonrpc") != Some(&Value::String("2.0".into())) {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    for key in object.keys() {
        if !matches!(
            key.as_str(),
            "jsonrpc" | "id" | "method" | "params" | "result" | "error"
        ) {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
    }
    if object.contains_key("method") && (object.contains_key("result") || object.contains_key("error"))
    {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    if let Some(method) = object.get("method").and_then(Value::as_str) {
        if method.is_empty() {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
        let params = object.get("params").cloned().unwrap_or(Value::Null);
        if let Some(id) = object.get("id") {
            return Ok(Incoming::Request {
                id: id.clone(),
                method: method.to_string(),
                params,
            });
        }
        return Ok(Incoming::Notification {
            method: method.to_string(),
            params,
        });
    }
    let id = object
        .get("id")
        .cloned()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if object.contains_key("error") && object.contains_key("result") {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    if let Some(error) = object.get("error") {
        assert_strict_error(error)?;
        return Ok(Incoming::Response {
            id,
            result: None,
            error: Some(error.clone()),
        });
    }
    if let Some(result) = object.get("result") {
        return Ok(Incoming::Response {
            id,
            result: Some(result.clone()),
            error: None,
        });
    }
    Err(RuntimeError::fail_closed("unknown_schema"))
}

pub fn redact_stderr(line: &str) -> String {
    redact_text(line)
}

fn exact_u64_id(id: &Value) -> RuntimeResult<u64> {
    match id {
        Value::Number(number) if number.as_u64().is_some() => Ok(number.as_u64().unwrap()),
        _ => Err(RuntimeError::fail_closed("unknown_rpc_id")),
    }
}

fn assert_strict_error(error: &Value) -> RuntimeResult<()> {
    let object = error
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    for key in object.keys() {
        if !matches!(key.as_str(), "code" | "message" | "data") {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
    }
    if !object.get("code").and_then(Value::as_i64).is_some()
        || !object.get("message").and_then(Value::as_str).is_some()
    {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    Ok(())
}

fn assert_agent_request(method: &str, params: &Value) -> RuntimeResult<()> {
    if method != "session/request_permission" {
        return Err(RuntimeError::fail_closed("unknown_method"));
    }
    let object = params
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if !object.contains_key("sessionId") || !object.contains_key("toolCall") {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    Ok(())
}

fn assert_agent_notification(method: &str, params: &Value) -> RuntimeResult<()> {
    if method != "session/update" {
        return Err(RuntimeError::fail_closed("unknown_method"));
    }
    let object = params
        .as_object()
        .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
    if !object.contains_key("sessionId") || !object.contains_key("update") {
        return Err(RuntimeError::fail_closed("unknown_schema"));
    }
    Ok(())
}

pub fn probe_vendor_cli(lock: &CommandLock, policy: &TrustPolicy) -> VendorProbe {
    if policy.validate_command_lock(lock).is_err() {
        return VendorProbe {
            available: false,
            reason_code: "command_not_allowlisted".into(),
            program: lock.program.clone(),
            spawn_attempted: false,
            process_started: false,
            production_claim: false,
        };
    }
    if !cli_on_path(&lock.program) {
        return VendorProbe {
            available: false,
            reason_code: "vendor_cli_unavailable".into(),
            program: lock.program.clone(),
            spawn_attempted: false,
            process_started: false,
            production_claim: false,
        };
    }
    VendorProbe {
        available: true,
        reason_code: "vendor_cli_present_unverified".into(),
        program: lock.program.clone(),
        spawn_attempted: false,
        process_started: false,
        production_claim: false,
    }
}

/// File names that may satisfy the locked `program` on this platform, most
/// spawnable first. Every name here must stay inside the policy allowlist.
fn cli_candidates(program: &str) -> Vec<String> {
    if program.ends_with(".exe") || program.ends_with(".cmd") || program.ends_with(".bat") {
        vec![program.to_string()]
    } else if cfg!(windows) {
        vec![
            format!("{program}.exe"),
            format!("{program}.cmd"),
            format!("{program}.bat"),
            program.to_string(),
        ]
    } else {
        vec![program.to_string()]
    }
}

/// Resolve the locked program to the file name that actually exists in `dirs`.
///
/// On Windows the Cursor CLI installer ships only `agent.cmd` / `agent.ps1`
/// shims (no `agent.exe`), and `std::process::Command::new("agent")` will only
/// look for `agent.exe`, so the spawn must use the resolved name. The returned
/// value is still a bare file name (never a path) so the policy lock holds.
pub(crate) fn resolve_cli_in_dirs(
    program: &str,
    dirs: impl IntoIterator<Item = std::path::PathBuf>,
) -> Option<String> {
    let names = cli_candidates(program);
    for dir in dirs {
        for name in &names {
            if dir.join(name).is_file() {
                return Some(name.clone());
            }
        }
    }
    None
}

pub fn resolve_cli_on_path(program: &str) -> Option<String> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    resolve_cli_in_dirs(program, std::env::split_paths(&path))
}

pub fn cli_on_path(program: &str) -> bool {
    resolve_cli_on_path(program).is_some()
}

#[derive(Debug)]
pub enum PromptProgress {
    Done(Value),
    Permission { id: Value, params: Value },
}

pub struct CursorAcpProcessHost {
    lock: CommandLock,
    child: Option<Child>,
    session: Mutex<JsonRpcSession>,
    stdout_rx: Option<mpsc::Receiver<String>>,
    stderr_rx: Option<mpsc::Receiver<String>>,
    stdin: Option<std::process::ChildStdin>,
    scripted_stdin: Option<mpsc::Sender<String>>,
    pending_prompt_id: Option<u64>,
    pub session_new_count: u32,
    last_prompt_updates: Vec<Value>,
}

impl CursorAcpProcessHost {
    pub fn spawn(lock: CommandLock, policy: &TrustPolicy) -> RuntimeResult<Self> {
        policy.validate_command_lock(&lock)?;
        let program = resolve_cli_on_path(&lock.program)
            .ok_or_else(|| RuntimeError::unavailable("vendor_cli_unavailable"))?;
        // The resolved shim name (e.g. `agent.cmd` on Windows) must itself pass
        // the allowlist; never spawn a name the policy has not seen.
        let resolved_lock = CommandLock {
            program: program.clone(),
            ..lock.clone()
        };
        policy.validate_command_lock(&resolved_lock)?;
        let mut command = Command::new(&program);
        command
            .args(&lock.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env_remove("CURSOR_API_KEY")
            .env_remove("CURSOR_AUTH_TOKEN");
        let mut child = command
            .spawn()
            .map_err(|_| RuntimeError::unavailable("vendor_process_spawn_failed"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| RuntimeError::fail_closed("vendor_stdio_missing"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| RuntimeError::fail_closed("vendor_stdio_missing"))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| RuntimeError::fail_closed("vendor_stdio_missing"))?;
        let (stdout_tx, stdout_rx) = mpsc::channel();
        let (stderr_tx, stderr_rx) = mpsc::channel();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if stdout_tx.send(line).is_err() {
                    break;
                }
            }
        });
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = stderr_tx.send(redact_stderr(&line));
            }
        });
        Ok(Self {
            lock,
            child: Some(child),
            session: Mutex::new(JsonRpcSession::default()),
            stdout_rx: Some(stdout_rx),
            stderr_rx: Some(stderr_rx),
            stdin: Some(stdin),
            scripted_stdin: None,
            pending_prompt_id: None,
            session_new_count: 0,
            last_prompt_updates: Vec::new(),
        })
    }

    pub fn request(&mut self, method: &str, params: Value) -> RuntimeResult<Value> {
        assert_known_client_method(method)?;
        let (expected_id, line) = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| RuntimeError::fail_closed("process_lock"))?;
            session.encode_request_id(method, params)?
        };
        self.write_line(&line)?;
        let started = Instant::now();
        loop {
            match self.try_read() {
                Ok(Some(Incoming::Response { id, result, error })) => {
                    let actual = exact_u64_id(&id)?;
                    if actual != expected_id {
                        self.close_fail();
                        return Err(RuntimeError::fail_closed("unknown_rpc_id"));
                    }
                    if let Some(error) = error {
                        return Err(RuntimeError::fail_closed("jsonrpc_error")
                            .with_message(error.to_string()));
                    }
                    return result.ok_or_else(|| RuntimeError::fail_closed("unknown_schema"));
                }
                Ok(Some(Incoming::Request { id, method, params })) => {
                    if method == "session/request_permission" && self.pending_prompt_id.is_some() {
                        return Ok(json!({
                            "blocked": true,
                            "permissionId": id,
                            "permissionParams": params
                        }));
                    }
                }
                Ok(Some(Incoming::Notification { .. })) => {}
                Ok(None) => {}
                Err(error) => {
                    self.close_fail();
                    return Err(error);
                }
            }
            if started.elapsed() > Duration::from_millis(DEFAULT_REQUEST_TIMEOUT_MS) {
                if let Ok(mut session) = self.session.lock() {
                    session.expire_pending(started);
                }
                return Err(RuntimeError::fail_closed("request_timeout"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    fn close_fail(&mut self) {
        if let Ok(mut session) = self.session.lock() {
            session.fail_all_pending();
        }
        self.stdin = None;
    }

    pub fn notify(&mut self, method: &str, params: Value) -> RuntimeResult<()> {
        let line = {
            let session = self
                .session
                .lock()
                .map_err(|_| RuntimeError::fail_closed("process_lock"))?;
            session.encode_notification(method, params)?
        };
        self.write_line(&line)
    }

    pub fn drain_notifications(&mut self) -> RuntimeResult<Vec<Incoming>> {
        let mut out = Vec::new();
        {
            let mut session = self
                .session
                .lock()
                .map_err(|_| RuntimeError::fail_closed("process_lock"))?;
            while let Some(incoming) = session.pop_inbox() {
                if !matches!(incoming, Incoming::Response { .. }) {
                    out.push(incoming);
                }
            }
        }
        while let Some(incoming) = self.try_read()? {
            if matches!(incoming, Incoming::Response { .. }) {
                let mut session = self
                    .session
                    .lock()
                    .map_err(|_| RuntimeError::fail_closed("process_lock"))?;
                session.push_inbox(incoming);
            } else {
                out.push(incoming);
            }
        }
        Ok(out)
    }

    pub fn protocol_version(&self) -> u32 {
        self.lock.protocol_version
    }

    pub fn initialize(&mut self) -> RuntimeResult<Value> {
        self.request(
            "initialize",
            json!({
                "protocolVersion": self.lock.protocol_version,
                "clientInfo": { "name": "agentrix-developer-runtime", "version": "0.0.0-local" },
                "clientCapabilities": { "fs": { "readTextFile": false, "writeTextFile": false }, "terminal": false }
            }),
        )
    }

    pub fn authenticate(&mut self) -> RuntimeResult<Value> {
        self.request("authenticate", json!({ "methodId": "cursor_login" }))
    }

    pub fn list_sessions(&mut self) -> RuntimeResult<Value> {
        self.request("session/list", json!({}))
    }

    pub fn session_new(&mut self, cwd_ref: &str) -> RuntimeResult<Value> {
        self.session_new_count += 1;
        self.request("session/new", json!({ "cwd": cwd_ref }))
    }

    pub fn session_load(&mut self) -> RuntimeResult<Value> {
        Err(RuntimeError::unavailable("session_resume_unverified"))
    }

    pub fn prompt(&mut self, session_id: &str, prompt_ref: &str) -> RuntimeResult<Value> {
        self.start_prompt(session_id, prompt_ref)?;
        match self.drive_prompt()? {
            PromptProgress::Done(value) => Ok(value),
            PromptProgress::Permission { .. } => {
                Err(RuntimeError::unavailable("authority_decision_pending"))
            }
        }
    }

    pub fn start_prompt(&mut self, session_id: &str, prompt_ref: &str) -> RuntimeResult<()> {
        if self.pending_prompt_id.is_some() {
            return Err(RuntimeError::fail_closed("prompt_already_pending"));
        }
        let (expected_id, line) = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| RuntimeError::fail_closed("process_lock"))?;
            session.encode_request_id(
                "session/prompt",
                json!({ "sessionId": session_id, "prompt": [{ "type": "text", "text": prompt_ref }] }),
            )?
        };
        self.write_line(&line)?;
        self.pending_prompt_id = Some(expected_id);
        self.last_prompt_updates.clear();
        Ok(())
    }

    pub fn last_prompt_updates(&self) -> &[Value] {
        &self.last_prompt_updates
    }

    pub fn drive_prompt(&mut self) -> RuntimeResult<PromptProgress> {
        let expected_id = self
            .pending_prompt_id
            .ok_or_else(|| RuntimeError::fail_closed("prompt_not_pending"))?;
        let started = Instant::now();
        loop {
            match self.try_read() {
                Ok(Some(Incoming::Response { id, result, error })) => {
                    let actual = exact_u64_id(&id)?;
                    if actual != expected_id {
                        self.close_fail();
                        return Err(RuntimeError::fail_closed("unknown_rpc_id"));
                    }
                    self.pending_prompt_id = None;
                    if let Some(error) = error {
                        return Err(RuntimeError::fail_closed("jsonrpc_error")
                            .with_message(error.to_string()));
                    }
                    return Ok(PromptProgress::Done(
                        result.ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?,
                    ));
                }
                Ok(Some(Incoming::Request { id, method, params }))
                    if method == "session/request_permission" =>
                {
                    return Ok(PromptProgress::Permission { id, params });
                }
                Ok(Some(Incoming::Request { .. })) => {
                    return Err(RuntimeError::fail_closed("unknown_method"));
                }
                Ok(Some(Incoming::Notification { params, .. })) => {
                    self.last_prompt_updates.push(params);
                }
                Ok(None) => {}
                Err(error) => {
                    self.close_fail();
                    return Err(error);
                }
            }
            if started.elapsed() > Duration::from_millis(DEFAULT_REQUEST_TIMEOUT_MS) {
                if let Ok(mut session) = self.session.lock() {
                    session.expire_pending(started);
                }
                return Err(RuntimeError::fail_closed("request_timeout"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }

    pub fn respond_request(&mut self, id: &Value, result: Value) -> RuntimeResult<()> {
        let line = encode_line(&json!({ "jsonrpc": "2.0", "id": id, "result": result }))?;
        self.write_line(&line)
    }

    pub fn has_pending_prompt(&self) -> bool {
        self.pending_prompt_id.is_some()
    }

    pub fn cancel_session(&mut self, session_id: &str) -> RuntimeResult<()> {
        self.notify("session/cancel", json!({ "sessionId": session_id }))
    }

    #[cfg(test)]
    pub fn attach_scripted(script: ScriptedAgent) -> Self {
        let (to_agent_tx, to_agent_rx) = mpsc::channel::<String>();
        let (from_agent_tx, from_agent_rx) = mpsc::channel::<String>();
        thread::spawn(move || script.serve(to_agent_rx, from_agent_tx));
        Self {
            lock: CommandLock::default(),
            child: None,
            session: Mutex::new(JsonRpcSession::default()),
            stdout_rx: Some(from_agent_rx),
            stderr_rx: None,
            stdin: None,
            scripted_stdin: Some(to_agent_tx),
            pending_prompt_id: None,
            session_new_count: 0,
            last_prompt_updates: Vec::new(),
        }
    }

    fn write_line(&mut self, line: &str) -> RuntimeResult<()> {
        if let Some(tx) = &self.scripted_stdin {
            return tx
                .send(line.trim_end().to_string())
                .map_err(|_| RuntimeError::fail_closed("closed"));
        }
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| RuntimeError::fail_closed("closed"))?;
        stdin
            .write_all(line.as_bytes())
            .map_err(|_| RuntimeError::fail_closed("stdio_write"))?;
        stdin.flush().map_err(|_| RuntimeError::fail_closed("stdio_write"))
    }

    fn try_read(&mut self) -> RuntimeResult<Option<Incoming>> {
        if let Some(rx) = &self.stdout_rx {
            match rx.try_recv() {
                Ok(line) => {
                    let mut session = self
                        .session
                        .lock()
                        .map_err(|_| RuntimeError::fail_closed("process_lock"))?;
                    return session.accept_line(&line);
                }
                Err(mpsc::TryRecvError::Empty) => {}
                Err(mpsc::TryRecvError::Disconnected) => {
                    self.close_fail();
                    return Err(RuntimeError::fail_closed("closed"));
                }
            }
        }
        if let Some(rx) = &self.stderr_rx {
            while let Ok(_redacted) = rx.try_recv() {}
        }
        Ok(None)
    }
}

impl Drop for CursorAcpProcessHost {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub fn smoke_vendor_process(lock: &CommandLock, policy: &TrustPolicy) -> VendorProbe {
    let mut probe = probe_vendor_cli(lock, policy);
    if !probe.available {
        return probe;
    }
    probe.spawn_attempted = true;
    match CursorAcpProcessHost::spawn(lock.clone(), policy) {
        Ok(mut host) => {
            probe.process_started = true;
            let _ = host.request(
                "initialize",
                json!({
                    "protocolVersion": lock.protocol_version,
                    "clientInfo": { "name": "agentrix-developer-runtime", "version": "0.0.0-local" },
                    "clientCapabilities": { "fs": { "readTextFile": false, "writeTextFile": false }, "terminal": false }
                }),
            );
            probe.reason_code = "vendor_process_smoke_unverified".into();
            probe
        }
        Err(error) => {
            probe.process_started = false;
            probe.reason_code = error.reason_code;
            probe.available = false;
            probe
        }
    }
}

#[derive(Clone)]
pub struct ScriptedAgent {
    pub request_permission: bool,
    pub hang: bool,
    pub wrong_id: bool,
}

impl Default for ScriptedAgent {
    fn default() -> Self {
        Self {
            request_permission: true,
            hang: false,
            wrong_id: false,
        }
    }
}

impl ScriptedAgent {
    pub fn serve(self, rx: mpsc::Receiver<String>, tx: mpsc::Sender<String>) {
        while let Ok(line) = rx.recv() {
            let Ok(parsed) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let id = parsed.get("id").cloned().unwrap_or(json!(1));
            let method = parsed.get("method").and_then(Value::as_str).unwrap_or("");
            if self.hang {
                thread::sleep(Duration::from_millis(DEFAULT_REQUEST_TIMEOUT_MS + 50));
            }
            let reply_id = if self.wrong_id { json!(999_999) } else { id };
            let response = match method {
                "initialize" => json!({"jsonrpc":"2.0","id":reply_id,"result":{"protocolVersion":1}}),
                "authenticate" => json!({"jsonrpc":"2.0","id":reply_id,"result":{"authenticated":true}}),
                "session/list" => json!({"jsonrpc":"2.0","id":reply_id,"result":{"sessions":[]}}),
                "session/new" => json!({"jsonrpc":"2.0","id":reply_id,"result":{"sessionId":"acp-session-1"}}),
                "session/prompt" => {
                    let _ = tx.send(json!({
                        "jsonrpc":"2.0",
                        "method":"session/update",
                        "params":{"sessionId":"acp-session-1","update":{"sessionUpdate":"agent_message_chunk"}}
                    }).to_string());
                    if self.request_permission {
                        let _ = tx.send(json!({
                            "jsonrpc":"2.0",
                            "id": 80,
                            "method":"session/request_permission",
                            "params":{
                                "sessionId":"acp-session-1",
                                "toolCall":{
                                    "toolCallId":"fs-write-1",
                                    "title":"Write file",
                                    "kind":"edit",
                                    "rawInput":{"path":"README.md"}
                                }
                            }
                        }).to_string());
                        loop {
                            let Ok(reply) = rx.recv() else { break };
                            let Ok(parsed_reply) = serde_json::from_str::<Value>(&reply) else {
                                continue;
                            };
                            if parsed_reply.get("id") == Some(&json!(80))
                                && parsed_reply.get("result").is_some()
                            {
                                break;
                            }
                        }
                    }
                    json!({"jsonrpc":"2.0","id":reply_id,"result":{"stopReason":"end_turn"}})
                }
                _ => json!({"jsonrpc":"2.0","id":reply_id,"error":{"code":-32601,"message":"method not found"}}),
            };
            let _ = tx.send(response.to_string());
        }
    }
}

pub fn assert_known_client_method(method: &str) -> RuntimeResult<()> {
    match method {
        "initialize"
        | "authenticate"
        | "session/list"
        | "session/new"
        | "session/load"
        | "session/prompt"
        | "session/cancel" => Ok(()),
        _ => Err(RuntimeError::fail_closed("unknown_method")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framing_roundtrip_and_unknown_schema() {
        let mut session = JsonRpcSession::default();
        let line = session
            .encode_request("initialize", json!({ "protocolVersion": 1 }))
            .unwrap();
        assert!(line.ends_with('\n'));
        let incoming = parse_line(&line).unwrap();
        match incoming {
            Incoming::Request { method, .. } => assert_eq!(method, "initialize"),
            _ => panic!("expected request"),
        }
        assert_eq!(
            parse_line(r#"{"jsonrpc":"2.0","id":1,"result":{},"rawPrompt":"x"}"#)
                .unwrap_err()
                .code(),
            "unknown_schema"
        );
        session.close();
        let mut session = JsonRpcSession::default();
        for _ in 0..MAX_PENDING_RPC {
            session
                .encode_request("session/prompt", json!({}))
                .unwrap();
        }
        assert_eq!(
            session
                .encode_request("session/prompt", json!({}))
                .unwrap_err()
                .code(),
            "rpc_backpressure"
        );
    }

    #[test]
    fn vendor_probe_is_typed_when_missing() {
        let previous = std::env::var_os("PATH");
        std::env::set_var("PATH", "");
        let probe = smoke_vendor_process(&CommandLock::default(), &TrustPolicy::default());
        match previous {
            Some(value) => std::env::set_var("PATH", value),
            None => std::env::remove_var("PATH"),
        }
        assert!(!probe.available);
        assert_eq!(probe.reason_code, "vendor_cli_unavailable");
        assert!(!probe.production_claim);
        assert!(!probe.spawn_attempted);
        assert!(!probe.process_started);
    }

    #[test]
    fn resolve_cli_returns_the_spawnable_file_name_not_just_a_bool() {
        let dir = tempfile::tempdir().unwrap();
        let dirs = || vec![dir.path().to_path_buf()];
        assert_eq!(resolve_cli_in_dirs("agent", dirs()), None);
        if cfg!(windows) {
            // Cursor CLI on Windows installs only shims: agent.cmd + agent.ps1.
            std::fs::write(dir.path().join("agent.ps1"), "# shim").unwrap();
            assert_eq!(resolve_cli_in_dirs("agent", dirs()), None);
            std::fs::write(dir.path().join("agent.cmd"), "@echo off\r\n").unwrap();
            assert_eq!(resolve_cli_in_dirs("agent", dirs()).as_deref(), Some("agent.cmd"));
            // A real binary wins over the shim when both exist.
            std::fs::write(dir.path().join("agent.exe"), b"MZ").unwrap();
            assert_eq!(resolve_cli_in_dirs("agent", dirs()).as_deref(), Some("agent.exe"));
            // An explicit extension is matched exactly.
            assert_eq!(
                resolve_cli_in_dirs("agent.cmd", dirs()).as_deref(),
                Some("agent.cmd")
            );
        } else {
            std::fs::write(dir.path().join("agent.cmd"), "").unwrap();
            assert_eq!(resolve_cli_in_dirs("agent", dirs()), None);
            std::fs::write(dir.path().join("agent"), "").unwrap();
            assert_eq!(resolve_cli_in_dirs("agent", dirs()).as_deref(), Some("agent"));
        }
    }

    #[test]
    fn every_resolvable_shim_name_stays_inside_the_command_allowlist() {
        let policy = TrustPolicy::default();
        for name in cli_candidates("agent") {
            let lock = CommandLock {
                program: name.clone(),
                ..CommandLock::default()
            };
            assert!(
                policy.validate_command_lock(&lock).is_ok(),
                "resolved program {name} must be allowlisted"
            );
        }
        assert_eq!(
            policy
                .validate_command_lock(&CommandLock {
                    program: "agent.ps1".into(),
                    ..CommandLock::default()
                })
                .unwrap_err()
                .code(),
            "command_not_allowlisted"
        );
    }

    #[test]
    fn stderr_redaction_hides_tokens() {
        assert!(redact_stderr("export CURSOR_API_KEY=super-secret-provider-token").contains("[redacted]"));
    }

    #[test]
    fn request_accepts_exact_id_and_keeps_notifications() {
        let mut host = CursorAcpProcessHost::attach_scripted(ScriptedAgent::default());
        host.initialize().unwrap();
        host.authenticate().unwrap();
        host.session_new("workspace-1").unwrap();
        host.start_prompt("acp-session-1", "instruction-1").unwrap();
        match host.drive_prompt().unwrap() {
            PromptProgress::Permission { id, params } => {
                assert_eq!(params["toolCall"]["toolCallId"], "fs-write-1");
                host.respond_request(
                    &id,
                    json!({ "outcome": { "outcome": "selected", "optionId": "allow-once" } }),
                )
                .unwrap();
            }
            other => panic!("expected permission, got {other:?}"),
        }
        match host.drive_prompt().unwrap() {
            PromptProgress::Done(prompted) => assert_eq!(prompted["stopReason"], "end_turn"),
            other => panic!("expected prompt completion, got {other:?}"),
        }
    }

    #[test]
    fn wrong_id_and_unknown_schema_fail_closed() {
        let mut host = CursorAcpProcessHost::attach_scripted(ScriptedAgent {
            wrong_id: true,
            ..ScriptedAgent::default()
        });
        assert_eq!(host.initialize().unwrap_err().code(), "unknown_rpc_id");
        assert_eq!(
            parse_line(r#"{"jsonrpc":"2.0","id":1,"error":"oops"}"#)
                .unwrap_err()
                .code(),
            "unknown_schema"
        );
    }

    #[test]
    fn timeout_clears_pending_and_late_id_is_ignored() {
        let mut session = JsonRpcSession::default();
        session.timeout = Duration::from_millis(1);
        let (id, _) = session
            .encode_request_id("initialize", json!({}))
            .unwrap();
        let started = Instant::now() - Duration::from_millis(5);
        session.expire_pending(started);
        assert!(session.pending.is_empty());
        let late = format!(r#"{{"jsonrpc":"2.0","id":{id},"result":{{}}}}"#);
        assert!(session.accept_line(&late).unwrap().is_none());
        assert_eq!(
            session
                .accept_line(r#"{"jsonrpc":"2.0","id":77,"result":{}}"#)
                .unwrap_err()
                .code(),
            "unknown_rpc_id"
        );
    }
}
