//! The e-ink day view of the desk companion (`EinkDayViewG1` in `shared/types/device-gateway-g1.ts`).
//!
//! The device pulls today's bookings through a [`BookingSource`] (the platform, or a fake in tests) and renders the JSON the
//! panel draws: `{ date, timeZone, bookings: [{ start, end, title }] }`, at most 12 bookings sorted by start, titles of at
//! most 40 UTF-16 units. Bookings that do not overlap the local day, or whose times do not parse, are left out. Titles are
//! owner data: nothing here logs or stores them.

use crate::timeutil::{days_from_civil, format_iso_utc, parse_date, parse_iso_utc};
use crate::SimError;
use serde_json::{json, Value};

pub const BOOKINGS_MAX: usize = 12;
pub const TITLE_UNITS_MAX: usize = 40;
const OFFSET_MINUTES_MAX: i32 = 14 * 60;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawBooking {
    pub start: String,
    pub end: String,
    pub title: String,
}

/// Where today's bookings come from. The real implementation asks the platform with the device's own credential.
pub trait BookingSource {
    fn bookings_for_day(&self, device_id: &str, date: &str) -> Result<Vec<RawBooking>, SimError>;
}

pub struct DayViewParams<'a> {
    /// `YYYY-MM-DD` in the owner's time zone.
    pub date: &'a str,
    /// IANA name, for example `Asia/Singapore` (shown, and checked for shape).
    pub time_zone: &'a str,
    /// The zone's offset from UTC on that date, in minutes (the simulator has no time-zone database).
    pub utc_offset_minutes: i32,
}

/// The shape the contract allows for a zone name: `Area/Place[/Place]`, ASCII letters, `_`, and `+` `-` after the first part.
pub fn valid_time_zone_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 64 {
        return false;
    }
    let mut parts = name.split('/');
    let first_ok = match parts.next() {
        Some(first) => !first.is_empty() && first.bytes().all(|b| b.is_ascii_alphabetic() || b == b'_'),
        None => false,
    };
    first_ok && parts.all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_alphabetic() || b == b'_' || b == b'+' || b == b'-'))
}

fn clean_title(raw: &str) -> String {
    let flat: String = raw.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let trimmed = flat.trim();
    if trimmed.is_empty() {
        return "(no title)".to_string();
    }
    let units: usize = trimmed.chars().map(char::len_utf16).sum();
    if units <= TITLE_UNITS_MAX {
        return trimmed.to_string();
    }
    let mut kept = String::new();
    let mut used = 0usize;
    for c in trimmed.chars() {
        if used + c.len_utf16() > TITLE_UNITS_MAX - 1 {
            break;
        }
        used += c.len_utf16();
        kept.push(c);
    }
    kept.push('\u{2026}');
    kept
}

pub fn render_day_view(params: &DayViewParams<'_>, bookings: &[RawBooking]) -> Result<Value, SimError> {
    let (year, month, day) = parse_date(params.date).ok_or(SimError::Invalid("date"))?;
    if !valid_time_zone_name(params.time_zone) {
        return Err(SimError::Invalid("time zone name"));
    }
    if params.utc_offset_minutes.abs() > OFFSET_MINUTES_MAX {
        return Err(SimError::Invalid("utc offset"));
    }
    let window_start = days_from_civil(year, month, day) * 86_400 - i64::from(params.utc_offset_minutes) * 60;
    let window_end = window_start + 86_400;
    let mut kept: Vec<(i64, i64, String)> = Vec::new();
    for booking in bookings {
        let (start, end) = match (parse_iso_utc(&booking.start), parse_iso_utc(&booking.end)) {
            (Some(start), Some(end)) => (start, end),
            _ => continue,
        };
        if end <= start || start >= window_end || end <= window_start {
            continue;
        }
        kept.push((start, end, clean_title(&booking.title)));
    }
    kept.sort_by_key(|entry| entry.0);
    kept.truncate(BOOKINGS_MAX);
    let rendered: Vec<Value> = kept
        .iter()
        .map(|(start, end, title)| json!({"start": format_iso_utc(*start), "end": format_iso_utc(*end), "title": title}))
        .collect();
    Ok(json!({"date": params.date, "timeZone": params.time_zone, "bookings": rendered}))
}

