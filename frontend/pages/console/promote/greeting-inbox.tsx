/**
 * Greeting Inbox �?received greeting cards from friends.
 *
 * Per docs/WEB_REFACTOR_PLAN_2026-05 §6 + docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §6.2
 */
import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Card, CardBody, Stat, Badge } from '../../../components/ui/ax';
import { Gift, ArrowLeft, Sparkles } from 'lucide-react';

// Mock data �?will wire to GET /api/v1/pet/greeting/inbox once backend is public
const MOCK_CARDS = [
  {
    id: '1',
    sender: 'Alex',
    petName: 'Alfred',
    template: 'birthday',
    message: '祝你生日快乐！一起来养我�?🎂',
    emotion: '🎂',
    axpAwarded: 20,
    redeemed: false,
    receivedAt: '2026-05-11T08:30:00Z',
  },
  {
    id: '2',
    sender: 'Sarah',
    petName: 'Luna',
    template: 'encouragement',
    message: '加油！你是最棒的 💪',
    emotion: '💪',
    axpAwarded: 20,
    redeemed: true,
    receivedAt: '2026-05-10T14:15:00Z',
  },
  {
    id: '3',
    sender: 'Mike',
    petName: 'Shadow',
    template: 'programmer_day',
    message: '代码之神保佑�?bug 永除 🙏',
    emotion: '👾',
    axpAwarded: 30,
    redeemed: false,
    receivedAt: '2026-05-09T22:45:00Z',
  },
];

export default function GreetingInboxPage(): React.ReactElement {
  const { t } = useLocalization();

  const unreadCount = MOCK_CARDS.filter((c) => !c.redeemed).length;
  const totalAxpAvailable = MOCK_CARDS.filter((c) => !c.redeemed).reduce(
    (s, c) => s + c.axpAwarded,
    0,
  );

  return (
    <ConsoleLayout title={t({ zh: '🎁 贺卡收件�?, en: '🎁 Greeting Inbox' })}>
      <div className="mb-6">
        <Link
          href="/console/promote"
          className="inline-flex items-center gap-1 text-sm text-agentrix-electric hover:underline"
        >
          <ArrowLeft size={14} />
          {t({ zh: '返回推广中心', en: 'Back to Promote Center' })}
        </Link>
      </div>

      <p className="mb-6 text-sm text-agentrix-fog">
        {t({
          zh: '好友发给你的宠物贺卡。点击收下即可获�?AXP 奖励�?,
          en: 'Greeting cards from friends. Click accept to claim AXP rewards.',
        })}
      </p>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Stat
          label={t({ zh: '未读贺卡', en: 'Unread Cards' })}
          value={String(unreadCount)}
          icon={<Gift size={16} />}
          accent="accent"
        />
        <Stat
          label={t({ zh: '可领 AXP', en: 'Claimable AXP' })}
          value={totalAxpAvailable.toLocaleString()}
          icon={<Sparkles size={16} />}
          accent="warm"
        />
        <Stat
          label={t({ zh: '总收�?, en: 'Total Received' })}
          value={String(MOCK_CARDS.length)}
          icon={<Gift size={16} />}
        />
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {MOCK_CARDS.map((card) => (
          <Card key={card.id} hover>
            <CardBody>
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/30 via-indigo-600/20 to-cyan-400/20 text-3xl">
                  {card.emotion}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">
                      {card.sender} �?{t({ zh: '�?, en: 'You' })}
                    </h3>
                    {card.redeemed ? (
                      <Badge variant="subtle">{t({ zh: '已收', en: 'Claimed' })}</Badge>
                    ) : (
                      <Badge variant="success">NEW</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-agentrix-mist">
                    {t({ zh: '来自宠物', en: 'From pet' })}: {card.petName} · {card.template}
                  </p>
                  <p className="mt-3 text-sm text-white italic">&ldquo;{card.message}&rdquo;</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-agentrix-mist">
                      {new Date(card.receivedAt).toLocaleDateString()}
                    </span>
                    {card.redeemed ? (
                      <span className="text-xs font-medium text-agentrix-fog">
                        +{card.axpAwarded} AXP {t({ zh: '已领�?, en: 'claimed' })}
                      </span>
                    ) : (
                      <button className="rounded-full bg-agentrix-solar px-4 py-1.5 text-xs font-bold text-agentrix-ink transition-transform hover:-translate-y-0.5">
                        {t({ zh: '收下 +', en: 'Claim +' })}
                        {card.axpAwarded} AXP
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Footer hint */}
      <div className="mt-8 rounded-xl border border-dashed border-agentrix-inkLine bg-agentrix-inkSoft/50 p-5 text-center text-xs text-agentrix-mist">
        {t({
          zh: '💡 想给朋友发贺卡？在移动端 Plaza �?贺卡 发送。Web 端撰写器即将推出�?,
          en: '💡 Want to send a card to a friend? Use mobile Plaza �?Greeting. Web composer coming soon.',
        })}
      </div>
    </ConsoleLayout>
  );
}
