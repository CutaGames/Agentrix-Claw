import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/pay/checkout', permanent: false },
});

export default function ConsoleCheckoutRedirect(): null {
  return null;
}
