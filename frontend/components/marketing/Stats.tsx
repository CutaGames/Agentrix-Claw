import { useEffect, useState } from 'react'
import { websiteApi } from '../../lib/api/website.api'

export function Stats() {
  const [stats, setStats] = useState({
    totalGMV: '¥1.2B',
    totalAgents: '50K+',
    activeMerchants: '15K+',
    totalUsers: '2.3M',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await websiteApi.getStats()
      setStats({
        totalGMV: data.totalGMV,
        totalAgents: `${(data.totalAgents / 1000).toFixed(0)}K+`,
        activeMerchants: `${(data.activeMerchants / 1000).toFixed(0)}K+`,
        totalUsers: `${(data.totalUsers / 1000000).toFixed(1)}M`,
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
      // 使用默认值
    } finally {
      setLoading(false)
    }
  }

  const statsList = [
    { value: stats.totalGMV, label: '平台总交易额' },
    { value: stats.totalAgents, label: '活跃AI Agent' },
    { value: stats.activeMerchants, label: '接入商户' },
    { value: stats.totalUsers, label: '注册用户' },
  ]

  return (
    <section className="bg-white py-16">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {statsList.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                {loading ? '...' : stat.value}
              </div>
              <div className="text-gray-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
