import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/pay/commission-demo', permanent: false },
});

export default function ConsoleCommissionRedirect(): null {
  return null;
}
