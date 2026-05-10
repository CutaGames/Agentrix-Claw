import React, { useState } from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { T, cardStyle } from '../../../lib/console.theme';

export default function SettingsProfile(): React.ReactElement {
  const { t } = useLocalization();
  const [displayName, setDisplayName] = useState('Alex Chen');
  const [email, setEmail] = useState('alex@example.com');
  const [bio, setBio] = useState('Pet-as-Agent enthusiast. Building the future of AI companions.');

  return (
    <ConsoleLayout title={t({ zh: '个人资料', en: 'Profile' })}>
      <p style={{ color: T.text.secondary, marginBottom: 24, fontSize: 14 }}>
        {t({ zh: '管理你的公开资料、头像和联系方式。', en: 'Manage your public profile, avatar and contact info.' })}
      </p>

      <div style={{ maxWidth: 560 }}>
        {/* Avatar */}
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #7C3AED, #22D3FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>
            A
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{displayName}</div>
            <div style={{ fontSize: 12, color: T.text.muted }}>Plus · {t({ zh: '加入 2026-03', en: 'Joined 2026-03' })}</div>
            <button style={{ marginTop: 6, padding: '4px 12px', borderRadius: 6, background: '#1f242d', color: T.text.secondary, fontSize: 11, border: 'none', cursor: 'pointer' }}>
              {t({ zh: '更换头像', en: 'Change avatar' })}
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: T.text.muted, marginBottom: 6 }}>{t({ zh: '显示名称', en: 'Display Name' })}</label>
            <input
              value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #1f242d', background: '#11141a', color: 'white', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: T.text.muted, marginBottom: 6 }}>{t({ zh: '邮箱', en: 'Email' })}</label>
            <input
              value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #1f242d', background: '#11141a', color: 'white', fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: T.text.muted, marginBottom: 6 }}>{t({ zh: '个人简介', en: 'Bio' })}</label>
            <textarea
              value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #1f242d', background: '#11141a', color: 'white', fontSize: 14, resize: 'vertical' }}
            />
          </div>
          <button style={{
            alignSelf: 'flex-start', padding: '10px 24px', borderRadius: 8,
            background: '#6366f1', color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
          }}>
            {t({ zh: '保存', en: 'Save' })}
          </button>
        </div>
      </div>
    </ConsoleLayout>
  );
}
