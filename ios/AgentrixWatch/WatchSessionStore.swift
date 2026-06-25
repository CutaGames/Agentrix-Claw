// WatchSessionStore.swift
// Bridges WCSession events between the standalone watchOS app and the iPhone
// `AgentrixIntentBridge` so the watch tile reflects real pet.state / approvals.

import Foundation
import WatchConnectivity

final class WatchSessionStore: NSObject, ObservableObject, WCSessionDelegate {
    @Published var petEmotion: String = "calm"
    @Published var petIntensity: Int = 1
    @Published var pendingApprovalId: String? = nil
    @Published var pendingApprovalSummary: String? = nil
    @Published var pendingApprovalAmountCents: Int? = nil
    @Published var walletTotalCents: Int = 0

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    // MARK: - WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async {
            if let event = message["event"] as? String {
                switch event {
                case "pet.state":
                    if let emotion = message["emotion"] as? String { self.petEmotion = emotion }
                    if let intensity = message["intensity"] as? Int { self.petIntensity = intensity }
                case "approval.pending":
                    self.pendingApprovalId = message["approval_id"] as? String
                    self.pendingApprovalSummary = message["summary"] as? String
                    self.pendingApprovalAmountCents = message["amount_cents"] as? Int
                case "approval.resolved":
                    self.pendingApprovalId = nil
                    self.pendingApprovalSummary = nil
                    self.pendingApprovalAmountCents = nil
                case "wallet.projection":
                    if let total = message["total_cents"] as? Int { self.walletTotalCents = total }
                default: break
                }
            }
        }
    }

    /// Called by `WristTapHandler` after a 1-second raise-wrist gesture.
    /// Forwards the trigger to phone, which then runs the `wrist-trigger`
    /// REST call and biometric prompt.
    func sendWristTrigger(approvalId: String) {
        guard WCSession.default.activationState == .activated else { return }
        let payload: [String: Any] = [
            "intent": "wrist_trigger",
            "approval_id": approvalId,
            "ts": Date().timeIntervalSince1970,
        ]
        WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
    }
}
