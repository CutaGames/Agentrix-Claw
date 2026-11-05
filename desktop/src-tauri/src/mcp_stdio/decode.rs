//! Port of `decodeContextProjectionDataV1_1` and `normalizeDesktopMemoryProposalTextV1`
//! (`shared/types/context-memory.ts`). A record without a valid `provenance`, or in a category D4 may not
//! ask for, is dropped: the MCP client never sees memory that has no source.

use serde_json::{Map, Value};

pub const ALLOWED_CATEGORIES: [&str; 3] = ["agent_profile", "agent_preferences", "agent_memory"];
pub const MEMORY_CATEGORY: &str = "agent_memory";
pub const PURPOSES: [&str; 2] = ["answer_user_question", "task_execution_planning"];
const SOURCE_DOMAINS: [&str; 5] = ["agent", "memory", "conversation", "knowledge", "skill_registry"];
const SOURCE_KINDS: [&str; 5] = ["imported_chat", "owner_written", "soul_core", "agent_profile", "agent_settings"];
const MEMORY_SOURCE_KINDS: [&str; 3] = ["imported_chat", "owner_written", "soul_core"];
pub const MEMORY_TEXT_MAX_CHARS: usize = 8000;
pub const PROPOSAL_TEXT_MAX_CHARS: usize = 2000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Record {
    pub category: String,
    pub fields: Map<String, Value>,
    pub source_kind: String,
    pub source_ref: String,
    pub source_version: String,
    pub observed_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decoded {
    pub projection_id: String,
    pub disclosure_receipt_id: String,
    pub records: Vec<Record>,
    pub dropped: usize,
}

/// `[A-Za-z0-9][A-Za-z0-9._:-]{0,max-1}`.
pub fn is_opaque(value: &str, max: usize) -> bool {
    let bytes = value.as_bytes();
    (1..=max).contains(&bytes.len())
        && bytes[0].is_ascii_alphanumeric()
        && bytes.iter().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b':' | b'-'))
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn decode_record(record: &Value) -> Option<Record> {
    let category = text(record, "category")?;
    if !ALLOWED_CATEGORIES.contains(&category.as_str()) {
        return None;
    }
    let fields = record.get("fields")?.as_object()?.clone();
    let provenance = record.get("provenance")?;
    let domain = text(provenance, "sourceDomain")?;
    let kind = text(provenance, "sourceKind")?;
    let source_ref = text(provenance, "sourceRef")?;
    let version = text(provenance, "sourceVersion")?;
    let observed = text(provenance, "observedAt")?;
    if !SOURCE_DOMAINS.contains(&domain.as_str())
        || !SOURCE_KINDS.contains(&kind.as_str())
        || !is_opaque(&source_ref, 200)
        || version.is_empty()
        || version.chars().count() > 64
        || chrono::DateTime::parse_from_rfc3339(&observed).is_err()
    {
        return None;
    }
    if category == MEMORY_CATEGORY {
        let body = fields.get("text").and_then(Value::as_str)?;
        let len = body.chars().count();
        if len == 0 || len > MEMORY_TEXT_MAX_CHARS || !MEMORY_SOURCE_KINDS.contains(&kind.as_str()) {
            return None;
        }
    }
    Some(Record { category, fields, source_kind: kind, source_ref, source_version: version, observed_at: observed })
}

/// `None` when the top level is wrong; otherwise the records that have a source, and how many were dropped.
pub fn decode_projection_data(value: &Value) -> Option<Decoded> {
    let projection_id = text(value, "projectionId").filter(|s| !s.is_empty() && s.chars().count() <= 200)?;
    let receipt = text(value, "disclosureReceiptId").filter(|s| !s.is_empty() && s.chars().count() <= 200)?;
    let items = value.get("records")?.as_array()?;
    let mut records = Vec::new();
    let mut dropped = 0;
    for item in items {
        match decode_record(item) {
            Some(record) => records.push(record),
            None => dropped += 1,
        }
    }
    Some(Decoded { projection_id, disclosure_receipt_id: receipt, records, dropped })
}

/// Trimmed, 1–2000 characters; anything else is refused on this computer before a request is made.
pub fn normalize_proposal_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let len = trimmed.chars().count();
    (len > 0 && len <= PROPOSAL_TEXT_MAX_CHARS).then(|| trimmed.to_string())
}
