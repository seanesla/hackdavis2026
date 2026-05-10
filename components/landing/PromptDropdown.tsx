"use client";
import { motion, AnimatePresence } from "framer-motion";
import PastPlans from "@/components/PastPlans";
import ChatHistoryBox from "@/components/ChatHistoryBox";
import ImportPlanButton from "@/components/ImportPlanButton";

type Props = {
  open: boolean;
  onLoadPrompt: (prompt: string) => void;
};

export default function PromptDropdown({ open, onLoadPrompt }: Props) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="dropdown"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden w-full"
        >
          <div className="mt-3 rounded-md border border-rule/60 bg-ink/40 backdrop-blur-md px-4 py-4 space-y-4">
            <PastPlans onLoad={onLoadPrompt} />
            <ChatHistoryBox />
            <div className="flex justify-center">
              <ImportPlanButton />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
