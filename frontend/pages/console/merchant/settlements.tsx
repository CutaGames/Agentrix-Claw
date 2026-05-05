import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/merchants/audit', permanent: false },
});

export default function ConsoleMerchantSettlementsRedirect(): null {
  return null;
}
