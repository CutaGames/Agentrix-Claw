# EMQX Broker Configuration — ClawCore Phase 5

> Phase 5 BE-10.1 deployment artefact. Owners: `@devops` `@hardware`
> Last verified: 2026-05-06

ClawCore devices reach the Agentrix backend via an EMQX 5.x MQTT broker
fronted by TLS. This directory contains the **declarative configuration**
applied to the broker — topic ACLs, listener config, HTTP authn hook, and
operational runbook.

## Topology

```
device  ── MQTT/TLS:8883 ──▶  EMQX  ── HTTP authn ──▶  api.agentrix.top
                              │
                              └──── bridge ────▶  backend MQTT consumer
                                                   (subscribes agentrix/devices/+/up)
```

Topic vocabulary (also encoded in `shared/clawcore/v1/index.ts → ClawCoreTopics`):

| Direction | Topic | Retained | Notes |
|-----------|-------|---------|-------|
| server → device  | `agentrix/devices/{deviceId}/down`     | no  | pet_state / pet_event / approval_request |
| device → server  | `agentrix/devices/{deviceId}/up`       | no  | approval_response / interaction / telemetry |
| server → device  | `agentrix/devices/{deviceId}/ota`      | no  | OTA chunk replies (small, on-demand) |
| device → broker  | `agentrix/devices/{deviceId}/presence` | YES | last-will online/offline (retained) |

## Files

- `emqx.conf` — listener + auth + telemetry config (HOCON)
- `acl.conf` — topic-level publish/subscribe rules
- `apply.sh` — deploy script (scp + emqx_ctl reload)
- `client_test.sh` — local smoke test using `mosquitto_pub` / `mosquitto_sub`

## HTTP authentication hook

EMQX delegates connect-time auth to the backend at:
```
POST https://api.agentrix.top/api/v1/devices/mqtt/authn
{ "client_id": "<deviceId>", "username": "<deviceId>", "password": "<DST>" }
→ 200 { allow: true }   # if SHA-256(password) == device.dst_hash
→ 401                    # otherwise
```

The `password` field carries the raw DST issued at pairing; the backend
hashes and compares with `clawcore_devices.dst_hash`. The DST never leaves
the device's secure storage outside this single connect handshake.

## Operational runbook

**Deploy a config change**
```bash
./scripts/clawcore-mqtt/apply.sh ubuntu@47.130.176.148
```

**Tail device frames**
```bash
mosquitto_sub -h api.agentrix.top -p 8883 --cafile ca.pem \
  -t 'agentrix/devices/+/up' -u admin -P "$EMQX_ADMIN_PWD"
```

**Force-disconnect a misbehaving device**
```bash
ssh ubuntu@47.130.176.148 "sudo emqx ctl clients kick <deviceId>"
```

**Rotate broker TLS cert** — ACME via certbot, restart broker:
```bash
sudo certbot renew --quiet && sudo systemctl restart emqx
```

## Failure modes

| Symptom | Likely cause | Remedy |
|--------|-------------|--------|
| device cannot connect, `not_authorized` | DST rotated by re-pair | re-pair the device |
| connect 5xx | backend authn hook down | `pm2 restart agentrix-backend`; broker auto-falls-back to deny |
| presence stuck `online` | last-will not configured on device firmware | confirm firmware sets `LWT` on `presence` topic |
| frames dropped | exceeded per-device 50 msg/s | adjust `mqtt.max_inflight` in `emqx.conf` |
