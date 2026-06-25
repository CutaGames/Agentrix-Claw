// Phase 6 S6: /marketplace/skins/[id] → /marketplace/pets/[id] 重定向
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const id = String(ctx.params?.id ?? '');
  return {
    redirect: {
      destination: id ? `/marketplace/pets/${encodeURIComponent(id)}` : '/marketplace/pets',
      permanent: true,
    },
  };
};

export default function SkinDetailRedirect(): null {
  return null;
}
