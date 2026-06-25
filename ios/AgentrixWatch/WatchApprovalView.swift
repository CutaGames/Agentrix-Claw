// WatchApprovalView.swift
// Inline L1/L2 approval card with raise-wrist signing for L2.

import SwiftUI
import WatchKit

struct WatchApprovalView: View {
    @EnvironmentObject var session: WatchSessionStore

    var body: some View {
        if let id = session.pendingApprovalId {
            VStack(spacing: 10) {
                Text("待审批")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(session.pendingApprovalSummary ?? "需要您的确认")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                if let cents = session.pendingApprovalAmountCents {
                    Text(String(format: "$%.2f", Double(cents) / 100))
                        .font(.title3)
                        .bold()
                }
                HStack(spacing: 12) {
                    Button(action: reject) {
                        Label("拒绝", systemImage: "xmark")
                    }
                    .tint(.red)
                    Button(action: { wristSign(approvalId: id) }) {
                        Label("抬腕签名", systemImage: "checkmark")
                    }
                    .tint(.cyan)
                }
            }
            .padding()
        } else {
            VStack(spacing: 6) {
                Image(systemName: "checkmark.shield")
                    .font(.largeTitle)
                    .foregroundColor(.cyan)
                Text("无待审批").foregroundColor(.secondary)
            }
        }
    }

    private func wristSign(approvalId: String) {
        WKInterfaceDevice.current().play(.success)
        session.sendWristTrigger(approvalId: approvalId)
    }

    private func reject() {
        WKInterfaceDevice.current().play(.failure)
        // TODO: send WCSession message {"intent":"reject_approval","approval_id":...}
    }
}

struct WatchWalletView: View {
    @EnvironmentObject var session: WatchSessionStore
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "wallet.pass.fill").font(.title)
            Text("总资产").font(.caption).foregroundColor(.secondary)
            Text(String(format: "$%.2f", Double(session.walletTotalCents) / 100))
                .font(.title2).bold()
        }
        .padding()
    }
}
