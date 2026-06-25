/**
 * AgentrixIntents — Sprint H #18
 *
 * iOS App Intents for V4 system assistant integration.
 * Per mobile-prd-v4 §8, 4 new intents:
 *   1. CreatePetIntent — "Hey Siri, 让 Aira 帮我生成一只蓝色独角兽"
 *   2. SwitchSkinIntent — "Hey Aira, 换上我新买的猫女皮肤"
 *   3. PetMoodIntent — "Hey Aira, 萌宠现在心情怎么样"
 *   4. MarketSearchIntent — "Hey Aira, 找个适合圣诞的皮肤"
 *
 * These intents use the App Intents framework (iOS 16+) and are
 * exposed to Siri, Shortcuts, and Spotlight.
 */
import AppIntents
import Foundation

// MARK: - CreatePetIntent

@available(iOS 16.0, *)
struct CreatePetIntent: AppIntent {
    static var title: LocalizedStringResource = "Create Pet"
    static var description = IntentDescription("Generate a new AI pet from a text prompt")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Prompt")
    var prompt: String

    func perform() async throws -> some IntentResult & OpensIntent {
        // Deep link to PetCreator with prompt pre-filled
        let encoded = prompt.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let url = URL(string: "agentrix://home/pet/creator?prompt=\(encoded)")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

// MARK: - SwitchSkinIntent

@available(iOS 16.0, *)
struct SwitchSkinIntent: AppIntent {
    static var title: LocalizedStringResource = "Switch Pet Skin"
    static var description = IntentDescription("Change your pet's equipped skin")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Skin Name")
    var skinName: String

    func perform() async throws -> some IntentResult & OpensIntent {
        let encoded = skinName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let url = URL(string: "agentrix://home/pet/wardrobe?search=\(encoded)")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

// MARK: - PetMoodIntent

@available(iOS 16.0, *)
struct PetMoodIntent: AppIntent {
    static var title: LocalizedStringResource = "Pet Mood"
    static var description = IntentDescription("Check your pet's current mood and status")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & OpensIntent {
        let url = URL(string: "agentrix://home")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

// MARK: - MarketSearchIntent

@available(iOS 16.0, *)
struct MarketSearchIntent: AppIntent {
    static var title: LocalizedStringResource = "Search Marketplace"
    static var description = IntentDescription("Search for skins, skills, or tasks in the marketplace")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Query")
    var query: String

    func perform() async throws -> some IntentResult & OpensIntent {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let url = URL(string: "agentrix://plaza/pets/skins?search=\(encoded)")!
        return .result(opensIntent: OpenURLIntent(url))
    }
}

// MARK: - Shortcuts Provider

@available(iOS 16.0, *)
struct AgentrixShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CreatePetIntent(),
            phrases: [
                "Create a pet with \(.applicationName)",
                "让 \(.applicationName) 帮我生成宠物",
                "Generate a pet in \(.applicationName)",
            ],
            shortTitle: "Create Pet",
            systemImageName: "sparkles"
        )
        AppShortcut(
            intent: SwitchSkinIntent(),
            phrases: [
                "Switch skin in \(.applicationName)",
                "换 \(.applicationName) 的皮肤",
            ],
            shortTitle: "Switch Skin",
            systemImageName: "tshirt"
        )
        AppShortcut(
            intent: PetMoodIntent(),
            phrases: [
                "How is my pet in \(.applicationName)",
                "\(.applicationName) 萌宠心情怎么样",
            ],
            shortTitle: "Pet Mood",
            systemImageName: "heart"
        )
        AppShortcut(
            intent: MarketSearchIntent(),
            phrases: [
                "Search marketplace in \(.applicationName)",
                "在 \(.applicationName) 找皮肤",
            ],
            shortTitle: "Search Market",
            systemImageName: "magnifyingglass"
        )
    }
}
