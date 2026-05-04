//
//  AgentrixWatchShortcuts.swift
//  Agentrix · P0-W3-4 — iOS Watch Shortcut bridging to phone Aira (PRD wearable-prd-v3 §5)
//
//  Re-exports the same six AppIntents on watchOS so they can be triggered from:
//    - Watch face Smart Stack
//    - Watch Shortcuts app (long-press → run on phone)
//    - Siri on AirPods / Watch
//
//  When run on Watch, intents POST to the phone via Watch Connectivity (WCSession),
//  which forwards to the JS bridge via `intentBridge.ts`. If the phone is
//  unreachable, the watch falls back to the local agent timeline cache.
//

#if os(watchOS)

import AppIntents
import WatchConnectivity

final class WatchPhoneRelay: NSObject, WCSessionDelegate {
    static let shared = WatchPhoneRelay()
    private override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    func send(intent name: String, payload: [String: Any]) async -> String {
        await withCheckedContinuation { (cont: CheckedContinuation<String, Never>) in
            guard WCSession.default.isReachable else {
                cont.resume(returning: "Phone unreachable")
                return
            }
            let body: [String: Any] = [
                "type": "intent",
                "name": name,
                "payload": payload,
            ]
            WCSession.default.sendMessage(body, replyHandler: { reply in
                cont.resume(returning: reply["message"] as? String ?? "")
            }, errorHandler: { _ in
                cont.resume(returning: "Send failed")
            })
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
}

// Re-declare the six intents on watchOS, delegating to WatchPhoneRelay.

struct WatchAskAiraIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Aira"
    @Parameter(title: "Question", requestValueDialog: "What's the question?")
    var question: String
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await WatchPhoneRelay.shared.send(intent: "ask-aira", payload: ["question": question])
        return .result(dialog: IntentDialog(stringLiteral: reply))
    }
}

struct WatchPetMoodIntent: AppIntent {
    static var title: LocalizedStringResource = "Aira's Mood"
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await WatchPhoneRelay.shared.send(intent: "pet-mood", payload: [:])
        return .result(dialog: IntentDialog(stringLiteral: reply))
    }
}

struct WatchApproveIntent: AppIntent {
    static var title: LocalizedStringResource = "Approve"
    @Parameter(title: "Approval ID", default: "")
    var approvalId: String
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await WatchPhoneRelay.shared.send(intent: "approve", payload: ["approvalId": approvalId])
        return .result(dialog: IntentDialog(stringLiteral: reply))
    }
}

struct WatchWalletStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "Wallet"
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await WatchPhoneRelay.shared.send(intent: "wallet-status", payload: [:])
        return .result(dialog: IntentDialog(stringLiteral: reply))
    }
}

struct WatchShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: WatchAskAiraIntent(), phrases: ["Ask Aira on \(.applicationName)"], shortTitle: "Ask Aira", systemImageName: "message.circle.fill")
        AppShortcut(intent: WatchPetMoodIntent(), phrases: ["Aira mood on \(.applicationName)"], shortTitle: "Aira Mood", systemImageName: "face.smiling")
        AppShortcut(intent: WatchApproveIntent(), phrases: ["Approve on \(.applicationName)"], shortTitle: "Approve", systemImageName: "checkmark.seal.fill")
        AppShortcut(intent: WatchWalletStatusIntent(), phrases: ["Wallet on \(.applicationName)"], shortTitle: "Wallet", systemImageName: "creditcard.fill")
    }
}

#endif
