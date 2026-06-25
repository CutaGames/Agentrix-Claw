/**
 * Agentrix v4 PageTransition — wrap route changes with subtle fade-up animation.
 * Used in `_app.tsx` to give every route a polished entrance.
 */
import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/router';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={router.asPath}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
