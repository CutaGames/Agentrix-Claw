import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/merchants/dashboard', permanent: false },
});

export default function ConsoleMerchantOrdersRedirect(): null {
  return null;
}
