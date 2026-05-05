import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/developers/console', permanent: false },
});

export default function ConsoleDeveloperRedirect(): null {
  return null;
}