/// Pulls the day's bookings for this device and renders them.
pub fn pull_and_render<S: BookingSource>(source: &S, device_id: &str, params: &DayViewParams<'_>) -> Result<Value, SimError> {
    let bookings = source.bookings_for_day(device_id, params.date)?;
    render_day_view(params, &bookings)
}

/// The same checks as `decodeEinkDayViewG1`: used by the tests as the panel's own input guard.
pub fn day_view_is_valid(view: &Value) -> bool {
    let Some(object) = view.as_object() else { return false };
    if object.len() != 3 {
        return false;
    }
    let date_ok = view.get("date").and_then(Value::as_str).map(|d| parse_date(d).is_some()).unwrap_or(false);
    let zone_ok = view.get("timeZone").and_then(Value::as_str).map(valid_time_zone_name).unwrap_or(false);
    let Some(list) = view.get("bookings").and_then(Value::as_array) else { return false };
    if !date_ok || !zone_ok || list.len() > BOOKINGS_MAX {
        return false;
    }
    let mut previous = i64::MIN;
    for entry in list {
        let start = entry.get("start").and_then(Value::as_str).and_then(parse_iso_utc);
        let end = entry.get("end").and_then(Value::as_str).and_then(parse_iso_utc);
        let title = entry.get("title").and_then(Value::as_str);
        match (start, end, title) {
            (Some(start), Some(end), Some(title)) => {
                if end <= start || start < previous || title.encode_utf16().count() > TITLE_UNITS_MAX {
                    return false;
                }
                previous = start;
            }
            _ => return false,
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn booking(start: &str, end: &str, title: &str) -> RawBooking {
        RawBooking { start: start.to_string(), end: end.to_string(), title: title.to_string() }
    }

    fn singapore(date: &str) -> DayViewParams<'_> {
        DayViewParams { date, time_zone: "Asia/Singapore", utc_offset_minutes: 480 }
    }

    #[test]
    fn keeps_only_the_local_day_sorted_by_start() {
        // Singapore 2026-10-21 runs from 2026-10-20T16:00:00Z to 2026-10-21T16:00:00Z.
        let bookings = vec![
            booking("2026-10-21T06:00:00Z", "2026-10-21T07:00:00Z", "Call with Mei"),
            booking("2026-10-20T16:30:00Z", "2026-10-20T17:00:00Z", "Early"),
            booking("2026-10-20T15:00:00Z", "2026-10-20T16:00:00Z", "Yesterday, ends at midnight"),
            booking("2026-10-21T16:00:00Z", "2026-10-21T17:00:00Z", "Tomorrow"),
        ];
        let view = render_day_view(&singapore("2026-10-21"), &bookings).unwrap();
        let titles: Vec<&str> = view["bookings"].as_array().unwrap().iter().map(|b| b["title"].as_str().unwrap()).collect();
        assert_eq!(titles, vec!["Early", "Call with Mei"]);
        assert!(day_view_is_valid(&view));
    }

    #[test]
    fn a_booking_that_crosses_midnight_shows_on_both_days() {
        let overnight = vec![booking("2026-10-21T15:00:00Z", "2026-10-21T17:00:00Z", "Flight")];
        assert_eq!(render_day_view(&singapore("2026-10-21"), &overnight).unwrap()["bookings"].as_array().unwrap().len(), 1);
        assert_eq!(render_day_view(&singapore("2026-10-22"), &overnight).unwrap()["bookings"].as_array().unwrap().len(), 1);
        assert_eq!(render_day_view(&singapore("2026-10-23"), &overnight).unwrap()["bookings"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn at_most_twelve_titles_are_cut_to_forty_units_and_control_characters_become_spaces() {
        let many: Vec<RawBooking> = (0..15).map(|i| booking(&format!("2026-10-21T{:02}:00:00Z", i), &format!("2026-10-21T{:02}:30:00Z", i), "x")).collect();
        let view = render_day_view(&singapore("2026-10-21"), &many).unwrap();
        assert_eq!(view["bookings"].as_array().unwrap().len(), 12);
        let long = vec![booking("2026-10-21T01:00:00Z", "2026-10-21T02:00:00Z", &"a".repeat(80))];
        let title = render_day_view(&singapore("2026-10-21"), &long).unwrap()["bookings"][0]["title"].as_str().unwrap().to_string();
        assert_eq!(title.encode_utf16().count(), 40);
        assert!(title.ends_with('\u{2026}'));
        let wide = vec![booking("2026-10-21T01:00:00Z", "2026-10-21T02:00:00Z", &"\u{1F600}".repeat(30))];
        let wide_view = render_day_view(&singapore("2026-10-21"), &wide).unwrap();
        assert!(day_view_is_valid(&wide_view));
        let control = vec![booking("2026-10-21T01:00:00Z", "2026-10-21T02:00:00Z", "a\nb\u{0007}c")];
        assert_eq!(render_day_view(&singapore("2026-10-21"), &control).unwrap()["bookings"][0]["title"], "a b c");
        let empty = vec![booking("2026-10-21T01:00:00Z", "2026-10-21T02:00:00Z", "   ")];
        assert_eq!(render_day_view(&singapore("2026-10-21"), &empty).unwrap()["bookings"][0]["title"], "(no title)");
    }

    #[test]
    fn unparsable_or_backwards_bookings_are_left_out_not_drawn() {
        let bookings = vec![
            booking("not a time", "2026-10-21T02:00:00Z", "bad start"),
            booking("2026-10-21T03:00:00Z", "2026-10-21T02:00:00Z", "ends first"),
            booking("2026-10-21T03:00:00+08:00", "2026-10-21T04:00:00Z", "offset form"),
            booking("2026-10-21T03:00:00Z", "2026-10-21T03:00:00Z", "zero length"),
            booking("2026-10-21T05:00:00Z", "2026-10-21T06:00:00Z", "fine"),
        ];
        let view = render_day_view(&singapore("2026-10-21"), &bookings).unwrap();
        assert_eq!(view["bookings"].as_array().unwrap().len(), 1);
        assert_eq!(view["bookings"][0]["title"], "fine");
    }

    #[test]
    fn bad_date_zone_or_offset_is_refused() {
        assert!(render_day_view(&singapore("2026-02-30"), &[]).is_err());
        assert!(render_day_view(&DayViewParams { date: "2026-10-21", time_zone: "Asia Singapore", utc_offset_minutes: 0 }, &[]).is_err());
        assert!(render_day_view(&DayViewParams { date: "2026-10-21", time_zone: "Asia/Singapore", utc_offset_minutes: 15 * 60 }, &[]).is_err());
        assert!(valid_time_zone_name("America/Argentina/Buenos_Aires"));
        assert!(!valid_time_zone_name("../etc"));
        assert!(!valid_time_zone_name("Asia/"));
        assert!(!valid_time_zone_name(""));
    }

    struct Fake {
        rows: Vec<RawBooking>,
    }
    impl BookingSource for Fake {
        fn bookings_for_day(&self, device_id: &str, date: &str) -> Result<Vec<RawBooking>, SimError> {
            if device_id.starts_with("dev_") && date == "2026-10-21" {
                Ok(self.rows.clone())
            } else {
                Err(SimError::Invalid("no such device or day"))
            }
        }
    }

    #[test]
    fn pulls_through_the_source_and_renders() {
        let source = Fake { rows: vec![booking("2026-10-21T05:00:00Z", "2026-10-21T06:00:00Z", "Standup")] };
        let view = pull_and_render(&source, "dev_0123", &singapore("2026-10-21")).unwrap();
        assert_eq!(view["bookings"][0]["title"], "Standup");
        assert!(pull_and_render(&source, "someone_else", &singapore("2026-10-21")).is_err());
    }

    #[test]
    fn the_panel_guard_refuses_what_the_contract_refuses() {
        let ok = json!({"date": "2026-10-21", "timeZone": "Asia/Singapore", "bookings": []});
        assert!(day_view_is_valid(&ok));
        let mut extra = ok.clone();
        extra["note"] = json!("x");
        assert!(!day_view_is_valid(&extra));
        let unsorted = json!({"date": "2026-10-21", "timeZone": "Asia/Singapore", "bookings": [
            {"start": "2026-10-21T05:00:00Z", "end": "2026-10-21T06:00:00Z", "title": "b"},
            {"start": "2026-10-21T01:00:00Z", "end": "2026-10-21T02:00:00Z", "title": "a"}]});
        assert!(!day_view_is_valid(&unsorted));
        let long_title = json!({"date": "2026-10-21", "timeZone": "Asia/Singapore", "bookings": [
            {"start": "2026-10-21T01:00:00Z", "end": "2026-10-21T02:00:00Z", "title": "a".repeat(41)}]});
        assert!(!day_view_is_valid(&long_title));
    }
}
