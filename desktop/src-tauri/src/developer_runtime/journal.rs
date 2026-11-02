//! Encrypted SQLite journal: refs/digests/state only. Blobs are AEAD + TTL.

use crate::developer_runtime::crypto::{blob_aad, sha256_hex, JournalAead, SecureStore};
use crate::developer_runtime::error::{RuntimeError, RuntimeResult};
use crate::developer_runtime::policy::{assert_control_plane_safe, looks_like_absolute_path};
use crate::developer_runtime::types::{now_iso, JournalRecord};
use rusqlite::{params, Connection, ErrorCode, OptionalExtension};
use serde_json::Value;
use std::path::{Path, PathBuf};

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  binding_ref TEXT NOT NULL,
  adapter_session_ref TEXT NOT NULL,
  instruction_ref TEXT,
  idempotency_key TEXT NOT NULL,
  nonce_domain TEXT NOT NULL,
  nonce_digest TEXT NOT NULL,
  nonce_state TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  state TEXT NOT NULL,
  refs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(binding_ref, adapter_session_ref, idempotency_key),
  UNIQUE(binding_ref, nonce_domain, nonce_digest)
);
CREATE TABLE IF NOT EXISTS encrypted_blobs (
  data_ref TEXT PRIMARY KEY,
  data_kind TEXT NOT NULL,
  nonce BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  digest_hex TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approval_fences (
  approval_ref TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL,
  decision_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS confirmation_fences (
  approval_ref TEXT PRIMARY KEY,
  confirmation_ref TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  confirmed_at TEXT NOT NULL
);
";

pub struct EncryptedJournal {
    path: PathBuf,
    conn: Connection,
    aead: JournalAead,
}

impl EncryptedJournal {
    pub fn open(path: impl AsRef<Path>, store: &dyn SecureStore) -> RuntimeResult<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|_| RuntimeError::fail_closed("journal_io"))?;
        }
        let conn = Connection::open(&path).map_err(|_| RuntimeError::fail_closed("journal_open"))?;
        conn.execute_batch(SCHEMA)
            .map_err(|_| RuntimeError::fail_closed("journal_schema"))?;
        Ok(Self {
            path,
            conn,
            aead: JournalAead::load_or_create(store)?,
        })
    }

    pub fn reopen(&self, store: &dyn SecureStore) -> RuntimeResult<Self> {
        Self::open(&self.path, store)
    }

    pub fn reserve(&self, record: &JournalRecord) -> RuntimeResult<()> {
        assert_control_plane_safe(&record.refs_json)?;
        reject_raw_bodies(&record.refs_json)?;
        let now = now_iso();
        let result = self.conn.execute(
            "INSERT INTO journal_entries (
                binding_ref, adapter_session_ref, instruction_ref, idempotency_key,
                nonce_domain, nonce_digest, nonce_state, sequence, state, refs_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                record.binding_ref,
                record.adapter_session_ref,
                record.instruction_ref,
                record.idempotency_key,
                record.nonce_domain,
                sha256_hex(record.nonce.as_bytes()),
                "consumed",
                record.sequence,
                record.state,
                record.refs_json.to_string(),
                now,
                now,
            ],
        );
        match result {
            Ok(_) => Ok(()),
            Err(rusqlite::Error::SqliteFailure(err, _))
                if err.code == ErrorCode::ConstraintViolation =>
            {
                Err(RuntimeError::fail_closed("idempotency_or_nonce_conflict"))
            }
            Err(_) => Err(RuntimeError::fail_closed("journal_write")),
        }
    }

    pub fn update_state(
        &self,
        binding_ref: &str,
        adapter_session_ref: &str,
        idempotency_key: &str,
        state: &str,
        refs_json: Value,
        sequence: i64,
    ) -> RuntimeResult<()> {
        let current = self
            .get_by_idempotency(binding_ref, adapter_session_ref, idempotency_key)?
            .ok_or_else(|| RuntimeError::unavailable("journal_record_missing"))?;
        self.transition_cas(
            binding_ref,
            adapter_session_ref,
            idempotency_key,
            &current.state,
            current.sequence,
            state,
            refs_json,
            sequence,
        )
    }

    pub fn transition_cas(
        &self,
        binding_ref: &str,
        adapter_session_ref: &str,
        idempotency_key: &str,
        from_state: &str,
        from_sequence: i64,
        to_state: &str,
        refs_json: Value,
        to_sequence: i64,
    ) -> RuntimeResult<()> {
        assert_control_plane_safe(&refs_json)?;
        reject_raw_bodies(&refs_json)?;
        if to_sequence <= from_sequence {
            return Err(RuntimeError::fail_closed("journal_sequence_not_monotonic"));
        }
        assert_allowed_transition(from_state, to_state)?;
        let changed = self
            .conn
            .execute(
                "UPDATE journal_entries
                 SET state = ?1, refs_json = ?2, sequence = ?3, updated_at = ?4
                 WHERE binding_ref = ?5 AND adapter_session_ref = ?6 AND idempotency_key = ?7
                   AND state = ?8 AND sequence = ?9",
                params![
                    to_state,
                    refs_json.to_string(),
                    to_sequence,
                    now_iso(),
                    binding_ref,
                    adapter_session_ref,
                    idempotency_key,
                    from_state,
                    from_sequence,
                ],
            )
            .map_err(|_| RuntimeError::fail_closed("journal_write"))?;
        if changed != 1 {
            return Err(RuntimeError::fail_closed("journal_cas_conflict"));
        }
        Ok(())
    }

    pub fn get_by_idempotency(
        &self,
        binding_ref: &str,
        adapter_session_ref: &str,
        idempotency_key: &str,
    ) -> RuntimeResult<Option<JournalRecord>> {
        self.conn
            .query_row(
                "SELECT binding_ref, adapter_session_ref, instruction_ref, idempotency_key,
                        nonce_domain, nonce_digest, sequence, state, refs_json, created_at, updated_at
                 FROM journal_entries
                 WHERE binding_ref = ?1 AND adapter_session_ref = ?2 AND idempotency_key = ?3",
                params![binding_ref, adapter_session_ref, idempotency_key],
                row_to_record,
            )
            .optional()
            .map_err(|_| RuntimeError::fail_closed("journal_read"))
    }

    pub fn in_flight(&self, binding_ref: &str) -> RuntimeResult<Vec<JournalRecord>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT binding_ref, adapter_session_ref, instruction_ref, idempotency_key,
                        nonce_domain, nonce_digest, sequence, state, refs_json, created_at, updated_at
                 FROM journal_entries
                 WHERE binding_ref = ?1
                   AND state IN ('reserved', 'claimed', 'awaiting_approval', 'running', 'unknown_outcome')
                 ORDER BY sequence ASC",
            )
            .map_err(|_| RuntimeError::fail_closed("journal_read"))?;
        let rows = stmt
            .query_map(params![binding_ref], row_to_record)
            .map_err(|_| RuntimeError::fail_closed("journal_read"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|_| RuntimeError::fail_closed("journal_read"))?);
        }
        Ok(out)
    }

    pub fn put_blob(
        &self,
        data_ref: &str,
        data_kind: &str,
        plaintext: &[u8],
        expires_at: &str,
    ) -> RuntimeResult<()> {
        if looks_like_absolute_path(data_ref) {
            return Err(RuntimeError::fail_closed("path_in_control_plane"));
        }
        let digest = sha256_hex(plaintext);
        if let Ok(existing) = self.conn.query_row(
            "SELECT digest_hex FROM encrypted_blobs WHERE data_ref = ?1",
            params![data_ref],
            |row| row.get::<_, String>(0),
        ) {
            if existing != digest {
                return Err(RuntimeError::fail_closed("blob_digest_conflict"));
            }
            return Ok(());
        }
        let aad = blob_aad(data_ref, data_kind, expires_at);
        let (ciphertext, nonce) = self.aead.seal(plaintext, &aad)?;
        self.conn
            .execute(
                "INSERT INTO encrypted_blobs
                    (data_ref, data_kind, nonce, ciphertext, digest_hex, expires_at, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    data_ref,
                    data_kind,
                    nonce.as_slice(),
                    ciphertext,
                    digest,
                    expires_at,
                    now_iso(),
                ],
            )
            .map_err(|_| RuntimeError::fail_closed("journal_blob_write"))?;
        Ok(())
    }

    pub fn replace_blob(
        &self,
        data_ref: &str,
        data_kind: &str,
        plaintext: &[u8],
        expires_at: &str,
    ) -> RuntimeResult<()> {
        let _ = self
            .conn
            .execute("DELETE FROM encrypted_blobs WHERE data_ref = ?1", params![data_ref]);
        self.put_blob(data_ref, data_kind, plaintext, expires_at)
    }

    pub fn get_blob(&self, data_ref: &str, now: &str) -> RuntimeResult<Vec<u8>> {
        let row: Result<(Vec<u8>, Vec<u8>, String, String), rusqlite::Error> = self.conn.query_row(
            "SELECT nonce, ciphertext, expires_at, data_kind FROM encrypted_blobs WHERE data_ref = ?1",
            params![data_ref],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        );
        let (nonce, ciphertext, expires_at, data_kind) =
            row.map_err(|_| RuntimeError::unavailable("blob_missing"))?;
        if expires_at.as_str() <= now {
            let _ = self
                .conn
                .execute("DELETE FROM encrypted_blobs WHERE data_ref = ?1", params![data_ref]);
            return Err(RuntimeError::unavailable("blob_expired"));
        }
        let aad = blob_aad(data_ref, &data_kind, &expires_at);
        self.aead.open(&nonce, &ciphertext, &aad)
    }

    pub fn get_blob_with_aad(
        &self,
        data_ref: &str,
        now: &str,
        aad: &[u8],
    ) -> RuntimeResult<Vec<u8>> {
        let row: Result<(Vec<u8>, Vec<u8>, String), rusqlite::Error> = self.conn.query_row(
            "SELECT nonce, ciphertext, expires_at FROM encrypted_blobs WHERE data_ref = ?1",
            params![data_ref],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        let (nonce, ciphertext, expires_at) =
            row.map_err(|_| RuntimeError::unavailable("blob_missing"))?;
        if expires_at.as_str() <= now {
            return Err(RuntimeError::unavailable("blob_expired"));
        }
        self.aead.open(&nonce, &ciphertext, aad)
    }

    pub fn record_approval_request(&self, approval_ref: &str, request_digest: &Value) -> RuntimeResult<()> {
        assert_control_plane_safe(request_digest)?;
        self.conn
            .execute(
                "INSERT OR IGNORE INTO approval_fences (approval_ref, request_digest, created_at)
                 VALUES (?1, ?2, ?3)",
                params![approval_ref, request_digest.to_string(), now_iso()],
            )
            .map_err(|_| RuntimeError::fail_closed("approval_fence_write"))?;
        Ok(())
    }

    pub fn fence_decision(
        &self,
        approval_ref: &str,
        request_digest: &Value,
        decision: &Value,
    ) -> RuntimeResult<()> {
        assert_control_plane_safe(decision)?;
        let existing: Option<(String, Option<String>)> = self
            .conn
            .query_row(
                "SELECT request_digest, decision_json FROM approval_fences WHERE approval_ref = ?1",
                params![approval_ref],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| RuntimeError::fail_closed("approval_fence_read"))?;
        let Some((stored_digest, stored_decision)) = existing else {
            return Err(RuntimeError::fail_closed("approval_not_pending"));
        };
        if stored_digest != request_digest.to_string() {
            return Err(RuntimeError::fail_closed("exact_digest_mismatch"));
        }
        if let Some(previous) = stored_decision {
            if previous != decision.to_string() {
                return Err(RuntimeError::fail_closed("terminal_rewrite"));
            }
            return Ok(());
        }
        let changed = self
            .conn
            .execute(
                "UPDATE approval_fences SET decision_json = ?1 WHERE approval_ref = ?2 AND decision_json IS NULL",
                params![decision.to_string(), approval_ref],
            )
            .map_err(|_| RuntimeError::fail_closed("approval_fence_write"))?;
        if changed != 1 {
            return Err(RuntimeError::fail_closed("terminal_rewrite"));
        }
        Ok(())
    }

    pub fn fence_local_confirmation(
        &self,
        approval_ref: &str,
        confirmation_ref: &str,
        request_digest: &Value,
        confirmed_at: &str,
    ) -> RuntimeResult<()> {
        let existing: Option<String> = self
            .conn
            .query_row(
                "SELECT confirmation_ref FROM confirmation_fences WHERE approval_ref = ?1",
                params![approval_ref],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| RuntimeError::fail_closed("confirmation_fence_read"))?;
        if let Some(previous) = existing {
            if previous != confirmation_ref {
                return Err(RuntimeError::fail_closed("local_confirmation_replay"));
            }
            return Ok(());
        }
        self.conn
            .execute(
                "INSERT INTO confirmation_fences
                 (approval_ref, confirmation_ref, request_digest, confirmed_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    approval_ref,
                    confirmation_ref,
                    request_digest.to_string(),
                    confirmed_at
                ],
            )
            .map_err(|_| RuntimeError::fail_closed("confirmation_fence_write"))?;
        Ok(())
    }

    pub fn aead(&self) -> &JournalAead {
        &self.aead
    }

    pub fn by_state(&self, binding_ref: &str, state: &str) -> RuntimeResult<Vec<JournalRecord>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT binding_ref, adapter_session_ref, instruction_ref, idempotency_key,
                        nonce_domain, nonce_digest, sequence, state, refs_json, created_at, updated_at
                 FROM journal_entries
                 WHERE binding_ref = ?1 AND state = ?2
                 ORDER BY sequence ASC",
            )
            .map_err(|_| RuntimeError::fail_closed("journal_read"))?;
        let rows = stmt
            .query_map(params![binding_ref, state], row_to_record)
            .map_err(|_| RuntimeError::fail_closed("journal_read"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|_| RuntimeError::fail_closed("journal_read"))?);
        }
        Ok(out)
    }

    pub fn sqlite_contains_plaintext(&self, needle: &str) -> bool {
        std::fs::read(&self.path)
            .ok()
            .map(|bytes| String::from_utf8_lossy(&bytes).contains(needle))
            .unwrap_or(false)
    }
}

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalRecord> {
    let refs: String = row.get(8)?;
    Ok(JournalRecord {
        binding_ref: row.get(0)?,
        adapter_session_ref: row.get(1)?,
        instruction_ref: row.get(2)?,
        idempotency_key: row.get(3)?,
        nonce_domain: row.get(4)?,
        nonce: row.get(5)?, // nonce_digest only; raw nonce is never persisted
        sequence: row.get(6)?,
        state: row.get(7)?,
        refs_json: serde_json::from_str(&refs).unwrap_or(Value::Null),
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn assert_allowed_transition(from: &str, to: &str) -> RuntimeResult<()> {
    let allowed = matches!(
        (from, to),
        ("reserved", "claimed")
            | ("claimed", "awaiting_approval")
            | ("claimed", "running")
            | ("claimed", "cancelled")
            | ("claimed", "unknown_outcome")
            | ("awaiting_approval", "running")
            | ("awaiting_approval", "cancelled")
            | ("awaiting_approval", "unknown_outcome")
            | ("running", "completed")
            | ("running", "cancelled")
            | ("running", "failed")
            | ("running", "unknown_outcome")
            | ("awaiting_approval", "rejected")
            | ("claimed", "failed")
    );
    if allowed {
        Ok(())
    } else {
        Err(RuntimeError::fail_closed("journal_transition_forbidden"))
    }
}

fn reject_raw_bodies(value: &Value) -> RuntimeResult<()> {
    match value {
        Value::String(text) => {
            if text.contains("raw prompt") || text.contains("diff --git") {
                return Err(RuntimeError::fail_closed("raw_body_forbidden"));
            }
        }
        Value::Array(items) => {
            for item in items {
                reject_raw_bodies(item)?;
            }
        }
        Value::Object(map) => {
            for child in map.values() {
                reject_raw_bodies(child)?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_runtime::crypto::MemorySecureStore;

    fn open_tmp() -> (tempfile::TempDir, EncryptedJournal, MemorySecureStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = MemorySecureStore::default();
        let journal = EncryptedJournal::open(dir.path().join("journal.sqlite"), &store).unwrap();
        (dir, journal, store)
    }

    fn sample(idempotency: &str, nonce: &str) -> JournalRecord {
        JournalRecord {
            binding_ref: "binding-1".into(),
            adapter_session_ref: "adapter-session-1".into(),
            instruction_ref: Some("instruction-1".into()),
            idempotency_key: idempotency.into(),
            nonce_domain: "developer-remote-workspace".into(),
            nonce: nonce.into(),
            sequence: 1,
            state: "reserved".into(),
            refs_json: serde_json::json!({
                "requestDigest": { "algorithm": "sha-256", "canonicalization": "jcs/1", "value": "a".repeat(64) }
            }),
            created_at: now_iso(),
            updated_at: now_iso(),
        }
    }

    #[test]
    fn unique_constraints_and_no_raw_prompt() {
        let (_dir, journal, store) = open_tmp();
        journal.reserve(&sample("idem-1", "nonce-1")).unwrap();
        assert_eq!(
            journal.reserve(&sample("idem-1", "nonce-2")).unwrap_err().code(),
            "idempotency_or_nonce_conflict"
        );
        assert_eq!(
            journal.reserve(&sample("idem-2", "nonce-1")).unwrap_err().code(),
            "idempotency_or_nonce_conflict"
        );
        journal
            .put_blob("blob-1", "instruction", b"do not persist me as raw prompt", "2026-08-22T12:09:00.000Z")
            .unwrap();
        assert!(!journal.sqlite_contains_plaintext("do not persist me as raw prompt"));
        let reopened = journal.reopen(&store).unwrap();
        assert_eq!(
            reopened
                .get_by_idempotency("binding-1", "adapter-session-1", "idem-1")
                .unwrap()
                .unwrap()
                .state,
            "reserved"
        );
        assert_eq!(
            reopened
                .get_blob("blob-1", "2026-08-22T12:10:00.000Z")
                .unwrap_err()
                .code(),
            "blob_expired"
        );
    }

    #[test]
    fn blob_digest_conflict_and_aad_swap() {
        let (_dir, journal, _) = open_tmp();
        journal
            .put_blob("blob-1", "instruction", b"alpha", "2026-08-23T12:09:00.000Z")
            .unwrap();
        assert_eq!(
            journal
                .put_blob("blob-1", "instruction", b"beta", "2026-08-23T12:09:00.000Z")
                .unwrap_err()
                .code(),
            "blob_digest_conflict"
        );
        journal
            .put_blob("blob-1", "instruction", b"alpha", "2026-08-23T12:09:00.000Z")
            .unwrap();
        let swapped = blob_aad("blob-1", "diff", "2026-08-23T12:09:00.000Z");
        assert_eq!(
            journal
                .get_blob_with_aad("blob-1", "2026-08-23T12:00:00.000Z", &swapped)
                .unwrap_err()
                .code(),
            "aead_decrypt_failed"
        );
    }

    #[test]
    fn journal_transition_negatives() {
        let (_dir, journal, _) = open_tmp();
        journal.reserve(&sample("idem-1", "nonce-1")).unwrap();
        assert_eq!(
            journal
                .transition_cas(
                    "binding-1",
                    "adapter-session-1",
                    "idem-1",
                    "reserved",
                    1,
                    "completed",
                    serde_json::json!({ "instructionRef": "instruction-1" }),
                    2,
                )
                .unwrap_err()
                .code(),
            "journal_transition_forbidden"
        );
        journal
            .transition_cas(
                "binding-1",
                "adapter-session-1",
                "idem-1",
                "reserved",
                1,
                "claimed",
                serde_json::json!({ "instructionRef": "instruction-1" }),
                2,
            )
            .unwrap();
        assert_eq!(
            journal
                .transition_cas(
                    "binding-1",
                    "adapter-session-1",
                    "idem-1",
                    "reserved",
                    1,
                    "claimed",
                    serde_json::json!({ "instructionRef": "instruction-1" }),
                    3,
                )
                .unwrap_err()
                .code(),
            "journal_cas_conflict"
        );
    }
}
