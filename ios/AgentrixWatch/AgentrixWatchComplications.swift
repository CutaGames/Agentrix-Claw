// AgentrixWatchComplications.swift
// WidgetKit-based complications (watchOS 10+). Provides 4 families:
//  · accessoryCorner    (heart in corner)
//  · accessoryCircular  (emotion glyph)
//  · accessoryInline    ("Pet · happy")
//  · accessoryRectangular (emotion + intensity dots + pending count)

import WidgetKit
import SwiftUI

struct PetEntry: TimelineEntry {
    let date: Date
    let emotion: String
    let intensity: Int
    let pending: Int
}

struct PetTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> PetEntry {
        PetEntry(date: .now, emotion: "calm", intensity: 1, pending: 0)
    }
    func getSnapshot(in context: Context, completion: @escaping (PetEntry) -> Void) {
        completion(placeholder(in: context))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<PetEntry>) -> Void) {
        // Real impl reads from a shared App Group userDefaults written by WatchSessionStore.
        let entry = PetEntry(date: .now, emotion: "happy", intensity: 2, pending: 1)
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(60))))
    }
}

struct PetComplicationView: View {
    @Environment(\.widgetFamily) var family
    let entry: PetEntry

    var body: some View {
        switch family {
        case .accessoryCorner:
            Image(systemName: "heart.fill").foregroundColor(.pink)
        case .accessoryCircular:
            Text(emoji(for: entry.emotion)).font(.system(size: 28))
        case .accessoryInline:
            Text("Pet · \(entry.emotion)")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(emoji(for: entry.emotion)).font(.title3)
                    Text(entry.emotion.capitalized).font(.caption).bold()
                }
                if entry.pending > 0 {
                    Text("\(entry.pending) 待审批").font(.caption2).foregroundColor(.cyan)
                }
            }
        default:
            Text(emoji(for: entry.emotion))
        }
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

@main
struct AgentrixWatchComplications: Widget {
    let kind: String = "AgentrixPetComplication"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PetTimelineProvider()) { entry in
            PetComplicationView(entry: entry)
        }
        .configurationDisplayName("Agentrix Pet")
        .description("当前主宠表情与待审批数")
        .supportedFamilies([.accessoryCorner, .accessoryCircular, .accessoryInline, .accessoryRectangular])
    }
}
