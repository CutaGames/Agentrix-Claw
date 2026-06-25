/**
 * /clan → /clans 301 redirect (Sprint W-1 / W-P0-1).
 *
 * The actual content lives at /clans (plural). Some marketing materials and
 * deep links point at /clan (singular), which used to 404. This stub fixes
 * that by issuing a permanent redirect on the server.
 */
import type { GetServerSideProps, NextPage } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/clans',
      permanent: true,
    },
  };
};

const ClanRedirect: NextPage = () => null;
export default ClanRedirect;
