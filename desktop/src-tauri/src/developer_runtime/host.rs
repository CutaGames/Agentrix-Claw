//! Default-off Runtime Host. WebView only receives presentation projections.

use crate::developer_runtime::approval::{project_permission_request, vendor_allow_once};
use crate::developer_runtime::binding::{verify_projection, BindingSource, UnavailableBindingSource};
use crate::developer_runtime::channel::{
    claim_body, offer_digest, parse_offer, parse_session_operation, receipt_is_completed,
    session_operation_claim_body, validate_claim_snapshot, validate_session_operation_claim,
    validate_session_ready, validate_terminal_readback, DisabledChannel, OutboundChannelClient,
};
use crate::developer_runtime::confirmation::confirm_l3_once;
use crate::developer_runtime::jcs::jcs_digest;
use crate::developer_runtime::crypto::{OsKeyringStore, SecureStore};
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::journal::EncryptedJournal;
use crate::developer_runtime::policy::{
    heartbeat_valid_until, is_opaque, presentation_strip, TrustPolicy,
};
use crate::developer_runtime::process::{
    probe_vendor_cli, smoke_vendor_process, CursorAcpProcessHost,
};
use crate::developer_runtime::process::PromptProgress;
use crate::developer_runtime::types::{
    now_iso, AuthorityDecision, CapabilityHeartbeat, CommandLock, JournalRecord, MappedSession,
    PendingApproval, RuntimeOffer, RuntimePresentation, SessionOperation, VerifiedBinding,
    VendorProbe, HEARTBEAT_INTERVAL_MS, KEYRING_CHANNEL_TOKEN, KEYRING_PROCESS_TOKEN,
    KEYRING_SERVICE, MAX_CLAIM_IN_FLIGHT,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use zeroize::Zeroize;

pub struct RuntimeHost {
    enabled: bool,
    revoked: bool,
    verified: Option<VerifiedBinding>,
    policy: TrustPolicy,
    journal: Option<EncryptedJournal>,
    store: Box<dyn SecureStore>,
    channel: Box<dyn OutboundChannelClient>,
    binding_source: Box<dyn BindingSource>,
    process: Option<CursorAcpProcessHost>,
    command_lock: CommandLock,
    heartbeat_sequence: u64,
    last_heartbeat: Option<CapabilityHeartbeat>,
    pending_approval: Option<Value>,
    vendor_process_started: bool,
    channel_credential: Option<String>,
    path_map: HashMap<String, PathBuf>,
    session_map: HashMap<String, MappedSession>,
    acp_session_id: Option<String>,
    loop_requested: bool,
    opted_in: bool,
    process_generation: u64,
    process_initialized: bool,
    pending_vendor: Option<PendingApproval>,
    in_flight_claims: usize,
    #[cfg(test)]
    scripted_acp: bool,
    #[cfg(test)]
    prompt_calls: u32,
    l3_fixture: Option<bool>,
    last_loop_error: Option<String>,
}

pub struct DeveloperRuntimeState {
    pub inner: std::sync::Arc<Mutex<RuntimeHost>>,
    loop_started: std::sync::atomic::AtomicBool,
}

impl Default for DeveloperRuntimeState {
    fn default() -> Self {
        Self {
            inner: std::sync::Arc::new(Mutex::new(RuntimeHost::from_environment())),
            loop_started: std::sync::atomic::AtomicBool::new(false),
        }
    }
}

impl DeveloperRuntimeState {
    pub fn start_loop(&self) {
        if self
            .loop_started
            .swap(true, std::sync::atomic::Ordering::SeqCst)
        {
            return;
        }
        crate::developer_runtime::runtime_loop::start(self.inner.clone());
    }

    /// Desktop D2 — emergency stop (tray "急停" or the TS kill-switch mirror).
    ///
    /// Runs on its own thread: the background loop holds the host lock for a
    /// whole tick, and both callers run on the UI thread. A poisoned lock is
    /// still taken — stopping must not depend on the loop having exited cleanly.
    pub fn emergency_stop_detached(&self) {
        let inner = self.inner.clone();
        let _ = std::thread::Builder::new()
            .name("developer-runtime-emergency-stop".into())
            .spawn(move || {
                let mut host = inner
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = host.emergency_stop();
            });
    }
}

impl RuntimeHost {
    pub fn default_off() -> Self {
        Self {
            enabled: false,
            revoked: false,
            verified: None,
            policy: TrustPolicy::default(),
            journal: None,
            store: Box::new(OsKeyringStore),
            channel: Box::new(DisabledChannel),
            binding_source: Box::new(UnavailableBindingSource),
            process: None,
            command_lock: CommandLock::default(),
            heartbeat_sequence: 0,
            last_heartbeat: None,
            pending_approval: None,
            vendor_process_started: false,
            channel_credential: None,
            path_map: HashMap::new(),
            session_map: HashMap::new(),
            acp_session_id: None,
            loop_requested: false,
            opted_in: false,
            process_generation: 0,
            process_initialized: false,
            pending_vendor: None,
            in_flight_claims: 0,
            #[cfg(test)]
            scripted_acp: false,
            #[cfg(test)]
            prompt_calls: 0,
            l3_fixture: None,
            last_loop_error: None,
        }
    }

    pub fn from_environment() -> Self {
        let mut host = Self::default_off();
        let _ = host.instantiate_production();
        host
    }

    pub fn instantiate_production(&mut self) -> RuntimeResult<()> {
        self.instantiate_production_if(crate::developer_runtime::types::runtime_opt_in())
    }

    #[cfg(test)]
    pub fn instantiate_production_for_test(&mut self) -> RuntimeResult<()> {
        self.instantiate_production_if(true)
    }

    fn instantiate_production_if(&mut self, opted_in: bool) -> RuntimeResult<()> {
        // Revocation is sticky for the life of the process: never re-read the
        // keyring or rebuild the outbound clients after an emergency stop.
        if self.revoked {
            return Err(RuntimeError::unavailable("runtime_revoked"));
        }
        if !opted_in {
            return Err(RuntimeError::unavailable("runtime_default_off"));
        }
        if self.channel_credential.is_some() && self.enabled {
            return Ok(());
        }
        let jwt = match self.store.get_text(
            crate::developer_runtime::types::KEYRING_SERVICE,
            crate::developer_runtime::types::KEYRING_CHANNEL_TOKEN,
        ) {
            Ok(Some(value)) if value.contains('.') && !value.is_empty() => Ok(value),
            Ok(Some(_)) => Err(RuntimeError::fail_closed("channel_credential_corrupt")),
            Ok(None) => Err(RuntimeError::unavailable("channel_credential_missing")),
            Err(error) => Err(error),
        }?;
        let policy = TrustPolicy::default();
        let client = crate::developer_runtime::channel::HttpsOutboundClient::production(
            Some(jwt.clone()),
            policy.clone(),
        )?;
        let binding_client = crate::developer_runtime::channel::HttpsOutboundClient::production(
            Some(jwt.clone()),
            policy,
        )?;
        self.channel = Box::new(client);
        self.binding_source = Box::new(crate::developer_runtime::binding::HttpsBindingSource::new(
            binding_client,
        ));
        self.channel_credential = Some(jwt);
        self.enabled = true;
        Ok(())
    }

    #[cfg(test)]
    pub fn for_test(
        journal_path: PathBuf,
        store: crate::developer_runtime::crypto::MemorySecureStore,
        binding_source: Box<dyn BindingSource>,
        mut channel: crate::developer_runtime::channel::RecordingChannel,
    ) -> RuntimeResult<Self> {
        let _ = journal_path;
        channel
            .connect_outbound("https://api.agentrix.top/api/v1/developer/runtime")
            .ok();
        Ok(Self {
            enabled: true,
            revoked: false,
            verified: None,
            policy: TrustPolicy::default(),
            journal: None,
            store: Box::new(store),
            channel: Box::new(channel),
            binding_source,
            process: None,
            command_lock: CommandLock::default(),
            heartbeat_sequence: 0,
            last_heartbeat: None,
            pending_approval: None,
            vendor_process_started: false,
            channel_credential: None,
            path_map: HashMap::new(),
            session_map: HashMap::new(),
            acp_session_id: None,
            loop_requested: false,
            opted_in: true,
            process_generation: 0,
            process_initialized: false,
            pending_vendor: None,
            in_flight_claims: 0,
            #[cfg(test)]
            scripted_acp: true,
            #[cfg(test)]
            prompt_calls: 0,
            l3_fixture: Some(true),
            last_loop_error: None,
        })
    }

    #[cfg(test)]
    pub fn for_http(
        journal_path: PathBuf,
        store: crate::developer_runtime::crypto::MemorySecureStore,
        binding_source: Box<dyn BindingSource>,
        mut channel: crate::developer_runtime::channel::HttpsOutboundClient,
    ) -> RuntimeResult<Self> {
        let _ = journal_path;
        channel
            .connect_outbound("https://api.agentrix.top/api/v1/developer/runtime")
            .ok();
        Ok(Self {
            enabled: true,
            revoked: false,
            verified: None,
            policy: TrustPolicy::default(),
            journal: None,
            store: Box::new(store),
            channel: Box::new(channel),
            binding_source,
            process: None,
            command_lock: CommandLock::default(),
            heartbeat_sequence: 0,
            last_heartbeat: None,
            pending_approval: None,
            vendor_process_started: false,
            channel_credential: None,
            path_map: HashMap::new(),
            session_map: HashMap::new(),
            acp_session_id: None,
            loop_requested: false,
            opted_in: true,
            process_generation: 0,
            process_initialized: false,
            pending_vendor: None,
            in_flight_claims: 0,
            scripted_acp: true,
            prompt_calls: 0,
            l3_fixture: Some(true),
            last_loop_error: None,
        })
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled && !self.revoked
    }

    pub fn is_operational(&self) -> bool {
        self.enabled && !self.revoked && self.channel_credential.is_some()
    }

    pub fn enable_from_flags(&mut self) {
        self.opted_in = crate::developer_runtime::types::runtime_opt_in();
        if self.instantiate_production_if(self.opted_in).is_err() && !self.is_operational() {
            self.enabled = false;
        }
    }

    #[cfg(test)]
    pub fn store_for_test(&mut self, store: Box<dyn SecureStore>) {
        self.store = store;
    }

    #[cfg(test)]
    pub fn enable_for_test(&mut self) {
        self.enabled = true;
    }

    pub fn should_stop_loop(&self) -> bool {
        self.revoked || !self.enabled
    }

    pub fn bootstrap(&mut self, bootstrap_ref: &str, journal_path: PathBuf) -> RuntimeResult<Value> {
        // Revoked first: revoke() also clears `enabled`, and the UI must say
        // "已撤销" rather than "默认关闭".
        if self.revoked {
            return Err(RuntimeError::unavailable("runtime_revoked"));
        }
        if !self.enabled {
            return Err(RuntimeError::unavailable("runtime_default_off"));
        }
        if !is_opaque(bootstrap_ref) {
            return Err(RuntimeError::fail_closed("unknown_schema"));
        }
        let projection = self.binding_source.fetch(bootstrap_ref)?;
        let verified = verify_projection(&projection, &now_iso(), &self.policy)?;
        self.journal = Some(EncryptedJournal::open(journal_path, self.store.as_ref())?);
        self.verified = Some(verified);
        self.restore_persisted_maps();
        self.restore_pending_from_journal();
        self.loop_requested = true;
        Ok(self.status_payload())
    }

    pub fn refresh(&mut self, bootstrap_ref: &str, journal_path: PathBuf) -> RuntimeResult<Value> {
        self.verified = None;
        self.bootstrap(bootstrap_ref, journal_path)
    }

    pub fn revoke(&mut self) -> RuntimeResult<Vec<JournalRecord>> {
        self.revoked = true;
        self.enabled = false;
        self.kill_process();
        self.path_map.clear();
        if let Some(token) = &mut self.channel_credential {
            token.zeroize();
        }
        self.channel_credential = None;
        let _ = self.store.delete(KEYRING_SERVICE, KEYRING_CHANNEL_TOKEN);
        let _ = self.store.delete(KEYRING_SERVICE, KEYRING_PROCESS_TOKEN);
        self.channel.disconnect();
        self.verified = None;
        self.query_inflight()
    }

    /// Desktop D2 — emergency stop. A host that was never live (default off,
    /// nothing bound, no process, no credential) only latches `revoked`, so it
    /// cannot be enabled later in this process and the OS keychain is not
    /// touched. Otherwise this is a full `revoke()`: kill the vendor process,
    /// drop the binding and credentials, and return in-flight rows for
    /// query-first recovery (never replay).
    pub fn emergency_stop(&mut self) -> RuntimeResult<Vec<JournalRecord>> {
        let never_live = !self.enabled
            && self.verified.is_none()
            && self.process.is_none()
            && self.channel_credential.is_none();
        if never_live {
            self.revoked = true;
            self.path_map.clear();
            return Ok(Vec::new());
        }
        self.revoke()
    }

    pub fn heartbeat(&mut self) -> RuntimeResult<CapabilityHeartbeat> {
        self.require_verified()?;
        self.heartbeat_sequence += 1;
        let observed_at = now_iso();
        let vendor_probe = probe_vendor_cli(&self.command_lock, &self.policy);
        let cli_available = vendor_probe.available;
        let process_running = self.vendor_process_started && self.process.is_some();
        let beat = CapabilityHeartbeat {
            sequence: self.heartbeat_sequence,
            observed_at: observed_at.clone(),
            valid_until: heartbeat_valid_until(&observed_at),
            adapter_ref: "cursor-acp-local-runtime".into(),
            session_resume: "planned".into(),
            terminal_query: "unsupported".into(),
            vendor_process: if process_running {
                "spawned".into()
            } else if cli_available {
                "available_unverified".into()
            } else {
                "unavailable".into()
            },
            production_certification: false,
        };
        let verified = self.verified.as_ref().expect("verified");
        let machine_ref = verified.binding.machine_ref.clone();
        let machine_version = verified.binding.machine_version;
        let platform = match std::env::consts::OS {
            "macos" => "macos",
            "linux" => "linux",
            _ => "windows",
        };
        let body = json!({
            "machineRef": machine_ref,
            "expectedVersion": machine_version,
            "deviceRef": verified.binding.device_ref,
            "agentId": verified.binding.agent_id,
            "runtimeRef": verified.binding.runtime_ref,
            "adapterManifestRef": "cursor-acp-local-runtime-manifest-1",
            "adapterManifestVersion": 1,
            "displayLabel": "desktop-runtime",
            "platform": platform,
            "axes": {
                "presence": "present",
                "process": if process_running { "running" } else { "stopped" },
                "cli": if cli_available { "installed" } else { "not_installed" },
                "ide": "unknown",
                "workspaceTrust": "trusted",
                "sessionResumability": "unsupported",
                "permissionBridge": if cli_available { "available" } else { "unavailable" }
            },
            "connection": {
                "status": "online",
                "observedAt": observed_at,
                "validUntil": beat.valid_until
            },
            "shellBindingRef": {
                "type": "shell_session_binding",
                "id": verified.binding.shell_binding_ref,
                "version": verified.binding.shell_binding_version
            },
            "capabilityValidUntil": beat.valid_until,
            "capabilitySequence": beat.sequence
        });
        let saved = self
            .channel
            .post("/heartbeat", body, &format!("hb-{}", beat.sequence))?;
        if saved.get("machineRef").and_then(Value::as_str) != Some(machine_ref.as_str()) {
            return Err(RuntimeError::fail_closed("heartbeat_readback_mismatch"));
        }
        let next_version = saved
            .get("projectionSequence")
            .and_then(Value::as_u64)
            .ok_or_else(|| RuntimeError::fail_closed("heartbeat_version_missing"))?;
        if next_version != machine_version + 1 {
            return Err(RuntimeError::fail_closed("heartbeat_version_mismatch"));
        }
        self.verified
            .as_mut()
            .expect("verified")
            .binding
            .machine_version = next_version;
        self.last_heartbeat = Some(beat.clone());
        let _ = HEARTBEAT_INTERVAL_MS;
        Ok(beat)
    }

    pub fn claim_offer(&mut self, raw: Value) -> RuntimeResult<Value> {
        self.require_verified()?;
        if self.in_flight_claims >= MAX_CLAIM_IN_FLIGHT {
            return Err(RuntimeError::unavailable("claim_backpressure"));
        }
        let verified = self.verified.clone().expect("verified");
        let offer = parse_offer(&raw, &verified)?;
        crate::developer_runtime::workspace_trust::resolve_cwd(&verified, &self.path_map)?;
        match self.mapped_adapter_session(&offer.session_ref)? {
            Some(_) => {}
            None => return Err(RuntimeError::unavailable("session_not_ready")),
        }
        let body = claim_body(&verified, &offer)?;
        let claimed = self
            .channel
            .post("/claims", body, &offer.idempotency_key)
            .map_err(|error| {
                if error.reason_code == "channel_default_off" {
                    RuntimeError::unavailable("runtime_channel_unavailable")
                } else {
                    error
                }
            })?;
        validate_claim_snapshot(&claimed, &verified, &offer)?;
        let journal = self
            .journal
            .as_ref()
            .ok_or_else(|| RuntimeError::fail_closed("journal_missing"))?;
        let record = JournalRecord {
            binding_ref: verified.binding.shell_binding_ref.clone(),
            adapter_session_ref: offer.adapter_session_ref.clone(),
            instruction_ref: Some(offer.instruction_ref.clone()),
            idempotency_key: offer.idempotency_key.clone(),
            nonce_domain: offer.nonce_domain.clone(),
            nonce: offer.nonce.clone(),
            sequence: 1,
            state: "claimed".into(),
            refs_json: json!({
                "instructionRef": offer.instruction_ref,
                "actionRef": offer.action_ref,
                "sessionRef": offer.session_ref,
                "sessionVersion": offer.session_version,
                "expectedInstructionVersion": offer.instruction_version,
                "requestDigest": offer.request_digest,
                "offerDigest": offer_digest(&offer)?,
                "workspaceRef": offer.workspace_ref,
                "startedAt": now_iso(),
                "offer": offer,
            }),
            created_at: now_iso(),
            updated_at: now_iso(),
        };
        match journal.reserve(&record) {
            Ok(()) => self.in_flight_claims += 1,
            Err(error) if error.reason_code == "idempotency_or_nonce_conflict" => {
                let existing = journal
                    .get_by_idempotency(
                        &verified.binding.shell_binding_ref,
                        &offer.adapter_session_ref,
                        &offer.idempotency_key,
                    )?
                    .ok_or(error)?;
                if existing.instruction_ref.as_deref() != Some(offer.instruction_ref.as_str()) {
                    return Err(RuntimeError::fail_closed("idempotency_or_nonce_conflict"));
                }
                if existing.state == "completed" {
                    return Ok(json!({
                        "state": "completed",
                        "queryFirst": true,
                        "terminal": "completed",
                        "replay": true,
                    }));
                }
            }
            Err(error) => return Err(error),
        }
        match self.run_claimed_instruction(&offer) {
            Ok(payload) => {
                if payload.get("state") != Some(&json!("awaiting_approval")) {
                    self.in_flight_claims = self.in_flight_claims.saturating_sub(1);
                }
                Ok(payload)
            }
            Err(error) => {
                self.in_flight_claims = self.in_flight_claims.saturating_sub(1);
                let _ = self.post_unknown_terminal(&offer, &error.reason_code);
                Err(error)
            }
        }
    }

    fn run_claimed_instruction(&mut self, offer: &RuntimeOffer) -> RuntimeResult<Value> {
        let session_id = self
            .mapped_adapter_session(&offer.session_ref)?
            .ok_or_else(|| RuntimeError::unavailable("session_not_ready"))?;
        let prompt_buf = self.load_instruction_payload(offer)?;
        let mut prompt_text = String::from_utf8(prompt_buf.to_vec())
            .map_err(|_| RuntimeError::fail_closed("payload_corrupt"))?;
        self.ensure_process_initialized()?;
        #[cfg(test)]
        {
            self.prompt_calls += 1;
        }
        let process = self
            .process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_cli_unavailable"))?;
        process.start_prompt(&session_id, &prompt_text)?;
        prompt_text.zeroize();
        drop(prompt_buf);
        self.drive_active_prompt(offer, &session_id)
    }

    fn mapped_adapter_session(&mut self, session_ref: &str) -> RuntimeResult<Option<String>> {
        match self.session_map.get(session_ref).cloned() {
            Some(mapped) if mapped.process_generation == self.process_generation => {
                self.acp_session_id = Some(mapped.adapter_session_ref.clone());
                Ok(Some(mapped.adapter_session_ref))
            }
            Some(_) => {
                if let Some(process) = self.process.as_mut() {
                    let _ = process.session_load();
                }
                Err(RuntimeError::unavailable("session_resume_unverified"))
            }
            None => Ok(None),
        }
    }

    fn ensure_process_initialized(&mut self) -> RuntimeResult<()> {
        self.try_start_process()?;
        if self.process_initialized {
            return Ok(());
        }
        let process = self
            .process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_cli_unavailable"))?;
        process.initialize()?;
        process.authenticate()?;
        self.process_initialized = true;
        Ok(())
    }

    fn drive_active_prompt(&mut self, offer: &RuntimeOffer, session_id: &str) -> RuntimeResult<Value> {
        loop {
            let progress = self
                .process
                .as_mut()
                .ok_or_else(|| RuntimeError::unavailable("vendor_process_not_started"))?
                .drive_prompt()?;
            match progress {
                PromptProgress::Done(prompted) => {
                    self.mark_state(offer, "running")?;
                    return self.complete_from_acp_done(offer, session_id, &prompted);
                }
                PromptProgress::Permission { id, params } => {
                    match self.submit_permission_from_acp(offer, &id, &params)? {
                        Some(result) => {
                            self.process
                                .as_mut()
                                .ok_or_else(|| RuntimeError::unavailable("vendor_process_not_started"))?
                                .respond_request(&id, result)?;
                        }
                        None => {
                            self.persist_pending_approval(offer)?;
                            return Ok(json!({
                                "state": "awaiting_approval",
                                "queryFirst": true,
                                "terminal": "unknown_outcome",
                                "sessionId": session_id,
                            }));
                        }
                    }
                }
            }
        }
    }

    fn load_instruction_payload(
        &mut self,
        offer: &RuntimeOffer,
    ) -> RuntimeResult<zeroize::Zeroizing<Vec<u8>>> {
        let verified = self
            .verified
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let fetched = self
            .channel
            .get(
                "/data",
                &[
                    ("dataRef", offer.payload_ref.data_ref.as_str()),
                    ("deviceRef", verified.binding.device_ref.as_str()),
                    ("runtimeId", verified.binding.runtime_ref.id.as_str()),
                    ("encoding", "plaintext_base64"),
                ],
            )
            .map_err(|_| RuntimeError::unavailable("data_plane_unavailable"))?;
        let runtime_aead = crate::developer_runtime::crypto::JournalAead::load_runtime(
            self.store.as_ref(),
        )?;
        let opened = crate::developer_runtime::payload::open_instruction_payload(
            &fetched,
            &offer.payload_ref,
            &runtime_aead,
            &verified.binding.runtime_ref.id,
        )?;
        let delivery_ref = opened
            .delivery_ref
            .ok_or_else(|| RuntimeError::fail_closed("data_ack_missing"))?;
        self.channel.post(
            "/data/ack",
            json!({
                "dataRef": offer.payload_ref.data_ref,
                "deliveryRef": delivery_ref
            }),
            &format!("ack-{}", offer.idempotency_key),
        )?;
        Ok(opened.plaintext)
    }

    fn submit_permission_from_acp(
        &mut self,
        offer: &RuntimeOffer,
        rpc_id: &Value,
        params: &Value,
    ) -> RuntimeResult<Option<Value>> {
        let verified = self.verified.as_ref().expect("verified");
        let tool = params.get("toolCall").cloned().unwrap_or_else(|| json!({}));
        let tool_call_id = tool
            .get("toolCallId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
        let tool_name = [tool.get("kind"), tool.get("title")]
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .find(|value| is_opaque(value))
            .unwrap_or("tool_call");
        let raw_input = tool.get("rawInput").cloned().unwrap_or(json!({}));
        let request = self.project_permission(json!({
            "sessionRef": offer.session_ref,
            "sessionVersion": offer.session_version,
            "adapterSessionRef": offer.adapter_session_ref,
            "instructionRef": offer.instruction_ref,
            "actionRef": offer.action_ref,
            "workspaceRef": offer.workspace_ref,
            "toolCallId": tool_call_id,
            "toolName": tool_name,
            "instructionDigest": offer.request_digest,
            "workspaceDigest": verified.binding.workspace_digest,
            "argumentDigestSource": raw_input,
        }))?;
        self.channel.post(
            "/approvals",
            request.clone(),
            &format!("apr-{}", offer.idempotency_key),
        )?;
        let approval_ref = request
            .get("approvalRef")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        self.pending_vendor = Some(PendingApproval {
            approval_ref: approval_ref.clone(),
            rpc_id: rpc_id.clone(),
            instruction_ref: offer.instruction_ref.clone(),
            action_ref: offer.action_ref.clone(),
            session_ref: offer.session_ref.clone(),
            request_digest: offer.request_digest.clone(),
            expires_at: request
                .get("expiresAt")
                .and_then(Value::as_str)
                .unwrap_or(&now_iso())
                .to_string(),
            idempotency_key: offer.idempotency_key.clone(),
        });
        if let Some(result) = self.poll_authority_once(&request)? {
            self.pending_vendor = None;
            return Ok(Some(result));
        }
        Ok(None)
    }

    fn poll_authority_once(&mut self, request: &Value) -> RuntimeResult<Option<Value>> {
        let approval_ref = request
            .get("approvalRef")
            .and_then(Value::as_str)
            .unwrap_or("");
        let verified = self
            .verified
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let inbox = match self.channel.get(
            "/approvals",
            &[
                ("deviceRef", verified.binding.device_ref.as_str()),
                ("runtimeId", verified.binding.runtime_ref.id.as_str()),
                ("approvalRef", approval_ref),
            ],
        ) {
            Ok(value) => value,
            Err(error) if error.reason_code == "channel_not_connected" => return Ok(None),
            Err(error) => return Err(error),
        };
        let item = inbox
            .get("items")
            .and_then(Value::as_array)
            .and_then(|items| {
                items.iter().find(|row| {
                    row.get("approvalRef").and_then(Value::as_str) == Some(approval_ref)
                        && row.get("decision").is_some()
                })
            })
            .cloned();
        let Some(item) = item else {
            return Ok(None);
        };
        let mut decision = crate::developer_runtime::approval::canonical_authority_decision(
            &item,
            request.get("requestDigest").cloned().unwrap_or(Value::Null),
        )?;
        if decision.decision == "approved" {
            let fence = match confirm_l3_once(
                &decision.approval_ref,
                &decision.request_digest,
                self.l3_fixture,
            ) {
                Ok(fence) => fence,
                Err(error) if error.reason_code == "local_confirmation_rejected" => {
                    return Ok(Some(
                        json!({ "outcome": { "outcome": "selected", "optionId": "reject-once" } }),
                    ));
                }
                Err(error) => return Err(error),
            };
            let journal = self
                .journal
                .as_ref()
                .ok_or_else(|| RuntimeError::fail_closed("journal_missing"))?;
            journal.fence_local_confirmation(
                &fence.approval_ref,
                &fence.confirmation_ref,
                &serde_json::to_value(&fence.request_digest)
                    .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?,
                &fence.confirmed_at,
            )?;
            decision.local_confirmation_ref = Some(fence.confirmation_ref);
        }
        Ok(Some(self.apply_authority_decision(decision)?))
    }

    fn complete_from_acp_done(
        &mut self,
        offer: &RuntimeOffer,
        session_id: &str,
        prompted: &Value,
    ) -> RuntimeResult<Value> {
        let evidence = self.runtime_observed_evidence(offer, prompted)?;
        match self.post_terminal(offer, "completed", None, Some(evidence)) {
            Ok(_) => {}
            Err(error) => {
                let _ = self.post_terminal(offer, "unknown_outcome", Some(&error.reason_code), None);
                return Ok(json!({
                    "state": "unknown_outcome",
                    "queryFirst": true,
                    "terminal": "unknown_outcome",
                    "sessionId": session_id,
                    "stopReason": prompted.get("stopReason"),
                }));
            }
        }
        let receipt = self
            .channel
            .get(&format!("/receipts/{}", offer.action_ref), &[])
            .map_err(|_| RuntimeError::unavailable("receipt_readback_unavailable"))?;
        if receipt_is_completed(&receipt) {
            self.mark_state(offer, "completed")?;
            self.in_flight_claims = self.in_flight_claims.saturating_sub(1);
            return Ok(json!({
                "state": "completed",
                "queryFirst": true,
                "terminal": "completed",
                "sessionId": session_id,
                "stopReason": prompted.get("stopReason"),
                "receipt": receipt,
            }));
        }
        Ok(json!({
            "state": "running",
            "queryFirst": true,
            "terminal": "unknown_outcome",
            "sessionId": session_id,
            "stopReason": prompted.get("stopReason"),
        }))
    }

    fn runtime_observed_evidence(
        &self,
        offer: &RuntimeOffer,
        prompted: &Value,
    ) -> RuntimeResult<Value> {
        let verified = self
            .verified
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let updates = self
            .process
            .as_ref()
            .map(|item| item.last_prompt_updates().to_vec())
            .unwrap_or_default();
        let observed_at = now_iso();
        let started_at = self
            .offer_started_at(offer)
            .unwrap_or_else(|| offer.issued_at.clone());
        let digest = jcs_digest(&json!({
            "adapterSessionRef": offer.adapter_session_ref,
            "instructionRef": offer.instruction_ref,
            "processGeneration": self.process_generation,
            "promptResult": prompted,
            "sessionUpdates": updates,
        }))?;
        Ok(json!({
            "type": "developer_adapter_terminal_evidence",
            "id": format!("evidence-{}", offer.idempotency_key),
            "version": 1,
            "digest": digest,
            "assertionClass": "runtime_observed",
            "provenance": {
                "runtimeRef": verified.binding.runtime_ref,
                "deviceRef": verified.binding.device_ref,
                "observedAt": observed_at,
                "issuer": format!("runtime:{}", verified.binding.runtime_ref.id)
            },
            "startedAt": started_at,
            "completedAt": observed_at
        }))
    }

    fn offer_started_at(&self, offer: &RuntimeOffer) -> Option<String> {
        let verified = self.verified.as_ref()?;
        let journal = self.journal.as_ref()?;
        journal
            .get_by_idempotency(
                &verified.binding.shell_binding_ref,
                &offer.adapter_session_ref,
                &offer.idempotency_key,
            )
            .ok()
            .flatten()
            .and_then(|row| {
                row.refs_json
                    .get("startedAt")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
    }

    fn post_terminal(
        &mut self,
        offer: &RuntimeOffer,
        status: &str,
        failure_code: Option<&str>,
        evidence: Option<Value>,
    ) -> RuntimeResult<Value> {
        let verified = self
            .verified
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let started_at = self
            .offer_started_at(offer)
            .unwrap_or_else(|| offer.issued_at.clone());
        let mut body = json!({
            "instructionRef": offer.instruction_ref,
            "deviceRef": verified.binding.device_ref,
            "runtimeRef": verified.binding.runtime_ref,
            "expectedInstructionVersion": offer.instruction_version,
            "status": status,
            "requestDigest": offer.request_digest,
            "shellCommandJournalRef": {
                "type": "shell_command_journal_entry",
                "id": offer.idempotency_key,
                "version": 1
            },
            "bindingVersion": verified.binding.binding_version,
            "startedAt": started_at,
            "claimantRef": verified.binding.device_ref,
        });
        if status == "completed" {
            let evidence = evidence
                .ok_or_else(|| RuntimeError::fail_closed("terminal_evidence_missing"))?;
            body["adapterTerminalEvidenceRef"] = evidence;
            body["completedAt"] = json!(now_iso());
        } else {
            if let Some(code) = failure_code {
                body["failureCode"] = json!(code);
            }
            body["reconciliationRef"] = json!({
                "type": "reconciliation",
                "id": format!("recon-{}", offer.idempotency_key),
                "version": 1
            });
        }
        let posted = self.channel.post(
            "/terminal",
            body,
            &format!("term-{}-{}", status, offer.idempotency_key),
        )?;
        validate_terminal_readback(&posted, status)?;
        let journal_state = match status {
            "completed" => "completed",
            "rejected" => "rejected",
            "cancelled" => "cancelled",
            "failed" => "failed",
            _ => "unknown_outcome",
        };
        if status != "completed" {
            let _ = self.mark_state(offer, journal_state);
        }
        Ok(posted)
    }

    pub fn drive_once(&mut self) -> RuntimeResult<()> {
        self.require_verified()?;
        self.heartbeat()?;
        self.recover_query_first()?;
        self.restore_pending_from_journal();
        if let Err(error) = self.reconcile_running_receipts() {
            self.last_loop_error = Some(error.reason_code.clone());
            return Err(error);
        }
        if let Err(error) = self.poll_pending_approvals() {
            self.last_loop_error = Some(error.reason_code.clone());
            return Err(error);
        }
        if let Err(error) = self.drive_session_operations() {
            self.last_loop_error = Some(error.reason_code.clone());
            return Err(error);
        }
        if self.in_flight_claims >= MAX_CLAIM_IN_FLIGHT {
            return Ok(());
        }
        let verified = self.verified.as_ref().expect("verified");
        let offers = self.channel.get(
            "/offers",
            &[
                ("deviceRef", verified.binding.device_ref.as_str()),
                ("runtimeId", verified.binding.runtime_ref.id.as_str()),
            ],
        )?;
        self.last_loop_error = None;
        crate::developer_runtime::runtime_loop::drive_offers(
            self,
            crate::developer_runtime::runtime_loop::offers_from_list(&offers),
        )
    }

    pub fn trust_selected_workspace(&mut self) -> RuntimeResult<Value> {
        self.require_verified()?;
        let verified = self.verified.clone().expect("verified");
        let path = crate::developer_runtime::workspace_trust::trust_selected(
            &verified,
            &mut self.path_map,
        )?;
        self.persist_path_map()?;
        Ok(json!({
            "workspaceRef": verified.binding.workspace_ref,
            "trusted": true,
            "digest": crate::developer_runtime::workspace_trust::path_digest(&path)?,
        }))
    }

    pub fn trust_workspace_path(&mut self, path: PathBuf) -> RuntimeResult<Value> {
        self.require_verified()?;
        let verified = self.verified.clone().expect("verified");
        let trusted = crate::developer_runtime::workspace_trust::trust_dialog_path(
            path,
            &verified,
            &mut self.path_map,
        )?;
        self.persist_path_map()?;
        Ok(json!({
            "workspaceRef": verified.binding.workspace_ref,
            "trusted": true,
            "digest": crate::developer_runtime::workspace_trust::path_digest(&trusted)?,
        }))
    }

    fn persist_path_map(&self) -> RuntimeResult<()> {
        let Some(journal) = &self.journal else {
            return Ok(());
        };
        let entries: HashMap<String, String> = self
            .path_map
            .iter()
            .map(|(key, path)| (key.clone(), path.to_string_lossy().into_owned()))
            .collect();
        journal.replace_blob(
            "workspace-path-map",
            "workspace_map",
            serde_json::to_vec(&json!({
                "entries": entries,
                "generation": self.process_generation
            }))
            .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?
            .as_slice(),
            "2099-08-22T12:00:00.000Z",
        )
    }

    fn persist_session_map(&self) -> RuntimeResult<()> {
        let Some(journal) = &self.journal else {
            return Ok(());
        };
        journal.replace_blob(
            "session-map",
            "session_map",
            serde_json::to_vec(&self.session_map)
                .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?
                .as_slice(),
            "2099-08-22T12:00:00.000Z",
        )
    }

    fn restore_persisted_maps(&mut self) {
        let Some(journal) = &self.journal else {
            return;
        };
        if let Ok(bytes) = journal.get_blob("workspace-path-map", &now_iso()) {
            if let Ok(value) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(entries) = value.get("entries").and_then(Value::as_object) {
                    for (key, path) in entries {
                        if let Some(text) = path.as_str() {
                            self.path_map.insert(key.clone(), PathBuf::from(text));
                        }
                    }
                }
            }
        }
        if let Ok(bytes) = journal.get_blob("session-map", &now_iso()) {
            if let Ok(map) = serde_json::from_slice::<HashMap<String, MappedSession>>(&bytes) {
                self.session_map = map;
            }
        }
    }

    pub fn drive_session_operations(&mut self) -> RuntimeResult<()> {
        let verified = self.verified.clone().expect("verified");
        let raw = match self.channel.get(
            "/session-operations",
            &[
                ("deviceRef", verified.binding.device_ref.as_str()),
                ("runtimeId", verified.binding.runtime_ref.id.as_str()),
            ],
        ) {
            Ok(value) => value,
            Err(_) => self
                .channel
                .get(
                    &format!("/machines/{}/sessions", verified.binding.machine_ref),
                    &[],
                )
                .unwrap_or(json!({ "items": [] })),
        };
        let items = raw
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for item in items {
            if let Ok(Some(operation)) = parse_session_operation(&item) {
                self.claim_session_operation(operation)?;
            }
        }
        Ok(())
    }

    pub fn claim_session_operation(&mut self, operation: SessionOperation) -> RuntimeResult<Value> {
        if let Some(mapped) = self.session_map.get(&operation.session_ref) {
            if mapped.process_generation == self.process_generation {
                return Ok(json!({ "state": "ready", "reused": true }));
            }
            return Err(RuntimeError::unavailable("session_resume_unverified"));
        }
        let verified = self.verified.clone().expect("verified");
        let claimed = self.channel.post(
            "/session-operations/claims",
            session_operation_claim_body(&verified, &operation),
            &format!("sop-{}", operation.operation_ref),
        )?;
        validate_session_operation_claim(&claimed, &operation, &verified.binding.device_ref)?;
        let cwd = crate::developer_runtime::workspace_trust::resolve_cwd(&verified, &self.path_map)?;
        self.ensure_process_initialized()?;
        let created = self
            .process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_cli_unavailable"))?
            .session_new(&cwd.to_string_lossy())?;
        let session_id = created
            .get("sessionId")
            .and_then(Value::as_str)
            .filter(|value| !value.starts_with("adp_") && *value != "pending")
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?
            .to_string();
        let ready_body = json!({
            "sessionRef": operation.session_ref,
            "operationRef": operation.operation_ref,
            "adapterSessionRef": session_id,
            "deviceRef": verified.binding.device_ref,
            "runtimeRef": verified.binding.runtime_ref,
            "expectedSessionVersion": operation.session_version,
            "adapterManifestRef": operation.adapter_manifest_ref,
            "adapterManifestVersion": operation.adapter_manifest_version,
            "capabilityValidUntil": heartbeat_valid_until(&now_iso()),
            "shellBindingRef": {
                "type": "shell_session_binding",
                "id": verified.binding.shell_binding_ref,
                "version": verified.binding.shell_binding_version
            }
        });
        let ready = self.channel.post(
            "/sessions/ready",
            ready_body,
            &format!("ready-{}", operation.operation_ref),
        )?;
        validate_session_ready(&ready, &operation, &session_id)?;
        self.session_map.insert(
            operation.session_ref.clone(),
            MappedSession {
                session_ref: operation.session_ref,
                adapter_session_ref: session_id.clone(),
                process_generation: self.process_generation,
            },
        );
        self.acp_session_id = Some(session_id);
        let _ = self.persist_session_map();
        Ok(ready)
    }

    fn persist_pending_approval(&self, offer: &RuntimeOffer) -> RuntimeResult<()> {
        let verified = self
            .verified
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let journal = self
            .journal
            .as_ref()
            .ok_or_else(|| RuntimeError::fail_closed("journal_missing"))?;
        let row = journal
            .get_by_idempotency(
                &verified.binding.shell_binding_ref,
                &offer.adapter_session_ref,
                &offer.idempotency_key,
            )?
            .ok_or_else(|| RuntimeError::unavailable("journal_record_missing"))?;
        let mut refs = row.refs_json;
        if let Some(pending) = &self.pending_vendor {
            refs["pendingApproval"] = serde_json::to_value(pending)
                .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
        }
        if let Some(request) = &self.pending_approval {
            refs["approvalRequest"] = request.clone();
        }
        refs["offer"] = serde_json::to_value(offer)
            .map_err(|_| RuntimeError::fail_closed("unknown_schema"))?;
        journal.transition_cas(
            &row.binding_ref,
            &row.adapter_session_ref,
            &row.idempotency_key,
            &row.state,
            row.sequence,
            "awaiting_approval",
            refs,
            row.sequence + 1,
        )
    }

    fn restore_pending_from_journal(&mut self) {
        if self.pending_vendor.is_some() {
            return;
        }
        let Some(verified) = &self.verified else {
            return;
        };
        let Some(journal) = &self.journal else {
            return;
        };
        let Ok(rows) = journal.by_state(&verified.binding.shell_binding_ref, "awaiting_approval") else {
            return;
        };
        let Some(row) = rows.into_iter().next() else {
            return;
        };
        if let Some(pending) = row.refs_json.get("pendingApproval").cloned() {
            self.pending_vendor = serde_json::from_value(pending).ok();
        }
        if let Some(request) = row.refs_json.get("approvalRequest").cloned() {
            self.pending_approval = Some(request);
        }
        if let Ok(rows) = journal.in_flight(&verified.binding.shell_binding_ref) {
            self.in_flight_claims = rows
                .iter()
                .filter(|row| {
                    matches!(
                        row.state.as_str(),
                        "claimed" | "awaiting_approval" | "running"
                    )
                })
                .count();
        }
    }

    fn offer_from_journal(&self, instruction_ref: &str) -> Option<RuntimeOffer> {
        let verified = self.verified.as_ref()?;
        let journal = self.journal.as_ref()?;
        let rows = journal.in_flight(&verified.binding.shell_binding_ref).ok()?;
        rows.into_iter().find_map(|row| {
            if row.instruction_ref.as_deref() != Some(instruction_ref) {
                return None;
            }
            row.refs_json
                .get("offer")
                .cloned()
                .and_then(|value| serde_json::from_value(value).ok())
        })
    }

    fn reconcile_running_receipts(&mut self) -> RuntimeResult<()> {
        let Some(verified) = self.verified.clone() else {
            return Ok(());
        };
        let Some(journal) = &self.journal else {
            return Ok(());
        };
        let rows = journal.in_flight(&verified.binding.shell_binding_ref)?;
        for row in rows {
            if row.state != "running" {
                continue;
            }
            let Some(action_ref) = row.refs_json.get("actionRef").and_then(Value::as_str) else {
                continue;
            };
            let receipt = self.channel.get(&format!("/receipts/{action_ref}"), &[])?;
            let next = if receipt_is_completed(&receipt) {
                "completed"
            } else if receipt.get("completed") == Some(&json!(false))
                && receipt.pointer("/layers/execution/state").and_then(Value::as_str)
                    == Some("failed")
            {
                "failed"
            } else if receipt.get("cancelled") == Some(&json!(true))
                || receipt.pointer("/layers/execution/state").and_then(Value::as_str)
                    == Some("cancelled")
            {
                "cancelled"
            } else {
                continue;
            };
            journal.transition_cas(
                &row.binding_ref,
                &row.adapter_session_ref,
                &row.idempotency_key,
                &row.state,
                row.sequence,
                next,
                row.refs_json,
                row.sequence + 1,
            )?;
            if next != "running" {
                self.in_flight_claims = self.in_flight_claims.saturating_sub(1);
            }
        }
        Ok(())
    }

    fn poll_pending_approvals(&mut self) -> RuntimeResult<()> {
        self.restore_pending_from_journal();
        let Some(pending) = self.pending_vendor.clone() else {
            return Ok(());
        };
        let request = self.pending_approval.clone().unwrap_or_else(|| {
            json!({
                "approvalRef": pending.approval_ref,
                "requestDigest": pending.request_digest
            })
        });
        if now_iso() >= pending.expires_at {
            self.finish_pending_approval(
                &pending,
                json!({ "outcome": { "outcome": "cancelled" } }),
                false,
            )?;
            return Ok(());
        }
        let Some(result) = self.poll_authority_once(&request)? else {
            return Ok(());
        };
        let approved = result
            .pointer("/outcome/optionId")
            .and_then(Value::as_str)
            == Some("allow-once");
        self.finish_pending_approval(&pending, result, approved)
    }

    fn finish_pending_approval(
        &mut self,
        pending: &PendingApproval,
        result: Value,
        resume_prompt: bool,
    ) -> RuntimeResult<()> {
        if let Some(process) = self.process.as_mut() {
            let _ = process.respond_request(&pending.rpc_id, result.clone());
        }
        let offer = self.offer_from_journal(&pending.instruction_ref);
        self.pending_vendor = None;
        let can_resume = self
            .process
            .as_ref()
            .map(CursorAcpProcessHost::has_pending_prompt)
            .unwrap_or(false);
        if resume_prompt && can_resume {
            if let Some(offer) = offer {
                let mapped = self
                    .mapped_adapter_session(&offer.session_ref)
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| offer.adapter_session_ref.clone());
                self.drive_active_prompt(&offer, &mapped)?;
            }
            return Ok(());
        }
        if let Some(offer) = offer {
            let expired = now_iso() >= pending.expires_at;
            let status = if resume_prompt {
                "unknown_outcome"
            } else if expired {
                "cancelled"
            } else {
                "rejected"
            };
            let reason = if resume_prompt {
                "session_resume_unverified"
            } else if expired {
                "authority_expired"
            } else {
                "authority_rejected"
            };
            self.post_terminal(&offer, status, Some(reason), None)?;
            self.in_flight_claims = self.in_flight_claims.saturating_sub(1);
        }
        Ok(())
    }

    fn post_unknown_terminal(&mut self, offer: &RuntimeOffer, reason: &str) -> RuntimeResult<()> {
        self.post_terminal(offer, "unknown_outcome", Some(reason), None)?;
        Ok(())
    }

    fn mark_unknown_outcome(&self, offer: &RuntimeOffer, reason: &str) -> RuntimeResult<()> {
        if let (Some(verified), Some(journal)) = (&self.verified, &self.journal) {
            if let Ok(Some(row)) = journal.get_by_idempotency(
                &verified.binding.shell_binding_ref,
                &offer.adapter_session_ref,
                &offer.idempotency_key,
            ) {
                let _ = journal.transition_cas(
                    &row.binding_ref,
                    &row.adapter_session_ref,
                    &row.idempotency_key,
                    &row.state,
                    row.sequence,
                    "unknown_outcome",
                    json!({ "instructionRef": offer.instruction_ref, "reasonCode": reason }),
                    row.sequence + 1,
                );
            }
        }
        Ok(())
    }

    fn mark_state(&self, offer: &RuntimeOffer, state: &str) -> RuntimeResult<()> {
        let verified = self
            .verified
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let journal = self
            .journal
            .as_ref()
            .ok_or_else(|| RuntimeError::fail_closed("journal_missing"))?;
        let row = journal
            .get_by_idempotency(
                &verified.binding.shell_binding_ref,
                &offer.adapter_session_ref,
                &offer.idempotency_key,
            )?
            .ok_or_else(|| RuntimeError::unavailable("journal_record_missing"))?;
        journal.transition_cas(
            &row.binding_ref,
            &row.adapter_session_ref,
            &row.idempotency_key,
            &row.state,
            row.sequence,
            state,
            row.refs_json,
            row.sequence + 1,
        )
    }

    pub fn query(&self, instruction_ref: &str) -> RuntimeResult<Value> {
        let verified = self
            .verified
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let journal = self
            .journal
            .as_ref()
            .ok_or_else(|| RuntimeError::unavailable("journal_missing"))?;
        let inflight = journal.in_flight(&verified.binding.shell_binding_ref)?;
        let match_row = inflight
            .into_iter()
            .find(|row| row.instruction_ref.as_deref() == Some(instruction_ref));
        Ok(json!({
            "instructionRef": instruction_ref,
            "queryFirst": true,
            "replayAllowed": false,
            "terminalQuery": "unsupported",
            "record": match_row,
        }))
    }

    pub fn events(&self, instruction_ref: &str) -> RuntimeResult<Value> {
        self.query(instruction_ref)
    }

    pub fn terminal(&self, instruction_ref: &str) -> RuntimeResult<Value> {
        let queried = self.query(instruction_ref)?;
        Ok(json!({
            "instructionRef": instruction_ref,
            "status": "unknown_outcome",
            "queryOnly": true,
            "replayAllowed": false,
            "journal": queried,
        }))
    }

    pub fn cancel(&mut self, instruction_ref: &str) -> RuntimeResult<Value> {
        if self.verified.is_none() || self.journal.is_none() {
            self.kill_process();
            return Err(RuntimeError::unavailable("binding_bootstrap_unavailable"));
        }
        let verified = self.verified.clone().expect("verified");
        if let Some(process) = self.process.as_mut() {
            if let Some(session_id) = self.acp_session_id.clone() {
                let _ = process.cancel_session(&session_id);
            } else {
                self.kill_process();
            }
        }
        let journal_row = self.journal.as_ref().and_then(|journal| {
            journal
                .in_flight(&verified.binding.shell_binding_ref)
                .ok()
                .and_then(|rows| {
                    rows.into_iter()
                        .find(|row| row.instruction_ref.as_deref() == Some(instruction_ref))
                })
        });
        let Some(journal_row) = journal_row else {
            return Ok(json!({
                "cancelled": false,
                "queryOnly": true,
                "queryFirst": true,
                "terminal": "unknown_outcome",
                "instructionRef": instruction_ref,
            }));
        };
        let expected_version = journal_row
            .refs_json
            .get("expectedInstructionVersion")
            .or_else(|| journal_row.refs_json.get("instructionVersion"))
            .and_then(Value::as_u64)
            .unwrap_or(1);
        let request_digest = journal_row
            .refs_json
            .get("requestDigest")
            .cloned()
            .ok_or_else(|| RuntimeError::fail_closed("unknown_schema"))?;
        let posted = self.channel.post(
            &format!("/instructions/{instruction_ref}/cancel"),
            json!({
                "expectedVersion": expected_version,
                "requestDigest": request_digest,
                "idempotencyKey": format!("cancel-{instruction_ref}-{expected_version}"),
                "deviceRef": verified.binding.device_ref,
                "runtimeRef": verified.binding.runtime_ref
            }),
            &format!("cancel-{instruction_ref}-{expected_version}"),
        );
        match posted {
            Ok(data)
                if data.get("state") == Some(&json!("cancelled"))
                    || data.get("status") == Some(&json!("cancelled")) =>
            {
                if let Some(offer) = self.offer_from_journal(instruction_ref) {
                    let _ = self.mark_state(&offer, "cancelled");
                    self.in_flight_claims = self.in_flight_claims.saturating_sub(1);
                }
                Ok(json!({
                    "cancelled": true,
                    "queryOnly": true,
                    "queryFirst": true,
                    "instructionRef": instruction_ref,
                    "readBack": data,
                }))
            }
            Ok(data) => {
                if let Some(offer) = self.offer_from_journal(instruction_ref) {
                    let _ = self.post_unknown_terminal(&offer, "cancel_readback_rejected");
                }
                Ok(json!({
                    "cancelled": false,
                    "queryOnly": true,
                    "queryFirst": true,
                    "terminal": "unknown_outcome",
                    "instructionRef": instruction_ref,
                    "readBack": data,
                }))
            }
            Err(_) => {
                if let Some(offer) = self.offer_from_journal(instruction_ref) {
                    let _ = self.mark_state(&offer, "unknown_outcome");
                }
                Ok(json!({
                    "cancelled": false,
                    "queryOnly": true,
                    "queryFirst": true,
                    "terminal": "unknown_outcome",
                    "instructionRef": instruction_ref,
                }))
            }
        }
    }

    pub fn project_permission(&mut self, raw: Value) -> RuntimeResult<Value> {
        self.require_verified()?;
        let request = project_permission_request(&raw)?;
        if let Some(journal) = &self.journal {
            if let Some(approval_ref) = request.get("approvalRef").and_then(Value::as_str) {
                if let Some(digest) = request.get("requestDigest") {
                    journal.record_approval_request(approval_ref, digest)?;
                }
            }
        }
        self.pending_approval = Some(request.clone());
        Ok(request)
    }

    pub fn apply_authority_decision(&mut self, decision: AuthorityDecision) -> RuntimeResult<Value> {
        self.require_verified()?;
        let verified = self.verified.as_ref().expect("verified");
        self.policy.validate_binding(&verified.binding, &now_iso())?;
        let request = self
            .pending_approval
            .clone()
            .ok_or_else(|| RuntimeError::fail_closed("approval_not_pending"))?;
        let journal = self
            .journal
            .as_ref()
            .ok_or_else(|| RuntimeError::fail_closed("journal_missing"))?;
        vendor_allow_once(journal, &request, &decision, true)
    }

    pub fn adapter_initialize(&mut self) -> RuntimeResult<Value> {
        self.require_verified()?;
        self.try_start_process()?;
        self.process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_cli_unavailable"))?
            .initialize()
    }

    pub fn adapter_authenticate(&mut self) -> RuntimeResult<Value> {
        self.require_verified()?;
        self.process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_process_not_started"))?
            .authenticate()
    }

    pub fn adapter_list_sessions(&mut self) -> RuntimeResult<Value> {
        self.require_verified()?;
        self.process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_process_not_started"))?
            .list_sessions()
    }

    pub fn adapter_create_session(&mut self) -> RuntimeResult<Value> {
        self.require_verified()?;
        let workspace = self
            .verified
            .as_ref()
            .map(|item| item.binding.workspace_ref.clone())
            .ok_or_else(|| RuntimeError::unavailable("binding_missing"))?;
        let created = self
            .process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_process_not_started"))?
            .session_new(&workspace)?;
        self.acp_session_id = created
            .get("sessionId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        Ok(created)
    }

    pub fn adapter_prompt(&mut self, instruction_ref: &str) -> RuntimeResult<Value> {
        self.require_verified()?;
        let session_id = self
            .acp_session_id
            .clone()
            .ok_or_else(|| RuntimeError::unavailable("acp_session_missing"))?;
        self.process
            .as_mut()
            .ok_or_else(|| RuntimeError::unavailable("vendor_process_not_started"))?
            .prompt(&session_id, instruction_ref)
    }

    pub fn probe_vendor(&self) -> VendorProbe {
        probe_vendor_cli(&self.command_lock, &self.policy)
    }

    pub fn smoke_vendor(&self) -> VendorProbe {
        smoke_vendor_process(&self.command_lock, &self.policy)
    }

    pub fn try_start_process(&mut self) -> RuntimeResult<()> {
        self.require_verified()?;
        if self.process.is_some() {
            return Ok(());
        }
        let previous = self.process_generation;
        #[cfg(test)]
        {
            if self.scripted_acp || std::env::var("DEVELOPER_RUNTIME_SCRIPTED_ACP").as_deref() == Ok("1") {
                self.process = Some(CursorAcpProcessHost::attach_scripted(
                    crate::developer_runtime::process::ScriptedAgent {
                        request_permission: false,
                        hang: false,
                        wrong_id: false,
                    },
                ));
                self.vendor_process_started = true;
                self.process_generation = self.next_process_generation(previous);
                self.adopt_session_map(previous);
                return Ok(());
            }
        }
        match CursorAcpProcessHost::spawn(self.command_lock.clone(), &self.policy) {
            Ok(host) => {
                self.process = Some(host);
                self.vendor_process_started = true;
                self.process_generation = self.next_process_generation(previous);
                self.process_initialized = false;
                self.adopt_session_map(previous);
                Ok(())
            }
            Err(error) => Err(error),
        }
    }

    fn next_process_generation(&self, previous: u64) -> u64 {
        let persisted_max = self
            .session_map
            .values()
            .map(|item| item.process_generation)
            .max()
            .unwrap_or(0);
        if previous == 0 && persisted_max == 0 {
            1
        } else {
            previous.max(persisted_max) + 1
        }
    }

    fn adopt_session_map(&mut self, previous: u64) {
        if previous != 0 {
            return;
        }
        let current = self.process_generation;
        for mapped in self.session_map.values_mut() {
            if mapped.process_generation == 0 {
                mapped.process_generation = current;
            }
        }
    }

    pub fn query_inflight(&self) -> RuntimeResult<Vec<JournalRecord>> {
        let Some(verified) = &self.verified else {
            return Ok(Vec::new());
        };
        let Some(journal) = &self.journal else {
            return Ok(Vec::new());
        };
        journal.in_flight(&verified.binding.shell_binding_ref)
    }

    pub fn recover_query_first(&mut self) -> RuntimeResult<Value> {
        let rows = self.query_inflight()?;
        let mut backend = Vec::new();
        if let Some(verified) = &self.verified {
            for row in &rows {
                let Some(instruction_ref) = row.instruction_ref.as_deref() else {
                    continue;
                };
                backend.push(self.channel.get(
                    "/query",
                    &[
                        ("instructionRef", instruction_ref),
                        ("deviceRef", verified.binding.device_ref.as_str()),
                        ("runtimeId", verified.binding.runtime_ref.id.as_str()),
                    ],
                )?);
            }
        }
        Ok(json!({
            "queryFirst": true,
            "replayAllowed": false,
            "inFlight": rows.len(),
            "records": rows,
            "backend": backend,
        }))
    }

    pub fn accept_handoff(
        &mut self,
        handoff_ref: &str,
        expected_version: u64,
        handoff_digest: crate::developer_runtime::types::DigestRef,
        consumer_session_ref: &str,
    ) -> RuntimeResult<Value> {
        self.require_verified()?;
        let verified = self.verified.as_ref().expect("verified");
        self.channel.post(
            &format!("/handoffs/{handoff_ref}/accept"),
            json!({
                "expectedVersion": expected_version,
                "handoffDigest": handoff_digest,
                "targetRuntimeId": verified.binding.runtime_ref.id,
                "targetDeviceId": verified.binding.device_ref,
                "bindingVersion": verified.binding.binding_version,
                "consumerSessionRef": consumer_session_ref
            }),
            &format!("handoff-{handoff_ref}-{expected_version}"),
        )
    }

    pub fn presentation(&self, result: RuntimeResult<Value>) -> RuntimePresentation {
        let operational = self.is_operational();
        match result {
            Ok(payload) => RuntimePresentation::ok(
                operational,
                self.vendor_process_started,
                presentation_strip(payload),
            ),
            Err(error)
                if error.outcome == crate::developer_runtime::error::RuntimeOutcome::Unavailable =>
            {
                RuntimePresentation::unavailable(&error.reason_code, operational)
            }
            Err(error) => RuntimePresentation::fail_closed(&error.reason_code, operational),
        }
    }

    pub fn status_payload(&self) -> Value {
        json!({
            "enabled": self.is_operational(),
            "optedIn": self.opted_in || crate::developer_runtime::types::runtime_opt_in(),
            "operational": self.is_operational(),
            "revoked": self.revoked,
            "bound": self.verified.is_some(),
            "vendorProcessStarted": self.vendor_process_started,
            "sessionResume": "planned",
            "terminalQuery": "unsupported",
            "productionCertification": false,
            "heartbeat": self.last_heartbeat,
            "deviceId": self.verified.as_ref().map(|item| item.binding.device_ref.clone()),
            "bindingId": self.verified.as_ref().map(|item| item.binding.shell_binding_ref.clone()),
            "bindingVersion": self.verified.as_ref().map(|item| item.binding_version),
            "credentialRef": self.verified.as_ref().map(|item| item.authentication_ref.clone()),
        })
    }

    #[cfg(test)]
    pub fn map_workspace(&mut self, workspace_ref: &str, path: PathBuf) {
        self.path_map.insert(workspace_ref.to_string(), path);
    }

    #[cfg(test)]
    pub fn map_session(&mut self, session_ref: &str, adapter_session_ref: &str) {
        self.session_map.insert(
            session_ref.to_string(),
            MappedSession {
                session_ref: session_ref.to_string(),
                adapter_session_ref: adapter_session_ref.to_string(),
                process_generation: self.process_generation,
            },
        );
        self.acp_session_id = Some(adapter_session_ref.to_string());
    }

    #[cfg(test)]
    pub fn prompt_calls(&self) -> u32 {
        self.prompt_calls
    }

    #[cfg(test)]
    pub fn session_new_count(&self) -> u32 {
        self.process
            .as_ref()
            .map(|item| item.session_new_count)
            .unwrap_or(0)
    }

    fn require_verified(&self) -> RuntimeResult<()> {
        if self.revoked {
            return Err(RuntimeError::unavailable("runtime_revoked"));
        }
        if !self.enabled {
            return Err(RuntimeError::unavailable("runtime_default_off"));
        }
        if self.verified.is_none() {
            return Err(RuntimeError::unavailable("binding_bootstrap_unavailable"));
        }
        Ok(())
    }

    fn kill_process(&mut self) {
        self.process = None;
        self.vendor_process_started = false;
        self.acp_session_id = None;
        self.process_initialized = false;
        self.process_generation += 1;
        self.pending_vendor = None;
    }

    #[cfg(test)]
    pub fn attach_scripted_process(&mut self) {
        let previous = self.process_generation;
        self.process = Some(CursorAcpProcessHost::attach_scripted(
            crate::developer_runtime::process::ScriptedAgent {
                request_permission: false,
                hang: false,
                wrong_id: false,
            },
        ));
        self.vendor_process_started = true;
        self.process_generation = self.next_process_generation(previous);
        self.adopt_session_map(previous);
    }

    #[cfg(test)]
    pub fn attach_scripted_permission_process(&mut self) {
        let previous = self.process_generation;
        self.process = Some(CursorAcpProcessHost::attach_scripted(
            crate::developer_runtime::process::ScriptedAgent::default(),
        ));
        self.vendor_process_started = true;
        self.process_generation = self.next_process_generation(previous);
        self.adopt_session_map(previous);
    }

    #[cfg(test)]
    pub fn has_pending_vendor(&self) -> bool {
        self.pending_vendor.is_some()
    }

    #[cfg(test)]
    pub fn pending_approval_request(&self) -> Option<Value> {
        self.pending_approval.clone()
    }

    #[cfg(test)]
    pub fn clear_memory_pending_for_test(&mut self) {
        self.pending_vendor = None;
        self.pending_approval = None;
    }

    #[cfg(test)]
    pub fn restore_pending_for_test(&mut self) {
        self.restore_pending_from_journal();
    }

    #[cfg(test)]
    pub fn last_loop_error(&self) -> Option<&str> {
        self.last_loop_error.as_deref()
    }

    #[cfg(test)]
    pub fn set_l3_fixture(&mut self, value: Option<bool>) {
        self.l3_fixture = value;
    }

    #[cfg(test)]
    pub fn persist_maps_for_test(&self) -> RuntimeResult<()> {
        self.persist_session_map()?;
        self.persist_path_map()
    }

    #[cfg(test)]
    pub fn mapped_generation(&self, session_ref: &str) -> Option<u64> {
        self.session_map
            .get(session_ref)
            .map(|item| item.process_generation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::binding::{sign_projection, ScriptedBindingSource};
    use crate::developer_runtime::channel::{instruction_digest, RecordingChannel};
    use crate::developer_runtime::crypto::MemorySecureStore;
    use crate::developer_runtime::jcs::jcs_digest;
    use crate::developer_runtime::types::{
        ActiveBinding, DigestRef, RecordRef, AUDIENCE_DESKTOP_RUNTIME,
    };

    fn digest() -> DigestRef {
        DigestRef {
            algorithm: "sha-256".into(),
            canonicalization: "jcs/1".into(),
            value: "c".repeat(64),
        }
    }

    fn payload_ref(text: &str) -> crate::developer_runtime::types::EncryptedPayloadRef {
        crate::developer_runtime::types::EncryptedPayloadRef {
            kind: "encrypted_data_ref".into(),
            data_kind: "instruction".into(),
            data_ref: "data-instruction-1".into(),
            digest: DigestRef {
                algorithm: "sha-256".into(),
                canonicalization: "jcs/1".into(),
                value: crate::developer_runtime::crypto::sha256_hex(text.as_bytes()),
            },
            size_bytes: text.len() as u64,
            data_class: "owner_private".into(),
            encryption: "runtime_managed".into(),
            owner_scope: "authenticated_owner".into(),
            expires_at: "2099-08-22T12:00:00.000Z".into(),
        }
    }

    fn binding_for(path: &std::path::Path) -> ActiveBinding {
        ActiveBinding {
            owner_principal_ref: "principal-1".into(),
            agent_id: "agent-1".into(),
            device_ref: "device-1".into(),
            runtime_ref: RecordRef {
                kind: "runtime".into(),
                id: "runtime-1".into(),
                version: Some(1),
                digest: None,
            },
            machine_ref: "machine-1".into(),
            machine_version: 1,
            workspace_ref: "workspace-1".into(),
            workspace_digest: crate::developer_runtime::workspace_trust::path_digest(
                &path.to_path_buf(),
            )
            .unwrap(),
            workspace_trust: "trusted".into(),
            shell_binding_ref: "binding-1".into(),
            shell_binding_version: 1,
            nonce_domain: "developer-remote-workspace".into(),
            issued_at: "2026-08-22T12:00:00.000Z".into(),
            expires_at: "2099-08-22T12:00:00.000Z".into(),
            status: "active".into(),
            audience: AUDIENCE_DESKTOP_RUNTIME.into(),
            binding_version: 3,
            workspace_path: None,
        }
    }

    fn offer_for(binding: &ActiveBinding) -> RuntimeOffer {
        let mut offer = RuntimeOffer {
            instruction_ref: "instruction-1".into(),
            action_ref: "action-1".into(),
            adapter_session_ref: "adapter-session-1".into(),
            session_ref: "session-1".into(),
            session_version: 1,
            instruction_version: 4,
            workspace_ref: binding.workspace_ref.clone(),
            request_digest: digest(),
            issued_at: "2026-08-22T12:01:00.000Z".into(),
            expires_at: "2099-08-22T12:00:00.000Z".into(),
            nonce: "nonce-1".into(),
            nonce_domain: binding.nonce_domain.clone(),
            audience: binding.audience.clone(),
            binding_version: binding.binding_version,
            idempotency_key: "idem-1".into(),
            payload_ref: payload_ref("do the work"),
            adapter_manifest_ref: "cursor-acp-local-runtime-manifest-1".into(),
            adapter_manifest_version: 1,
        };
        offer.request_digest = instruction_digest(&offer).unwrap();
        offer
    }

    fn plaintext_data() -> Value {
        json!({
            "encoding": "plaintext_base64",
            "plaintextBase64": base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                "do the work",
            ),
            "sizeBytes": 11,
            "dataKind": "instruction",
            "deliveryRef": "dlev-1"
        })
    }

    fn completed_terminal() -> Value {
        json!({
            "contractType": "developer_terminal_result",
            "status": "completed"
        })
    }

    fn completed_receipt() -> Value {
        json!({
            "completed": true,
            "refs": { "actionReceiptRef": { "type": "action_receipt", "id": "ar-1" } },
            "layers": {
                "execution": { "state": "succeeded" },
                "outcome": { "outcomeRef": { "type": "outcome_record", "id": "out-1" } }
            }
        })
    }

    fn instruction_snapshot(offer: &RuntimeOffer, binding: &ActiveBinding) -> Value {
        json!({
            "schemaVersion": 1,
            "contractType": "developer_instruction",
            "instructionRef": offer.instruction_ref,
            "actionRef": offer.action_ref,
            "workspaceRef": offer.workspace_ref,
            "sessionRef": offer.session_ref,
            "deviceRef": binding.device_ref,
            "instructionSequence": offer.instruction_version,
            "shellBindingRef": { "type": "shell_session_binding", "id": binding.shell_binding_ref, "version": binding.shell_binding_version },
            "shellCommandJournalRef": { "type": "shell_command_journal_entry", "id": offer.idempotency_key, "version": 1 },
            "state": "claimed",
            "payloadRef": offer.payload_ref,
        })
    }

    fn test_host() -> (tempfile::TempDir, RuntimeHost, ActiveBinding) {
        let dir = tempfile::tempdir().unwrap();
        let bound = binding_for(dir.path());
        let store = MemorySecureStore::default();
        let mut source = ScriptedBindingSource::new();
        source.insert("bootstrap-1", sign_projection(&bound));
        let channel = RecordingChannel::new(TrustPolicy::default());
        let ops = channel.ops_handle();
        let offer = offer_for(&bound);
        channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
        channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
        channel.push_response(json!({ "success": true, "data": plaintext_data() }));
        channel.push_response(json!({ "success": true, "data": { "acked": true } }));
        channel.push_response(json!({ "success": true, "data": completed_terminal() }));
        channel.push_response(json!({ "success": true, "data": completed_receipt() }));
        let mut host = RuntimeHost::for_test(
            dir.path().join("j.sqlite"),
            store,
            Box::new(source),
            channel,
        )
        .unwrap();
        host.map_workspace("workspace-1", dir.path().to_path_buf());
        host.map_session("session-1", "acp-session-1");
        let _ = ops;
        (dir, host, bound)
    }

    fn test_host_with_ops() -> (
        tempfile::TempDir,
        RuntimeHost,
        ActiveBinding,
        std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    ) {
        let dir = tempfile::tempdir().unwrap();
        let bound = binding_for(dir.path());
        let store = MemorySecureStore::default();
        let mut source = ScriptedBindingSource::new();
        source.insert("bootstrap-1", sign_projection(&bound));
        let channel = RecordingChannel::new(TrustPolicy::default());
        let ops = channel.ops_handle();
        let offer = offer_for(&bound);
        channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
        channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
        channel.push_response(json!({ "success": true, "data": plaintext_data() }));
        channel.push_response(json!({ "success": true, "data": { "acked": true } }));
        channel.push_response(json!({ "success": true, "data": completed_terminal() }));
        channel.push_response(json!({ "success": true, "data": completed_receipt() }));
        let mut host = RuntimeHost::for_test(
            dir.path().join("j.sqlite"),
            store,
            Box::new(source),
            channel,
        )
        .unwrap();
        host.map_workspace("workspace-1", dir.path().to_path_buf());
        host.map_session("session-1", "acp-session-1");
        (dir, host, bound, ops)
    }

    #[test]
    fn default_off_rejects_claim() {
        let mut host = RuntimeHost::default_off();
        assert_eq!(
            host.claim_offer(json!({})).unwrap_err().code(),
            "runtime_default_off"
        );
    }

    #[test]
    fn bootstrap_then_claim_starts_process_or_unknown_outcome() {
        let (dir, mut host, bound) = test_host();
        host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
            .unwrap();
        host.heartbeat().unwrap();
        let payload = host
            .claim_offer(serde_json::to_value(offer_for(&bound)).unwrap())
            .unwrap();
        assert_eq!(payload["state"], "completed");
        assert_eq!(payload["queryFirst"], true);
        assert_eq!(payload["terminal"], "completed");
        host.revoke().unwrap();
        assert_eq!(
            host.claim_offer(serde_json::to_value(offer_for(&bound)).unwrap())
                .unwrap_err()
                .code(),
            "runtime_revoked"
        );
    }

    #[test]
    fn presentation_strips_secrets() {
        let host = RuntimeHost::default_off();
        let shown = host.presentation(Ok(json!({
            "providerToken": "secret",
            "instructionRef": "instruction-1"
        })));
        assert!(shown.payload.as_ref().unwrap().get("providerToken").is_none());
        assert!(!shown.production_certification);
    }

    #[test]
    fn vendor_smoke_is_typed() {
        let host = RuntimeHost::default_off();
        let probe = host.smoke_vendor();
        assert!(!probe.production_claim);
        assert!(
            probe.reason_code == "vendor_cli_unavailable"
                || probe.reason_code == "vendor_cli_present_unverified"
                || probe.reason_code == "vendor_process_smoke_unverified"
                || probe.reason_code == "vendor_process_spawn_failed"
                || probe.available
        );
    }

    #[test]
    fn missing_workspace_trust_fails_before_reserve() {
        let dir = tempfile::tempdir().unwrap();
        let bound = binding_for(dir.path());
        let store = MemorySecureStore::default();
        let mut source = ScriptedBindingSource::new();
        source.insert("bootstrap-1", sign_projection(&bound));
        let channel = RecordingChannel::new(TrustPolicy::default());
        let offer = offer_for(&bound);
        channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
        channel.push_response(json!({ "success": true, "data": instruction_snapshot(&offer, &bound) }));
        let mut host = RuntimeHost::for_test(
            dir.path().join("j.sqlite"),
            store,
            Box::new(source),
            channel,
        )
        .unwrap();
        host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
            .unwrap();
        host.heartbeat().unwrap();
        assert_eq!(
            host.claim_offer(serde_json::to_value(offer_for(&bound)).unwrap())
                .unwrap_err()
                .code(),
            "workspace_trust_missing"
        );
        assert!(host.query_inflight().unwrap().is_empty());
    }

    #[test]
    fn mismatched_claim_snapshot_does_not_reserve() {
        let dir = tempfile::tempdir().unwrap();
        let bound = binding_for(dir.path());
        let store = MemorySecureStore::default();
        let mut source = ScriptedBindingSource::new();
        source.insert("bootstrap-1", sign_projection(&bound));
        let channel = RecordingChannel::new(TrustPolicy::default());
        channel.push_response(json!({ "success": true, "data": { "machineRef": "machine-1", "projectionSequence": 2 } }));
        channel.push_response(json!({
            "success": true,
            "data": {
                "schemaVersion": 1,
                "contractType": "developer_instruction",
                "instructionRef": "other-instruction",
                "actionRef": "action-1",
                "workspaceRef": "workspace-1",
                "sessionRef": "session-1",
                "deviceRef": "device-1",
                "instructionSequence": 4,
                "shellBindingRef": { "id": "binding-1" },
                "shellCommandJournalRef": { "id": "idem-1" },
                "state": "claimed"
            }
        }));
        let mut host = RuntimeHost::for_test(
            dir.path().join("j.sqlite"),
            store,
            Box::new(source),
            channel,
        )
        .unwrap();
        host.map_workspace("workspace-1", dir.path().to_path_buf());
        host.map_session("session-1", "acp-session-1");
        host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
            .unwrap();
        host.heartbeat().unwrap();
        assert_eq!(
            host.claim_offer(serde_json::to_value(offer_for(&bound)).unwrap())
                .unwrap_err()
                .code(),
            "claim_snapshot_mismatch"
        );
        assert!(host.query_inflight().unwrap().is_empty());
    }

    #[test]
    fn recover_queries_backend_before_new_claims() {
        let (dir, mut host, _bound, ops) = test_host_with_ops();
        host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
            .unwrap();
        host.recover_query_first().unwrap();
        let recorded = ops.lock().unwrap().clone();
        assert!(!recorded.iter().any(|item| item.starts_with("GET /query")));
        assert!(!recorded.iter().any(|item| item.starts_with("POST /claims")));
    }

    #[test]
    fn webview_boolean_is_not_canonical() {
        let _ = jcs_digest(&json!({ "canonical": true })).unwrap();
        assert_eq!(
            RuntimeHost::default_off()
                .apply_authority_decision(AuthorityDecision {
                    decision_ref: String::new(),
                    approval_ref: "a".into(),
                    adapter_request_ref: "b".into(),
                    request_digest: digest(),
                    decision: "approved".into(),
                    grant_scope: Some("once".into()),
                    local_confirmation_ref: Some("local".into()),
                    decided_at: now_iso(),
                    authority_digest: digest(),
                    decision_digest: digest(),
                    authority_grant_ref: None,
                })
                .unwrap_err()
                .code(),
            "runtime_default_off"
        );
    }

    // ── Desktop D2: emergency stop ──────────────────────────────────────────

    #[test]
    fn emergency_stop_on_never_live_host_latches_without_keychain() {
        // default_off() carries the OS keyring store; none of these calls may
        // reach it (they would prompt for keychain access on macOS).
        let mut host = RuntimeHost::default_off();
        assert!(host.emergency_stop().unwrap().is_empty());
        assert_eq!(host.status_payload()["revoked"], true);
        assert!(!host.is_enabled());
        assert!(host.should_stop_loop());
        assert_eq!(
            host.instantiate_production_if(true).unwrap_err().code(),
            "runtime_revoked"
        );
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
                .unwrap_err()
                .code(),
            "runtime_revoked"
        );
    }

    #[test]
    fn emergency_stop_on_bound_host_revokes_and_stays_revoked() {
        let (dir, mut host, bound) = test_host();
        host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
            .unwrap();
        assert_eq!(host.status_payload()["bound"], true);
        host.emergency_stop().unwrap();
        let status = host.status_payload();
        assert_eq!(status["revoked"], true);
        assert_eq!(status["bound"], false);
        assert_eq!(status["operational"], false);
        assert!(status["bindingId"].is_null());
        assert!(host.should_stop_loop());
        for code in [
            host.bootstrap("bootstrap-1", dir.path().join("j.sqlite"))
                .unwrap_err()
                .code()
                .to_string(),
            host.refresh("bootstrap-1", dir.path().join("j.sqlite"))
                .unwrap_err()
                .code()
                .to_string(),
            host.trust_workspace_path(dir.path().to_path_buf())
                .unwrap_err()
                .code()
                .to_string(),
            host.claim_offer(serde_json::to_value(offer_for(&bound)).unwrap())
                .unwrap_err()
                .code()
                .to_string(),
            host.instantiate_production_if(true)
                .unwrap_err()
                .code()
                .to_string(),
        ] {
            assert_eq!(code, "runtime_revoked");
        }
    }
}
