// /marketplace 在 v3 中已重命名为 /skills；保留路径并把请求重定向到新页面，避免外链 404。
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/skills', permanent: true },
});

export default function MarketplaceRedirect(): null {
  return null;
}
