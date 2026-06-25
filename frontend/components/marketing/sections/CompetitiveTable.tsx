/**
 * Competitive comparison — Agentrix vs ChatGPT / Copilot / Character.
 */
import { useLocalization } from '../../../contexts/LocalizationContext';
import { CompareCell } from './_shared';

const COMPARE_ROWS: Array<{
  feature: { zh: string; en: string };
  agentrix: boolean | 'partial';
  chatgpt: boolean | 'partial';
  copilot: boolean | 'partial';
  character: boolean | 'partial';
}> = [
  {
    feature: { zh: '跨 5 端同一身份', en: 'One identity across 5 surfaces' },
    agentrix: true, chatgpt: false, copilot: false, character: false,
  },
  {
    feature: { zh: 'Living 主宠 / Live2D-3D', en: 'Living companion / Live2D-3D' },
    agentrix: true, chatgpt: false, copilot: false, character: 'partial',
  },
  {
    feature: { zh: '本地 Worktree 并行执行', en: 'Local worktree parallel exec' },
    agentrix: true, chatgpt: false, copilot: 'partial', character: false,
  },
  {
    feature: { zh: 'X402 / ERC-8004 链上结算', en: 'X402 / ERC-8004 on-chain settlement' },
    agentrix: true, chatgpt: false, copilot: false, character: false,
  },
  {
    feature: { zh: 'Skill / 任务集市分润', en: 'Skill & task marketplace' },
    agentrix: true, chatgpt: 'partial', copilot: false, character: false,
  },
  {
    feature: { zh: 'MPC 3-share 钱包', en: 'MPC 3-share wallet' },
    agentrix: true, chatgpt: false, copilot: false, character: false,
  },
];

export function CompetitiveTable() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">
            {t({ zh: '为什么选择 Agentrix', en: 'Why Agentrix' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '不是又一个 Chat，而是横跨陪伴 / 执行 / 经济三层的 Agent OS。',
              en: 'Not yet another chat. An Agent OS spanning companionship, execution and economy.',
            })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="mx-auto w-full max-w-4xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-agentrix-inkLine">
                <th className="py-4 text-left font-semibold text-agentrix-fog">
                  {t({ zh: '能力', en: 'Capability' })}
                </th>
                <th className="py-4 text-center font-bold text-agentrix-electric">Agentrix</th>
                <th className="py-4 text-center font-medium text-agentrix-mist">ChatGPT</th>
                <th className="py-4 text-center font-medium text-agentrix-mist">Copilot</th>
                <th className="py-4 text-center font-medium text-agentrix-mist">Character</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((r) => (
                <tr key={r.feature.en} className="border-b border-agentrix-inkLine/50">
                  <td className="py-4 pr-4 text-white">{t(r.feature)}</td>
                  <td className="py-4 text-center"><CompareCell value={r.agentrix} /></td>
                  <td className="py-4 text-center"><CompareCell value={r.chatgpt} /></td>
                  <td className="py-4 text-center"><CompareCell value={r.copilot} /></td>
                  <td className="py-4 text-center"><CompareCell value={r.character} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
