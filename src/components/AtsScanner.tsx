import React, { useState } from "react";
import { AtsReport, OptimizeResponse, Resume } from "../types";
import { Scan, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, Check, HelpCircle, RefreshCw } from "lucide-react";

const COMMON_TECH_KEYWORDS = [
  "react", "node.js", "nodejs", "typescript", "javascript", "python", "java", "c++", "c#", "ruby", "rails",
  "go", "golang", "rust", "aws", "gcp", "azure", "docker", "kubernetes", "ci/cd", "sql", "postgresql",
  "mongodb", "redis", "graphql", "rest", "api", "html", "css", "tailwind", "sass", "git", "github",
  "scrum", "agile", "devops", "machine learning", "ai", "cloud", "security", "testing", "jest",
  "analytics", "pmp", "project management", "product management", "system design", "microservices",
  "linux", "nginx", "firebase", "firestore", "nosql", "vue", "angular", "next.js", "nextjs",
  "express", "fastapi", "django", "flask", "ui/ux", "figma", "cypress", "webpack", "redux"
];

interface AtsScannerProps {
  resume: Resume;
  onUpdateResume: (updated: Resume) => void;
}

export const AtsScanner: React.FC<AtsScannerProps> = ({ resume, onUpdateResume }) => {
  const [targetJob, setTargetJob] = useState(resume.targetJobDescription || "");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Optimization states
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResponse | null>(null);
  const [mergedBulletTracker, setMergedBulletTracker] = useState<Record<string, boolean>>({});

  // Real-time calculation of ATS matching keywords and score
  const getRealTimeKeywordsAnalysis = () => {
    if (!targetJob.trim()) {
      return { score: 0, matched: [], missing: [] };
    }

    const jobTextLower = targetJob.toLowerCase();
    
    // Aggregate full resume for keyword lookup
    const resumeTextContent = [
      resume.title,
      resume.summary,
      ...resume.skills,
      ...resume.experience.map(e => `${e.company} ${e.role} ${e.description}`),
      ...resume.education.map(e => `${e.school} ${e.degree} ${e.fieldOfStudy}`)
    ].join(" ").toLowerCase();

    // Match explicit skills defined by the user
    const explicitSkills = resume.skills.map(s => s.trim().toLowerCase()).filter(Boolean);
    
    // Find common tech keywords present in the target job description
    const keywordsInJobList = COMMON_TECH_KEYWORDS.filter(kw => jobTextLower.includes(kw));

    // Combine explicit skills that are also in the job description to form the target keywords list
    const jobSpecificUserSkills = explicitSkills.filter(s => jobTextLower.includes(s));
    
    // Form a unified search query list of unique terms/phrases
    const keywordsToMatch = Array.from(new Set([...keywordsInJobList, ...jobSpecificUserSkills]));

    if (keywordsToMatch.length === 0) {
      if (explicitSkills.length > 0) {
        const matchedSkills = explicitSkills.filter(s => jobTextLower.includes(s));
        const customScore = Math.round((matchedSkills.length / explicitSkills.length) * 100);
        return {
          score: customScore,
          matched: matchedSkills.map(s => resume.skills.find(os => os.toLowerCase() === s) || s),
          missing: explicitSkills.filter(s => !jobTextLower.includes(s)).map(s => resume.skills.find(os => os.toLowerCase() === s) || s)
        };
      }
      return { score: 0, matched: [], missing: [] };
    }

    const matched: string[] = [];
    const missing: string[] = [];

    keywordsToMatch.forEach(kw => {
      // Find original capitalization if possible (either from resume skills list or standard list)
      const displayKw = resume.skills.find(s => s.toLowerCase() === kw) || 
                        COMMON_TECH_KEYWORDS.find(s => s.toLowerCase() === kw) || 
                        kw;

      if (resumeTextContent.includes(kw)) {
        matched.push(displayKw);
      } else {
        missing.push(displayKw);
      }
    });

    const score = Math.round((matched.length / keywordsToMatch.length) * 100);
    return { score, matched, missing };
  };

  const rtAnalysis = getRealTimeKeywordsAnalysis();

  const handleScan = async () => {
    if (!targetJob.trim()) {
      setError("Please paste a job description first.");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/resume/check-ats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeData: {
            title: resume.title,
            personalInfo: resume.personalInfo,
            summary: resume.summary,
            experience: resume.experience,
            education: resume.education,
            skills: resume.skills
          },
          jobDescription: targetJob
        })
      });

      if (!res.ok) {
        const errPayload = await res.json();
        throw new Error(errPayload.error || "Failed to scan ATS metrics.");
      }

      const report: AtsReport = await res.json();
      
      // Update local resume object with the direct report
      onUpdateResume({
        ...resume,
        targetJobDescription: targetJob,
        atsReport: report
      });

      // Clear old optimizations when a new scan runs
      setOptimizeResult(null);
      setMergedBulletTracker({});
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred during the ATS scan.");
    } finally {
      setScanning(false);
    }
  };

  const handleFetchOptimizations = async () => {
    if (!targetJob.trim()) return;
    setOptimizing(true);
    setError(null);
    try {
      const res = await fetch("/api/resume/optimize-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeData: resume,
          jobDescription: targetJob
        })
      });

      if (!res.ok) {
        const errPayload = await res.json();
        throw new Error(errPayload.error || "Failed to generate AI keywords optimization.");
      }

      const data: OptimizeResponse = await res.json();
      setOptimizeResult(data);
    } catch (e: any) {
      setError(e.message || "Failed to generate optimized suggestions.");
    } finally {
      setOptimizing(false);
    }
  };

  const applyOptimizedBullet = (experienceId: string, suggestedText: string, indexKey: string) => {
    const updatedExperience = resume.experience.map(exp => {
      if (exp.id === experienceId) {
        return {
          ...exp,
          description: exp.description ? `${exp.description}\n• ${suggestedText}` : `• ${suggestedText}`
        };
      }
      return exp;
    });

    onUpdateResume({
      ...resume,
      experience: updatedExperience
    });

    setMergedBulletTracker(prev => ({
      ...prev,
      [indexKey]: true
    }));
  };

  const addMissingSkill = (skill: string) => {
    if (resume.skills.includes(skill)) return;
    onUpdateResume({
      ...resume,
      skills: [...resume.skills, skill]
    });
  };

  return (
    <div className="space-y-6">
      {/* Real-time Match Analysis Indicator */}
      {targetJob.trim() && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-white shadow-md space-y-4 animate-fade-in" id="real-time-ats-progress-bar">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scan className="w-5 h-5 text-blue-400 animate-pulse" />
              <div>
                <h3 className="text-sm font-bold tracking-tight text-zinc-100">Real-time Keyword Match Alignment</h3>
                <p className="text-[10px] text-zinc-400 font-sans">Updates instantly as you edit target requirements or skills</p>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-2xl font-extrabold font-mono ${
                rtAnalysis.score >= 80 ? "text-green-400" : rtAnalysis.score >= 50 ? "text-blue-400" : "text-amber-400"
              }`}>
                {rtAnalysis.score}%
              </span>
              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest font-mono">Real-time Grade</p>
            </div>
          </div>

          {/* Horizontal Progress Bar */}
          <div className="w-full bg-zinc-950 rounded-full h-3 border border-zinc-800 p-[2px]">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                rtAnalysis.score >= 80
                  ? "bg-green-500"
                  : rtAnalysis.score >= 50
                  ? "bg-blue-500"
                  : "bg-amber-500"
              }`}
              style={{ width: `${rtAnalysis.score}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 text-xs">
            {/* Detected Keywords */}
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-blue-400 uppercase">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                Real-time Matches ({rtAnalysis.matched.length})
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {rtAnalysis.matched.length > 0 ? (
                  rtAnalysis.matched.map((kw, i) => (
                    <span key={i} className="bg-blue-950/40 border border-blue-800/40 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-sm">
                      {kw}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-zinc-500 italic">No matching keywords found.</span>
                )}
              </div>
            </div>

            {/* Missing Keywords */}
            <div className="space-y-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-amber-400 uppercase">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Missing from Resume ({rtAnalysis.missing.length})
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {rtAnalysis.missing.length > 0 ? (
                  rtAnalysis.missing.map((kw, i) => (
                    <button
                      key={i}
                      onClick={() => addMissingSkill(kw)}
                      className="bg-amber-950/30 hover:bg-amber-950/60 border border-amber-900/30 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-sm cursor-pointer transition-colors text-left"
                      title="Click to quickly import into your skills set"
                    >
                      + {kw}
                    </button>
                  ))
                ) : (
                  <span className="text-[10px] text-zinc-500 italic">No missing typical keywords! Perfect.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target Job Box */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-white shadow-md">
        <label className="block text-sm font-semibold tracking-wide text-zinc-300 uppercase mb-3">
          1. Tagged Job Description
        </label>
        <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
          Paste the complete contents of the job description you are targeting. Our AI will grade compatibility, flag missing high-impact vocabulary keywords, and rewrite bullets.
        </p>

        <textarea
          value={targetJob}
          onChange={(e) => setTargetJob(e.target.value)}
          placeholder="Paste requirements, description, or qualifications here..."
          className="w-full h-36 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-hidden focus:border-zinc-500 font-sans leading-relaxed resize-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <button
            onClick={handleScan}
            disabled={scanning || !targetJob.trim()}
            className="flex items-center gap-2 bg-white hover:bg-zinc-150 text-zinc-950 text-xs px-4 py-2.5 rounded-lg font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            id="ats-check-score-btn"
          >
            {scanning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Analyzing ATS Filters...
              </>
            ) : (
              <>
                <Scan className="w-3.5 h-3.5" />
                Grade Matching ATS Score
              </>
            )}
          </button>

          {resume.atsReport && !scanning && (
            <button
              onClick={handleFetchOptimizations}
              disabled={optimizing}
              className="flex items-center gap-2 border border-zinc-700 bg-zinc-950 hover:bg-zinc-900 text-blue-400 hover:text-blue-300 text-xs px-4 py-2.5 rounded-lg font-bold transition-all cursor-pointer"
              id="ai-auto-optimize-btn"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              {optimizing ? "Generating AI Bullets..." : "Suggest AI Keyword Optimization"}
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2.5 text-sm bg-red-950/40 border border-red-800/60 p-3.5 rounded-lg text-red-300 mt-4 leading-normal">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Grade Scanner Score Results Card */}
      {resume.atsReport && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Circular Score display */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-white flex flex-col items-center justify-center text-center">
            <h3 className="text-zinc-400 text-xs font-bold tracking-wider uppercase mb-4">ATS Compatibility Score</h3>
            
            <div className="relative flex items-center justify-center w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="52"
                  strokeWidth="8"
                  stroke="currentColor"
                  className="text-zinc-800"
                  fill="transparent"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="52"
                  strokeWidth="8"
                  stroke="currentColor"
                  className={`${
                    resume.atsReport.score >= 80
                      ? "text-blue-400"
                      : resume.atsReport.score >= 55
                      ? "text-amber-400"
                      : "text-red-400"
                  }`}
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={2 * Math.PI * 52 * (1 - resume.atsReport.score / 100)}
                />
              </svg>
              <span className="absolute text-3xl font-extrabold tracking-tight font-mono text-zinc-150">
                {resume.atsReport.score}%
              </span>
            </div>

            <p className="text-xs text-zinc-400 mt-4 px-2 leading-relaxed">
              {resume.atsReport.score >= 80
                ? "🎯 Outstanding! Outstanding alignment. Ready to apply."
                : resume.atsReport.score >= 55
                ? "💡 Moderate match. Adding suggested keywords will boost response."
                : "⚠️ Low match. Inject hard skills and customized text below."}
            </p>
          </div>

          {/* Keywords lists */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-white">
            <h3 className="text-zinc-300 text-xs font-bold tracking-wider uppercase mb-4">ATS Filtering Analysis</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              {/* Matched Keywords */}
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-blue-400 uppercase">
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  Matched ({resume.atsReport.matchingKeywords?.length || 0})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {resume.atsReport.matchingKeywords && resume.atsReport.matchingKeywords.length > 0 ? (
                    resume.atsReport.matchingKeywords.map((kw, i) => (
                      <span key={i} className="bg-blue-950/50 border border-blue-800/50 text-blue-300 text-[11px] px-2 py-0.5 rounded-sm">
                        {kw}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-500 italic">No exact skill keywords verified yet.</span>
                  )}
                </div>
              </div>

              {/* Missing Keywords */}
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-amber-400 uppercase">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Missing ({resume.atsReport.missingKeywords?.length || 0})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {resume.atsReport.missingKeywords && resume.atsReport.missingKeywords.length > 0 ? (
                    resume.atsReport.missingKeywords.map((kw, i) => (
                      <button
                        key={i}
                        onClick={() => addMissingSkill(kw)}
                        title="Click to add as skill parameter"
                        className="bg-amber-950/40 hover:bg-amber-950/80 border border-amber-800/40 text-amber-300 text-[11px] px-2 py-0.5 rounded-sm transition-colors text-left cursor-pointer"
                      >
                        + {kw}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-500 italic">Excellent! No major missing skills flagged.</span>
                  )}
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="border-t border-zinc-800 pt-4">
              <span className="block text-xs font-bold tracking-wide text-zinc-400 uppercase mb-2">
                Actionable Recommendations
              </span>
              <ul className="space-y-1.5 max-h-32 overflow-y-auto text-xs text-zinc-300 pr-1 list-disc list-inside leading-relaxed">
                {resume.atsReport.recommendations && resume.atsReport.recommendations.map((rec, i) => (
                  <li key={i} className="text-zinc-300">{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* AI Suggested Keywords & Optimized bullet points Merger */}
      {optimizeResult && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-white shadow-md animate-fade-in">
          <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-4">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">AI-Generated Keyword Content Suggestions</h3>
              <p className="text-xs text-zinc-400 font-sans">Apply optimized accomplishment bullets derived from the target requirements directly to your resume sections.</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Optimized bullets map */}
            {optimizeResult.optimizedBullets && optimizeResult.optimizedBullets.length > 0 ? (
              optimizeResult.optimizedBullets.map((bullet, groupIndex) => {
                // Find matching experience item to relate by name/role
                const matchedExp = resume.experience.find(
                  (exp) =>
                    exp.company.toLowerCase().includes(bullet.company.toLowerCase()) ||
                    bullet.company.toLowerCase().includes(exp.company.toLowerCase())
                );

                if (!matchedExp) return null;

                return (
                  <div key={groupIndex} className="bg-zinc-950 border border-zinc-800/60 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-blue-400 tracking-wider uppercase">
                        {bullet.company} — {bullet.role}
                      </span>
                      <span className="text-[10px] text-zinc-500 italic">Matches work experience block</span>
                    </div>

                    <div className="space-y-2 mt-2">
                      {bullet.suggestedBulletPoints.map((text, textIndex) => {
                        const trackerKey = `${matchedExp.id}-${textIndex}`;
                        const isApplied = mergedBulletTracker[trackerKey];

                        return (
                          <div key={textIndex} className="flex gap-3 bg-zinc-900/50 p-2.5 rounded-sm border border-zinc-800/40">
                            <p className="text-xs text-zinc-300 leading-relaxed max-w-2xl">{text}</p>
                            <button
                              onClick={() => applyOptimizedBullet(matchedExp.id, text, trackerKey)}
                              disabled={isApplied}
                              className={`ml-auto shrink-0 flex items-center gap-1.5 text-[10px] uppercase font-bold py-1 px-2.5 rounded-sm cursor-pointer transition-all ${
                                isApplied
                                  ? "bg-blue-950 border border-blue-800 text-blue-400"
                                  : "bg-white text-zinc-950 hover:bg-zinc-150"
                              }`}
                            >
                              {isApplied ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  Applied
                                </>
                              ) : (
                                "Add Bullet"
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-zinc-500 italic">No specific experience matching company names identified in current experience listings for optimization. Try adding company fields first.</p>
            )}

            {/* Overall summary suggestion */}
            {optimizeResult.optimizationSummary && (
              <div className="border-t border-zinc-800 pt-4 mt-2">
                <span className="block text-xs font-bold text-zinc-400 uppercase mb-1">Keywords Matching Recommendation</span>
                <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">{optimizeResult.optimizationSummary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default AtsScanner;
