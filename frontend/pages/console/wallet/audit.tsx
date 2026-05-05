import React from 'react';
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/admin/audit', permanent: false },
});

export default function ConsoleAuditRedirect(): null {
  return null;
}
