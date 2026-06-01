// ClawCore iOS Bridge SDK — interface skeleton (Phase 5 HW-10.5).
//
// Source-of-truth contract: shared/clawcore/v1/bridge.ts
//
// Real implementation lands as a signed .xcframework in Phase 5 W10.
// This file freezes the public surface so partner / RN-bridge integration
// can be planned against a stable signature.

import Foundation
import Combine

public struct PairResult: Codable, Equatable {
    public let deviceId: String
    public let dst: String
    public let deviceClass: String
}

public struct ScanHit: Codable, Equatable {
    public let deviceId: String
    public let rssi: Int
    public let advName: String?
}

public enum BridgeEvent {
    case connected(deviceId: String)
    case disconnected(deviceId: String, reason: String?)
    case petStateFrame(rawJson: String)
    case petEventFrame(rawJson: String)
    case approvalRequestFrame(rawJson: String)
    case otaProgress(deviceId: String, index: Int, total: Int)
    case error(deviceId: String?, code: String, message: String)
}

public protocol ClawCoreBridge {
    func initBridge(apiBase: String, mqttHost: String, mqttPort: Int) async throws
    func scan(timeoutMs: Int) async throws -> [ScanHit]
    func pair(ticket: String, deviceId: String) async throws -> PairResult
    func connect(deviceId: String, dst: String) async throws
    func disconnect(deviceId: String) async throws
    func sendApprovalResponse(frameJson: String) async throws
    func sendEvent(frameJson: String) async throws
    func beginOta(deviceId: String) async throws -> (packageId: String, version: String)
    var events: AnyPublisher<BridgeEvent, Never> { get }
}

/// Error codes — must match shared/clawcore/v1/bridge.ts BridgeErrorCodes.
public enum BridgeErrorCodes {
    public static let notInitialised = "BRIDGE_NOT_INITIALISED"
    public static let transportUnavailable = "BRIDGE_TRANSPORT_UNAVAILABLE"
    public static let pairTicketInvalid = "BRIDGE_PAIR_TICKET_INVALID"
    public static let authRejected = "BRIDGE_AUTH_REJECTED"
    public static let replayDetected = "BRIDGE_REPLAY_DETECTED"
    public static let otaIntegrityFail = "BRIDGE_OTA_INTEGRITY_FAIL"
    public static let otaResumed = "BRIDGE_OTA_RESUMED"
    public static let timeout = "BRIDGE_TIMEOUT"
}
