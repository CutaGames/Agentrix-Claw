// LivingTileView.swift
// 10-emotion living tile (PRD §3.4). Updates in <1s when phone pushes pet.state.

import SwiftUI

struct LivingTileView: View {
    @EnvironmentObject var session: WatchSessionStore

    var body: some View {
        VStack(spacing: 12) {
            Text(emoji(for: session.petEmotion))
                .font(.system(size: 64))
                .scaleEffect(1 + 0.05 * Double(session.petIntensity))
                .animation(.easeInOut(duration: 0.4), value: session.petIntensity)
            Text(session.petEmotion.capitalized)
                .font(.headline)
            HStack(spacing: 4) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(i < session.petIntensity ? Color.cyan : Color.gray.opacity(0.3))
                        .frame(width: 6, height: 6)
                }
            }
        }
        .padding()
    }

    private func emoji(for emotion: String) -> String {
        switch emotion {
        case "happy": return "😊"
        case "concerned": return "😟"
        case "love": return "🥰"
        case "sleepy": return "😴"
        case "excited": return "🤩"
        case "thinking": return "🤔"
        case "celebrating": return "🎉"
        case "sad": return "😔"
        case "angry": return "😠"
        default: return "🙂"
        }
    }
}
