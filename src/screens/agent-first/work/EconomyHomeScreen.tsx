import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useI18n } from "../../../stores/i18nStore";
import {
  WorkCard,
  WorkScreenFrame,
  WorkStateNotice,
} from "./WorkReadOnlyViews";

export function EconomyHomeScreen({ navigation }: any) {
  const { t } = useI18n();
  return (
    <WorkScreenFrame
      eyebrow="ECONOMY"
      title={t({ en: "Economy", zh: "经济" })}
      testID="economy-home-screen"
    >
      <Text>
        {t({
          en: "Discover capabilities, confirm orders and manage lightweight subscriptions here. Complex team, seller and billing operations continue on Web.",
          zh: "在这里发现能力、确认订单并轻量管理订阅；复杂团队、卖家和账单操作继续在 Web 完成。",
        })}
      </Text>
      <WorkCard
        title={t({ en: "Discover", zh: "发现" })}
        testID="economy-discover"
      >
        <View>
          <Text>
            {t({
              en: "All · Skills · Tasks · Resources · Products · Services · Agents",
              zh: "全部 · 技能 · 任务 · 资源 · 产品 · 服务 · Agents",
            })}
          </Text>
        </View>
        <WorkStateNotice
          state={{
            kind: "unavailable",
            capability: "developer.economy.discover_v1",
            reason: "api_not_published",
          }}
        />
        <Text>
          {t({
            en: "When live candidates are available, selection opens Quote → Mandate → Payment → provisioning read-back as separate steps.",
            zh: "Live 候选接通后，选择将依次进入 Quote → Mandate → Payment → provisioning read-back，各步骤相互独立。",
          })}
        </Text>
      </WorkCard>

      <WorkCard title={t({ en: "Orders", zh: "订单" })} testID="economy-orders">
        <TouchableOpacity
          testID="economy-open-orders"
          onPress={() =>
            navigation.getParent()?.navigate("My", { screen: "MyOrders" })
          }
        >
          <Text>
            {t({ en: "Open orders and receipts →", zh: "查看订单与回执 →" })}
          </Text>
        </TouchableOpacity>
      </WorkCard>

      <WorkCard
        title={t({ en: "Subscriptions / Seats", zh: "订阅 / 席位" })}
        testID="economy-subscriptions"
      >
        <WorkStateNotice
          state={{
            kind: "unavailable",
            capability: "developer.economy.seats_v1",
            reason: "api_not_published",
          }}
        />
        <TouchableOpacity
          testID="economy-open-subscription"
          onPress={() =>
            navigation.getParent()?.navigate("My", { screen: "Subscribe" })
          }
        >
          <Text>
            {t({ en: "Manage Agentrix plan →", zh: "管理 Agentrix 套餐 →" })}
          </Text>
        </TouchableOpacity>
      </WorkCard>

      <WorkCard
        title={t({ en: "Seller Studio", zh: "卖家工作室" })}
        testID="economy-seller"
      >
        <Text>
          {t({
            en: "Creation remains the lightweight Mobile seller surface. Team operations, bulk pricing and full billing open on Web.",
            zh: "Creation 保留为 Mobile 轻量卖家入口；团队经营、批量定价和完整账单转到 Web。",
          })}
        </Text>
        <TouchableOpacity
          testID="economy-open-seller"
          onPress={() => navigation.navigate("CreationHome")}
        >
          <Text>
            {t({ en: "Open Creation / Seller", zh: "打开 Creation / Seller" })}
          </Text>
        </TouchableOpacity>
      </WorkCard>
    </WorkScreenFrame>
  );
}
