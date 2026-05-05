import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/plugins', permanent: false },
});

export default function ConsoleMarketplacePluginsRedirect(): null {
  return null;
}
