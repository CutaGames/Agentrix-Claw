//! UTC calendar arithmetic without a time crate (the contracts use `YYYY-MM-DDTHH:MM:SS[.ffffff]Z` and `YYYY-MM-DD` only).

/// Days since 1970-01-01 of a proleptic Gregorian date (Howard Hinnant's `days_from_civil`).
pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The inverse of [`days_from_civil`]: (year, month, day).
pub fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

fn digits(text: &str, from: usize, to: usize) -> Option<i64> {
    let slice = text.get(from..to)?;
    if slice.is_empty() || !slice.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    slice.parse().ok()
}

/// `YYYY-MM-DD` to (year, month, day); a date that does not exist (2026-02-30) is `None`.
pub fn parse_date(text: &str) -> Option<(i64, i64, i64)> {
    if text.len() != 10 || text.as_bytes()[4] != b'-' || text.as_bytes()[7] != b'-' {
        return None;
    }
    let year = digits(text, 0, 4)?;
    let month = digits(text, 5, 7)?;
    let day = digits(text, 8, 10)?;
    if !(1..=12).contains(&month) || day < 1 || day > days_in_month(year, month) {
        return None;
    }
    Some((year, month, day))
}

/// `YYYY-MM-DDTHH:MM:SS[.f{1,6}]Z` to epoch seconds (the fraction is dropped); anything else, including an offset, is `None`.
pub fn parse_iso_utc(text: &str) -> Option<i64> {
    if text.len() < 20 || !text.ends_with('Z') || text.as_bytes()[10] != b'T' {
        return None;
    }
    let (year, month, day) = parse_date(text.get(0..10)?)?;
    let bytes = text.as_bytes();
    if bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    let hour = digits(text, 11, 13)?;
    let minute = digits(text, 14, 16)?;
    let second = digits(text, 17, 19)?;
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let rest = text.get(19..text.len() - 1)?;
    if !rest.is_empty() {
        let fraction = rest.strip_prefix('.')?;
        if fraction.is_empty() || fraction.len() > 6 || !fraction.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
    }
    Some(days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second)
}

/// Epoch seconds to `YYYY-MM-DDTHH:MM:SSZ`.
pub fn format_iso_utc(epoch_seconds: i64) -> String {
    let days = epoch_seconds.div_euclid(86_400);
    let secs = epoch_seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", secs / 3600, (secs % 3600) / 60, secs % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_instants() {
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(parse_iso_utc("2000-03-01T00:00:00Z"), Some(951_868_800));
        assert_eq!(parse_iso_utc("2001-09-09T01:46:40Z"), Some(1_000_000_000));
        assert_eq!(format_iso_utc(1_000_000_000), "2001-09-09T01:46:40Z");
        assert_eq!(format_iso_utc(951_868_800), "2000-03-01T00:00:00Z");
    }

    #[test]
    fn round_trips_across_years_including_before_1970() {
        for days in [-800_000, -1, 0, 1, 59, 60, 365, 10_957, 20_000, 40_000, 2_000_000] {
            let (y, m, d) = civil_from_days(days);
            assert_eq!(days_from_civil(y, m, d), days);
        }
    }

    #[test]
    fn rejects_dates_and_times_that_do_not_exist() {
        assert_eq!(parse_date("2026-02-29"), None);
        assert_eq!(parse_date("2028-02-29"), Some((2028, 2, 29)));
        assert_eq!(parse_date("2026-13-01"), None);
        assert_eq!(parse_date("2026-1-01"), None);
        assert_eq!(parse_iso_utc("2026-10-21T24:00:00Z"), None);
        assert_eq!(parse_iso_utc("2026-10-21T23:60:00Z"), None);
        assert_eq!(parse_iso_utc("2026-10-21T10:00:00+08:00"), None);
        assert_eq!(parse_iso_utc("2026-10-21T10:00:00"), None);
        assert_eq!(parse_iso_utc("2026-10-21T10:00:00.Z"), None);
        assert_eq!(parse_iso_utc("2026-10-21T10:00:00.1234567Z"), None);
        assert_eq!(parse_iso_utc("2026-10-21T10:00:00.5Z"), parse_iso_utc("2026-10-21T10:00:00Z"));
    }
}
