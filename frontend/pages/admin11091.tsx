import dynamic from 'next/dynamic'
import Head from 'next/head'

// 延迟加载现有 admin login 页面组件并直接复用
const AdminLoginPage = dynamic(() => import('./admin/login'), { ssr: false })

export default function Admin11091Page() {
  return (
    <>
      <Head>
        <title>管理员登录 - Agentrix 管理后台</title>
      </Head>
      <AdminLoginPage />
    </>
  )
}
