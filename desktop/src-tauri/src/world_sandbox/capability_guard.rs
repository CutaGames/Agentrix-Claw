//! Deny-by-default capability authorization for Tier_C logic modules
//! (design §3.3 / §4, R5.1/5.2/5.5/5.6).
//!
//! Mirrors the host-side `capability-registry.ts` rule on the Rust runtime:
//! a logic module may only use a capability it **declared** (its
//! `LogicModuleRef.capabilities`), and only if that capability is part of the
//! World_API whitelist. Anything else is denied. The guard is consulted twice:
//!
//!   - before running `compute.run` (the module must have declared `compute.run`);
//!   - when the host applies each returned intent (its `cap` must be declared).
//!
//! Matching is wildcard-aware for the namespaced `ui.*` / `npc.*` tokens, kept
//! identical to the TS registry so authorization is consistent end-to-end.

/// The World_API capability whitelist (single source of truth on the Rust
/// side; mirrors `WorldApiCapability` in `shared/types/world-creation.ts`).
/// Raw filesystem / network / process are deliberately absent — structurally
/// unreachable (R5.2).
pub const WHITELISTED_CAPABILITIES: &[&str] = &[
    "scene.spawn",
    "scene.transform",
    "scene.setMaterial",
    "asset.import",
    "ui.*",
    "state.kv",
    "event.on",
    "npc.*",
    "battle.start",
    "economy.requestCharge",
    "economy.requestPayout",
    "rpc.toAgent",
    "net.fetch",
    "compute.run",
];

/// Why a capability was denied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DenyReason {
    /// The capability is not in the World_API whitelist (R5.1/5.2).
    NotWhitelisted,
    /// The capability is whitelisted but not declared by the module (§3.3).
    NotGranted,
}

/// Whether a wildcard-aware `token` matches a concrete `requested` capability.
///
/// `ui.*` authorizes `ui.toast` / `ui.panel`; exact tokens match only
/// themselves. Identical semantics to `capabilityMatches` in the TS registry.
fn capability_matches(token: &str, requested: &str) -> bool {
    if token == requested {
        return true;
    }
    if let Some(prefix) = token.strip_suffix(".*") {
        return requested == prefix
            || requested.starts_with(&format!("{prefix}."));
    }
    false
}

/// True iff `cap` resolves to a whitelisted World_API capability.
pub fn is_whitelisted(cap: &str) -> bool {
    WHITELISTED_CAPABILITIES
        .iter()
        .any(|token| capability_matches(token, cap))
}

/// Authorize `cap` against a module's `granted` (declared) capabilities.
///
/// Deny-by-default: returns `Ok(())` only when `cap` is **both** whitelisted
/// **and** matched by a declared capability; otherwise the matching
/// [`DenyReason`].
pub fn authorize(cap: &str, granted: &[String]) -> Result<(), DenyReason> {
    if !is_whitelisted(cap) {
        return Err(DenyReason::NotWhitelisted);
    }
    let ok = granted
        .iter()
        .any(|token| capability_matches(token, cap));
    if ok {
        Ok(())
    } else {
        Err(DenyReason::NotGranted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelisted_and_granted_is_allowed() {
        let granted = vec!["compute.run".to_string(), "scene.transform".to_string()];
        assert!(authorize("compute.run", &granted).is_ok());
        assert!(authorize("scene.transform", &granted).is_ok());
    }

    #[test]
    fn whitelisted_but_not_granted_is_denied() {
        let granted = vec!["compute.run".to_string()];
        assert_eq!(authorize("scene.spawn", &granted), Err(DenyReason::NotGranted));
    }

    #[test]
    fn not_whitelisted_is_denied_even_if_declared() {
        // A module cannot grant itself a raw syscall: it isn't in the whitelist.
        let granted = vec!["fs.read".to_string()];
        assert_eq!(authorize("fs.read", &granted), Err(DenyReason::NotWhitelisted));
    }

    #[test]
    fn wildcard_ui_authorizes_concrete_subcaps() {
        let granted = vec!["ui.*".to_string()];
        assert!(authorize("ui.toast", &granted).is_ok());
        assert!(authorize("ui.panel", &granted).is_ok());
    }
}
