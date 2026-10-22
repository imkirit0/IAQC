"use client";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

type Toast = { id: number; msg: string; bad?: boolean };
const ToastCtx = createContext<(msg: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, bad }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), bad ? 6000 : 3200);
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <ToastCtx.Provider value={push}>
        {children}
        <div className="toasts" aria-live="polite">
          <AnimatePresence>
            {toasts.map(t => (
              <motion.div key={t.id} layout className={`toast${t.bad ? " bad" : ""}`} role={t.bad ? "alert" : "status"}
                initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}>
                <Icon name={t.bad ? "alert" : "tick"} /><span>{t.msg}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ToastCtx.Provider>
    </MotionConfig>
  );
}
