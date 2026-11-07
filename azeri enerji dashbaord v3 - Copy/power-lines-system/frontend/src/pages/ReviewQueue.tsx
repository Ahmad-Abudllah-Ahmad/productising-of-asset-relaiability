import { motion } from "framer-motion";
import { ClipboardList } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

export default function ReviewQueue() {
  const { t } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="min-h-[60vh] flex items-center justify-center"
    >
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-10 text-center backdrop-blur-sm max-w-2xl w-full">
        <ClipboardList className="mx-auto text-neutral-500 mb-4" size={48} />
        <h1 className="text-2xl font-bold text-white mb-2">{t("reviewQueue.title")}</h1>
        <p className="text-neutral-400 font-medium">{t("reviewQueue.comingSoon")}</p>
      </div>
    </motion.div>
  );
}
