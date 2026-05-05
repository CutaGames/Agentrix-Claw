import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/admin/products', permanent: false },
});

export default function ConsoleMerchantProductsRedirect(): null {
  return null;
}
