import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/console/dashboard', permanent: false },
});

export default function ConsoleIndex() {
  return null;
}
