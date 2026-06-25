// AgentrixWatchApp.swift
// Standalone watchOS app entry. Drop into a new "watchOS App" target in
// Agentrix.xcodeproj — see README.md for the 10-minute Xcode setup.

import SwiftUI

@main
struct AgentrixWatchApp: App {
    @StateObject private var session = WatchSessionStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
                .onAppear { session.activate() }
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var session: WatchSessionStore

    var body: some View {
        TabView {
            LivingTileView()
                .tabItem { Label("Pet", systemImage: "heart.fill") }
            WatchApprovalView()
                .tabItem { Label("Approve", systemImage: "checkmark.shield") }
            WatchWalletView()
                .tabItem { Label("Wallet", systemImage: "wallet.pass") }
        }
    }
}
