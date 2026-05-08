// Phase 6 S6: /marketplace/skins → /marketplace/pets 重定向
// PRD 引用了 /marketplace/skins，但项目唯一存在的市场页是 /marketplace/pets。
// 通过 getServerSideProps 做 308 永久重定向，避免 404。
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/marketplace/pets', permanent: true },
});

export default function SkinsRedirect() {
  return null;
}
