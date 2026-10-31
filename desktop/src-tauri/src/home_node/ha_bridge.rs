//! L8 D3: the Home Assistant bridge of the home node.
//!
//! Turns one granted, already-gated `ha.call.v1` job into one call on the Home Assistant REST API of this house.
//! The long-lived Home Assistant token lives in a file on this computer (mode 0600 is required) and is only ever sent
//! to the Home Assistant address the owner put in the node's own configuration: not to the platform, not in a log,
//! not in a receipt. The node only calls out; it opens no port. The call is built from the entity and action alone, so
//! a job cannot name a service of its own: the table below is the whole list of what can happen.
use serde_json::{json, Map, Value};

/// The most of a Home Assistant answer the node will read.
pub const HA_RESPONSE_MAX_BYTES: usize = 8 * 1024;

/// What the bridge needs from the network: a GET and a POST with the bearer token. Tests use a fake.
pub trait HaHttp {
    fn get(&self, url: &str, token: &str) -> Result<(u16, String), &'static str>;
    fn post(&self, url: &str, token: &str, body: &Value) -> Result<(u16, String), &'static str>;
}

/// The Home Assistant service that does `action` on an entity of `domain`; `None` when the node does not know one
/// (the job then fails, it is never guessed). `read` is not a service.
pub fn service_for(domain: &str, action: &str) -> Option<&'static str> {
    match (domain, action) {
        ("light" | "switch" | "fan" | "input_boolean" | "media_player" | "humidifier", "turn_on") => Some("turn_on"),
        ("light" | "switch" | "fan" | "input_boolean" | "media_player" | "humidifier", "turn_off") => Some("turn_off"),
        ("light", "set") => Some("turn_on"),
        ("lock", "turn_on") => Some("lock"),
        ("lock", "turn_off") => Some("unlock"),
        ("cover", "turn_on") => Some("open_cover"),
        ("cover", "turn_off") => Some("close_cover"),
        ("cover", "set") => Some("set_cover_position"),
        ("valve", "turn_on") => Some("open_valve"),
        ("valve", "turn_off") => Some("close_valve"),
        ("alarm_control_panel", "turn_on") => Some("alarm_arm_away"),
        ("alarm_control_panel", "turn_off") => Some("alarm_disarm"),
        ("climate", "set") => Some("set_temperature"),
        ("number" | "input_number", "set") => Some("set_value"),
        _ => None,
    }
}

fn base_without_slash(base: &str) -> &str {
    base.trim_end_matches('/')
}

/// Does one call. `Ok(text)` is what goes into the receipt digest: the state for a read, `ok` for a change. The
/// answer of a change is not kept (it can carry other entities). Any other status, or an answer that is too large,
/// is an error code, never a body.
pub fn call(
    http: &dyn HaHttp,
    base: &str,
    token: &str,
    entity_id: &str,
    action: &str,
    data: Option<&Map<String, Value>>,
) -> Result<String, &'static str> {
    let domain = crate::home_node::jobs::entity_domain(entity_id);
    if action == "read" {
        let (status, body) = http.get(&format!("{}/api/states/{entity_id}", base_without_slash(base)), token)?;
        if !(200..300).contains(&status) {
            return Err("ha_call_failed");
        }
        if body.len() > HA_RESPONSE_MAX_BYTES {
            return Err("ha_response_too_large");
        }
        return Ok(body);
    }
    let service = service_for(domain, action).ok_or("ha_action_unsupported")?;
    let mut body = Map::new();
    if let Some(data) = data {
        for (key, value) in data {
            body.insert(key.clone(), value.clone());
        }
    }
    // The entity always comes from the job's own field, never from `data`.
    body.insert("entity_id".to_string(), json!(entity_id));
    let (status, _) = http.post(&format!("{}/api/services/{domain}/{service}", base_without_slash(base)), token, &Value::Object(body))?;
    if (200..300).contains(&status) {
        Ok("ok".to_string())
    } else {
        Err("ha_call_failed")
    }
}

