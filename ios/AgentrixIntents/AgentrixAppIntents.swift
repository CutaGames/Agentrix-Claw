//
//  AgentrixAppIntents.swift
//  Agentrix · P0-W3-2 — iOS App Intents 6 core (PRD mobile-prd-v3 §4.5 / wearable-prd-v3 §5)
//
//  Six core intents exposed to Siri / Spotlight / Shortcuts / Lock-screen widgets.
//  Each intent forwards to the React Native bridge module `AgentrixIntentBridge`
//  which dispatches into the JS layer through `RCTBridge`.
//
//  To enable: add this file to the iOS app target (Agentrix.xcodeproj) and to the
//  WatchKit extension (P0-W3-4 Watch Shortcut shares the same intents).
//
//  Dependencies: iOS 16+ / watchOS 10+. For older OS support, mirror via Intents
//  framework + IntentHandler.swift.
//

import AppIntents
import Foundation

// MARK: - Bridge protocol — implemented by the RN bridge module

@objc public protocol AgentrixIntentBridgeProtocol {
    static func dispatchIntent(name: String, payload: [String: Any], completion: @escaping (String?) -> Void)
}

private func dispatchToRN(_ name: String, _ payload: [String: Any]) async -> String {
    await withCheckedContinuation { (cont: CheckedContinuation<String, Never>) in
        // Resolved at runtime to avoid hard dependency at compile time.
        let cls: AnyClass? = NSClassFromString("AgentrixIntentBridge")
        if let bridgeClass = cls as? AgentrixIntentBridgeProtocol.Type {
            bridgeClass.dispatchIntent(name: name, payload: payload) { result in
                cont.resume(returning: result ?? "")
            }
        } else {
            cont.resume(returning: "Bridge unavailable")
        }
    }
}

// MARK: - 1. Ask Aira (general assistant)

struct AskAiraIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask Aira"
    static var description = IntentDescription("Send a question to your Agentrix assistant Aira.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Question", requestValueDialog: "What would you like to ask Aira?")
    var question: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await dispatchToRN("ask-aira", ["question": question])
        return .result(dialog: IntentDialog(stringLiteral: reply.isEmpty ? "Aira is offline." : reply))
    }
}

// MARK: - 2. Draft (compose long-form content)

struct DraftIntent: AppIntent {
    static var title: LocalizedStringResource = "Draft with Aira"
    static var description = IntentDescription("Draft an email, post, or message via Aira.")

    @Parameter(title: "Topic")
    var topic: String

    @Parameter(title: "Style", default: "concise")
    var style: String

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let reply = await dispatchToRN("draft", ["topic": topic, "style": style])
        return .result(value: reply)
    }
}

// MARK: - 3. Approve (L1 / L2 risk decision)

struct ApproveIntent: AppIntent {
    static var title: LocalizedStringResource = "Approve Pending Request"
    static var description = IntentDescription("Approve the most recent pending request from Aira.")

    @Parameter(title: "Approval ID", default: "")
    var approvalId: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await dispatchToRN("approve", ["approvalId": approvalId])
        return .result(dialog: IntentDialog(stringLiteral: reply.isEmpty ? "Approval dispatched." : reply))
    }
}

// MARK: - 4. Wallet status (read-only balance + recent txs)

struct WalletStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "Wallet Status"
    static var description = IntentDescription("Read your Agentrix wallet balance and recent transactions.")

    func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
        let summary = await dispatchToRN("wallet-status", [:])
        return .result(value: summary, dialog: IntentDialog(stringLiteral: summary.isEmpty ? "Wallet unavailable." : summary))
    }
}

// MARK: - 5. Invoke Agent (run a specific agent / skill)

struct InvokeAgentIntent: AppIntent {
    static var title: LocalizedStringResource = "Invoke Agent"
    static var description = IntentDescription("Run a specific agent or skill.")

    @Parameter(title: "Agent", requestValueDialog: "Which agent should I run?")
    var agentName: String

    @Parameter(title: "Input", default: "")
    var input: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await dispatchToRN("invoke-agent", ["agent": agentName, "input": input])
        return .result(dialog: IntentDialog(stringLiteral: reply.isEmpty ? "Agent dispatched." : reply))
    }
}

// MARK: - 6. Pet Mood (current Living Companion emotion)

struct PetMoodIntent: AppIntent {
    static var title: LocalizedStringResource = "Aira's Mood"
    static var description = IntentDescription("Check what Aira is feeling right now.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let reply = await dispatchToRN("pet-mood", [:])
        return .result(dialog: IntentDialog(stringLiteral: reply.isEmpty ? "Aira is calm." : reply))
    }
}

// MARK: - App Shortcuts Provider — surfaces intents in Spotlight / Shortcuts

struct AgentrixShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskAiraIntent(),
            phrases: ["Ask Aira in \(.applicationName)", "Talk to Aira"],
            shortTitle: "Ask Aira",
            systemImageName: "message.circle.fill"
        )
        AppShortcut(
            intent: DraftIntent(),
            phrases: ["Draft with \(.applicationName)"],
            shortTitle: "Draft",
            systemImageName: "square.and.pencil"
        )
        AppShortcut(
            intent: ApproveIntent(),
            phrases: ["Approve in \(.applicationName)"],
            shortTitle: "Approve",
            systemImageName: "checkmark.seal.fill"
        )
        AppShortcut(
            intent: WalletStatusIntent(),
            phrases: ["Wallet status in \(.applicationName)"],
            shortTitle: "Wallet",
            systemImageName: "creditcard.fill"
        )
        AppShortcut(
            intent: InvokeAgentIntent(),
            phrases: ["Run agent in \(.applicationName)"],
            shortTitle: "Run Agent",
            systemImageName: "bolt.circle.fill"
        )
        AppShortcut(
            intent: PetMoodIntent(),
            phrases: ["How is Aira feeling", "Aira's mood in \(.applicationName)"],
            shortTitle: "Aira's Mood",
            systemImageName: "face.smiling"
        )
    }
}
