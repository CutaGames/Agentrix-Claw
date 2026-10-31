//! Fail-closed reason codes for the Developer Runtime Host.

use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeError {
    pub outcome: RuntimeOutcome,
    pub reason_code: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeOutcome {
    Ok,
    FailClosed,
    Unavailable,
}

impl RuntimeError {
    pub fn fail_closed(reason_code: &str) -> Self {
        Self {
            outcome: RuntimeOutcome::FailClosed,
            reason_code: reason_code.to_string(),
            message: reason_code.to_string(),
        }
    }

    pub fn unavailable(reason_code: &str) -> Self {
        Self {
            outcome: RuntimeOutcome::Unavailable,
            reason_code: reason_code.to_string(),
            message: reason_code.to_string(),
        }
    }

    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = self.sanitize_message(message.into());
        self
    }

    pub fn code(&self) -> &str {
        &self.reason_code
    }

    fn sanitize_message(&self, message: String) -> String {
        crate::developer_runtime::policy::redact_text(&message)
    }
}

impl fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.reason_code, self.message)
    }
}

impl std::error::Error for RuntimeError {}

pub type RuntimeResult<T> = Result<T, RuntimeError>;
