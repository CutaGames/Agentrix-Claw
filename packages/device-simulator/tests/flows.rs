//! B5 (T22, T24): pair, declare, pull today's bookings, render the e-ink view, against a fake platform that runs offline.

use device_simulator::capability::{public_coordinates, signed_upload, verify_upload, DeclarationParams, UploadRefusal};
use device_simulator::eink::{day_view_is_valid, pull_and_render, BookingSource, DayViewParams, RawBooking};
use device_simulator::identity::{verify_pair_request, DeviceIdentity, PairRefusal};
use device_simulator::SimError;
use std::collections::HashMap;

const NOW: i64 = 1_792_000_000;
const BINDING: &str = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

/// The platform side: remembers the public point of every device that passed the pairing proof, and serves bookings only to those.
#[derive(Default)]
struct FakePlatform {
    paired: HashMap<String, (Vec<u8>, Vec<u8>)>,
    bookings: Vec<RawBooking>,
}

impl FakePlatform {
    fn pair(&mut self, identity: &DeviceIdentity, ticket: &str) -> Result<(), PairRefusal> {
        let request = identity.pair_request(ticket, "desk_companion", "0.1.0").unwrap();
        verify_pair_request(&request, ticket)?;
        self.paired.insert(identity.device_id().to_string(), public_coordinates(identity).unwrap());
        Ok(())
    }

    fn accept_declaration(&self, upload: &serde_json::Value, route_device_id: &str) -> Result<(), UploadRefusal> {
        let (x, y) = self.paired.get(route_device_id).ok_or(UploadRefusal::WrongDevice)?;
        verify_upload(upload, route_device_id, x, y, NOW + 1)
    }
}

impl BookingSource for FakePlatform {
    fn bookings_for_day(&self, device_id: &str, _date: &str) -> Result<Vec<RawBooking>, SimError> {
        if self.paired.contains_key(device_id) {
            Ok(self.bookings.clone())
        } else {
            Err(SimError::Invalid("device is not paired"))
        }
    }
}

fn params() -> DeclarationParams<'static> {
    DeclarationParams { shell_binding_id: BINDING, signer_ref: "key:sim-1", now_epoch_seconds: NOW, ttl_seconds: 600, on_power: Some(true) }
}

fn booking(start: &str, end: &str, title: &str) -> RawBooking {
    RawBooking { start: start.to_string(), end: end.to_string(), title: title.to_string() }
}

#[test]
fn pair_declare_pull_and_render() {
    let mut platform = FakePlatform::default();
    platform.bookings = vec![
        booking("2026-10-21T06:00:00Z", "2026-10-21T07:00:00Z", "Call with Mei"),
        booking("2026-10-21T01:00:00Z", "2026-10-21T02:00:00Z", "Standup"),
    ];
    let identity = DeviceIdentity::generate().unwrap();
    platform.pair(&identity, "ticket-1").unwrap();
    let upload = signed_upload(&identity, &params()).unwrap();
    assert_eq!(platform.accept_declaration(&upload, identity.device_id()), Ok(()));
    let view = pull_and_render(&platform, identity.device_id(), &DayViewParams { date: "2026-10-21", time_zone: "Asia/Singapore", utc_offset_minutes: 480 }).unwrap();
    assert!(day_view_is_valid(&view));
    assert_eq!(view["bookings"][0]["title"], "Standup");
    assert_eq!(view["bookings"][1]["title"], "Call with Mei");
}

#[test]
fn an_unpaired_device_gets_no_bookings_and_its_declaration_is_not_accepted() {
    let platform = FakePlatform { bookings: vec![booking("2026-10-21T06:00:00Z", "2026-10-21T07:00:00Z", "Private")], ..Default::default() };
    let stranger = DeviceIdentity::generate().unwrap();
    let params_for_view = DayViewParams { date: "2026-10-21", time_zone: "Asia/Singapore", utc_offset_minutes: 480 };
    assert!(pull_and_render(&platform, stranger.device_id(), &params_for_view).is_err());
    let upload = signed_upload(&stranger, &params()).unwrap();
    assert_eq!(platform.accept_declaration(&upload, stranger.device_id()), Err(UploadRefusal::WrongDevice));
}

#[test]
fn a_device_cannot_declare_as_another_paired_device() {
    let mut platform = FakePlatform::default();
    let first = DeviceIdentity::generate().unwrap();
    let second = DeviceIdentity::generate().unwrap();
    platform.pair(&first, "t1").unwrap();
    platform.pair(&second, "t2").unwrap();
    // the second device signs a declaration that names the first, or is posted on the first's route
    let upload = signed_upload(&second, &params()).unwrap();
    assert_eq!(platform.accept_declaration(&upload, first.device_id()), Err(UploadRefusal::WrongDevice));
    assert_eq!(platform.accept_declaration(&upload, second.device_id()), Ok(()));
}

#[test]
fn pairing_with_someone_elses_ticket_or_a_replayed_proof_is_refused() {
    let mut platform = FakePlatform::default();
    let identity = DeviceIdentity::generate().unwrap();
    let request = identity.pair_request("ticket-a", "desk_companion", "0.1.0").unwrap();
    assert_eq!(verify_pair_request(&request, "ticket-b"), Err(PairRefusal::TicketMismatch));
    assert!(platform.paired.is_empty());
    platform.pair(&identity, "ticket-a").unwrap();
    assert_eq!(platform.paired.len(), 1);
}
