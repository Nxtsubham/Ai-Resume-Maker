import React, { useState } from "react";
import { Sparkles, HelpCircle, RefreshCw, Check, ArrowRight } from "lucide-react";

interface RealTimeHelperProps {
  sectionType: "summary" | "experience" | "skills" | "title";
  currentValue: string;
  onApplyRewrite: (newValue: string) => void;
}

export const RealTimeHelper: React.FC<RealTimeHelperProps> = ({
  sectionType,
  currentValue,
  onApplyRewrite,
}) => {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [rewrites, setRewrites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);

  const getHelpfulText = () => {
    switch (sectionType) {
      case "summary":
        return "Need a punchy, executive-level bio summarizing your background? Get AI rewrites instantly.";
      case "experience":
        return "Include accomplishments with strong metrics (e.g., 'saved $5k', 'improved throughput 20%'). AI will rewrite.";
      case "skills":
        return "AI can review your skill lists to ensure standard spelling and group names.";
      case "title":
      default:
        return "AI can refine your resume file target name.";
    }
  };

  const handleFetchDrafts = async () => {
    if (!currentValue.trim()) {
      setError("Please write some initial draft text first so our AI has data to optimize.");
      return;
    }
    setLoading(true);
    setError(null);
    setAppliedIndex(null);
    try {
      const res = await fetch("/api/resume/realtime-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: currentValue,
          type: sectionType,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to consult AI suggestions.");
      }

      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setRewrites(data.rewrites || []);
    } catch (e: any) {
      setError("AI was unable to draft. Check connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (text: string, i: number) => {
    onApplyRewrite(text);
    setAppliedIndex(i);
  };

  return (
    <div className="bg-zinc-50 dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3.5 transition-all">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
          AI Suggestion Engine
        </span>
        <span className="ml-auto text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold px-1.5 py-0.5 rounded-sm">
          Active Section: {sectionType}
        </span>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        {getHelpfulText()}
      </p>

      {currentValue.trim().length > 0 ? (
        <button
          onClick={handleFetchDrafts}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121214] hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-800 dark:text-zinc-200 text-xs px-3 py-2 rounded-lg font-semibold transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Optimizing Text...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              Polish & Generate Executive Rewrites
            </>
          )}
        </button>
      ) : (
        <div className="text-[11px] bg-amber-500/5 text-amber-600 dark:text-amber-400/80 p-2 rounded-md leading-normal">
          Type or edit the {sectionType} text on the left to activate instant AI polishing commands!
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {/* Recommendations & Rewrites Area */}
      {(suggestions.length > 0 || rewrites.length > 0) && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-3 mt-1 animate-fade-in">
          {/* Advice */}
          {suggestions.length > 0 && (
            <div className="space-y-1">
              <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Structural Action Notes:
              </span>
              <ul className="list-disc list-inside text-xs text-zinc-650 dark:text-zinc-300 space-y-1 leading-normal">
                {suggestions.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Direct Rewrites */}
          {rewrites.length > 0 && (
            <div className="space-y-1.5">
              <span className="block text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                One-Click Professional Rewrites:
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {rewrites.map((rew, idx) => (
                  <div
                    key={idx}
                    className="group bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-lg flex gap-2 justify-between items-start hover:border-blue-500/45 dark:hover:border-blue-500/40 transition-all shadow-2xs"
                  >
                    <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed max-w-[85%] pr-1">
                      {rew}
                    </p>
                    <button
                      onClick={() => handleApply(rew, idx)}
                      disabled={appliedIndex === idx}
                      className={`shrink-0 flex items-center justify-center p-1.5 rounded-md cursor-pointer transition-all ${
                        appliedIndex === idx
                          ? "bg-blue-500/10 text-blue-500 scale-100"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-blue-600 hover:text-white"
                      }`}
                      title="Apply this rewrite text directly"
                    >
                      {appliedIndex === idx ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default RealTimeHelper;