/// A Home Assistant address from the node's configuration: `http` or `https`, a host, no credentials in the address.
pub fn ha_base_url(raw: &str) -> Result<String, &'static str> {
    let url = reqwest::Url::parse(raw).map_err(|_| "ha_url_invalid")?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() || url.query().is_some() {
        return Err("ha_url_invalid");
    }
    Ok(base_without_slash(url.as_str()).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Fake {
        calls: RefCell<Vec<(String, String, String, Option<Value>)>>,
        status: u16,
        body: String,
    }

    impl HaHttp for Fake {
        fn get(&self, url: &str, token: &str) -> Result<(u16, String), &'static str> {
            self.calls.borrow_mut().push(("GET".into(), url.into(), token.into(), None));
            Ok((self.status, self.body.clone()))
        }
        fn post(&self, url: &str, token: &str, body: &Value) -> Result<(u16, String), &'static str> {
            self.calls.borrow_mut().push(("POST".into(), url.into(), token.into(), Some(body.clone())));
            Ok((self.status, self.body.clone()))
        }
    }

    fn fake(status: u16, body: &str) -> Fake {
        Fake { calls: RefCell::new(vec![]), status, body: body.into() }
    }

    #[test]
    fn a_change_is_one_post_to_the_service_the_table_names_with_the_entity_from_the_job() {
        let http = fake(200, "[{\"entity_id\":\"light.other\"}]");
        let data = json!({ "brightness": 120 });
        let result = call(&http, "http://ha.local:8123/", "T0KEN", "light.kitchen", "turn_on", data.as_object()).unwrap();
        assert_eq!(result, "ok", "the answer of a change is not kept");
        let calls = http.calls.borrow();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "POST");
        assert_eq!(calls[0].1, "http://ha.local:8123/api/services/light/turn_on");
        assert_eq!(calls[0].2, "T0KEN");
        assert_eq!(calls[0].3, Some(json!({ "entity_id": "light.kitchen", "brightness": 120 })));
    }

    #[test]
    fn data_cannot_name_another_entity() {
        let http = fake(200, "");
        let data = json!({ "entity_id": "lock.front_door" });
        call(&http, "http://ha.local:8123", "t", "light.kitchen", "turn_on", data.as_object()).unwrap();
        assert_eq!(http.calls.borrow()[0].3, Some(json!({ "entity_id": "light.kitchen" })));
    }

    #[test]
    fn sensitive_domains_use_their_own_services() {
        for (entity, action, service) in [
            ("lock.front_door", "turn_on", "lock"),
            ("lock.front_door", "turn_off", "unlock"),
            ("cover.garage", "turn_on", "open_cover"),
            ("cover.garage", "turn_off", "close_cover"),
            ("valve.water", "turn_off", "close_valve"),
            ("alarm_control_panel.house", "turn_off", "alarm_disarm"),
        ] {
            let http = fake(200, "");
            call(&http, "http://ha.local:8123", "t", entity, action, None).unwrap();
            let domain = entity.split('.').next().unwrap();
            assert_eq!(http.calls.borrow()[0].1, format!("http://ha.local:8123/api/services/{domain}/{service}"));
        }
    }

    #[test]
    fn a_read_is_a_get_of_the_state_and_too_large_an_answer_is_an_error() {
        let http = fake(200, "{\"state\":\"on\"}");
        assert_eq!(call(&http, "http://ha.local:8123", "t", "light.kitchen", "read", None).unwrap(), "{\"state\":\"on\"}");
        assert_eq!(http.calls.borrow()[0].1, "http://ha.local:8123/api/states/light.kitchen");
        let big = fake(200, &"x".repeat(HA_RESPONSE_MAX_BYTES + 1));
        assert_eq!(call(&big, "http://ha.local:8123", "t", "light.kitchen", "read", None), Err("ha_response_too_large"));
    }

    #[test]
    fn an_action_the_table_does_not_know_is_not_guessed() {
        let http = fake(200, "");
        assert_eq!(call(&http, "http://ha.local:8123", "t", "sensor.temperature", "turn_on", None), Err("ha_action_unsupported"));
        assert_eq!(call(&http, "http://ha.local:8123", "t", "lock.front_door", "set", None), Err("ha_action_unsupported"));
        assert_eq!(call(&http, "http://ha.local:8123", "t", "script.run_everything", "turn_on", None), Err("ha_action_unsupported"));
        assert!(http.calls.borrow().is_empty(), "nothing is sent for an action that has no service");
    }

    #[test]
    fn an_error_status_is_an_error_code_without_the_body() {
        for status in [401, 404, 500] {
            let http = fake(status, "secret detail from home assistant");
            assert_eq!(call(&http, "http://ha.local:8123", "t", "light.kitchen", "turn_on", None), Err("ha_call_failed"));
            assert_eq!(call(&http, "http://ha.local:8123", "t", "light.kitchen", "read", None), Err("ha_call_failed"));
        }
    }

    #[test]
    fn the_address_is_http_or_https_without_credentials_query_or_fragment() {
        assert_eq!(ha_base_url("http://homeassistant.local:8123/").unwrap(), "http://homeassistant.local:8123");
        assert_eq!(ha_base_url("https://ha.example.net").unwrap(), "https://ha.example.net");
        for bad in ["ftp://ha.local", "http://user:pw@ha.local", "http://ha.local/?token=1", "http://ha.local/#x", "ha.local", "file:///etc/passwd", ""] {
            assert!(ha_base_url(bad).is_err(), "{bad}");
        }
    }
}
