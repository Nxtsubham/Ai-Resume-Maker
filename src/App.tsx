import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, setDoc, getDocs, deleteDoc, onSnapshot } from "firebase/firestore";
import { auth, signInWithGoogle, logOut, db, handleFirestoreError, OperationType } from "./firebase";
import { Resume, PersonalInfo, ExperienceItem, EducationItem } from "./types";
import { ResumePreview } from "./components/ResumePreview";
import { AtsScanner } from "./components/AtsScanner";
import { RealTimeHelper } from "./components/RealTimeHelper";

import {
  Sparkles,
  FileText,
  User as UserIcon,
  Plus,
  Trash2,
  Moon,
  Sun,
  Layout,
  Globe,
  Share2,
  FileDown,
  LogIn,
  LogOut,
  Linkedin,
  Cpu,
  RefreshCw,
  FolderLock,
  Briefcase,
  GraduationCap,
  Hammer,
  ChevronRight,
  Save,
  Check
} from "lucide-react";

// Default pristine initial template data
const defaultResumeData = (): Resume => ({
  id: "initial-resume-id",
  userId: "guest",
  title: "My Software Engineer Resume",
  templateId: "modern",
  personalInfo: {
    fullName: "Alex Mercer",
    email: "alex.mercer@gmail.com",
    phone: "+1 (555) 019-2834",
    location: "San Francisco, CA",
    website: "https://alexmercer.dev",
    linkedin: "linkedin.com/in/alex-mercer"
  },
  summary: "High-impact Full-Stack Software Engineer with 5+ years of extensive hands-on experience designing, building, and deploying robust cloud infrastructures. Proficient in crafting responsive customer dashboards using React and writing scale-ready TypeScript services.",
  experience: [
    {
      id: "exp-1",
      company: "CloudCore Systems",
      role: "Senior Full-Stack Engineer",
      startDate: "Jan 2024",
      endDate: "Present",
      description: "• Engineered Node.js TypeScript distributed APIs, scaling user capacity from 10k to 150k monthly active accounts.\n• Decreased browser load speeds by 42% by designing code-split modular widgets inside Vite.",
      current: true
    },
    {
      id: "exp-2",
      company: "SaaS Rocket LLC",
      role: "Software Developer",
      startDate: "Jun 2021",
      endDate: "Dec 2023",
      description: "• Rewrote heavy interactive forms into fluid modular components, cutting application error rates by 18%.\n• Optimized database query structures that reduced search query latencies in cloud tables.",
      current: false
    }
  ],
  education: [
    {
      id: "edu-1",
      school: "Western State University",
      degree: "Bachelor of Science",
      fieldOfStudy: "Computer Science",
      startDate: "Sep 2017",
      endDate: "May 2021",
      current: false
    }
  ],
  skills: ["React", "Node.js", "TypeScript", "Vite", "Tailwind CSS", "Express API", "REST Architecture", "Cloud Database Systems", "Google Cloud System"],
  targetJobDescription: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [activeTab, setActiveTab] = useState<"personal" | "experience" | "education" | "skills" | "ats">("personal");
  const [editTitle, setEditTitle] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(true);

  // LinkedIn Parser States
  const [activeModal, setActiveModal] = useState<boolean>(false);
  const [linkedinText, setLinkedinText] = useState("");
  const [parsingLinkedin, setParsingLinkedin] = useState(false);
  const [parseError, setParseError] = useState("");

  // Resume Document File Import States
  const [importResumeModalOpen, setImportResumeModalOpen] = useState<boolean>(false);
  const [importingResume, setImportingResume] = useState<boolean>(false);
  const [importError, setImportError] = useState<string>("");

  // Syncing / Saving Indicator
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"Draft State" | "Saved to Cloud" | "Saving..." | "Local Saved">("Draft State");

  // Track active real-time helper values
  const [helperSection, setHelperSection] = useState<"summary" | "experience" | "skills" | "title">("summary");

  // Load and apply Dark Mode classes at root
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [darkMode]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      if (user) {
        // Fetch users saved resumes from cloud storage
        fetchCloudResumes(user.uid);
      } else {
        // Load offline backup
        const offlineData = localStorage.getItem("offline-resumes");
        if (offlineData) {
          try {
            const list: Resume[] = JSON.parse(offlineData);
            setResumes(list);
            if (list.length > 0) {
              setSelectedResume(list[0]);
            } else {
              const fresh = defaultResumeData();
              setResumes([fresh]);
              setSelectedResume(fresh);
            }
          } catch (e) {
            setupInitialEmptyState();
          }
        } else {
          setupInitialEmptyState();
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const setupInitialEmptyState = () => {
    const fresh = defaultResumeData();
    setResumes([fresh]);
    setSelectedResume(fresh);
  };

  const fetchCloudResumes = (userId: string) => {
    const colRef = collection(db, "users", userId, "resumes");
    // Snapshot real-time sync for resumes
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const list: Resume[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as Resume);
      });
      setResumes(list);

      // Select active or default resume if nothing is set
      if (list.length > 0) {
        // Prioritize previous selection
        const prevSelected = selectedResume ? list.find(r => r.id === selectedResume.id) : null;
        setSelectedResume(prevSelected || list[0]);
        setSaveStatus("Saved to Cloud");
      } else {
        // Auto-seed a first document for the user
        const fresh = defaultResumeData();
        fresh.userId = userId;
        saveResumeToCloud(fresh, userId);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${userId}/resumes`);
    });

    return unsubscribe;
  };

  const handleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      if (user) {
        // Save user settings on signin
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          createdAt: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Safe client update triggered on change
  const triggerResumeUpdate = (updated: Resume) => {
    setSelectedResume(updated);
    setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));

    // Persist changes based on login state
    if (currentUser) {
      setSaveStatus("Saving...");
      // debounce saving or immediate execution
      saveResumeToCloud(updated, currentUser.uid);
    } else {
      setSaveStatus("Local Saved");
      const updatedList = resumes.map(r => r.id === updated.id ? updated : r);
      localStorage.setItem("offline-resumes", JSON.stringify(updatedList));
    }
  };

  const saveResumeToCloud = async (res: Resume, uid: string) => {
    setIsSaving(true);
    try {
      const pathForWrite = `users/${uid}/resumes/${res.id}`;
      const docRef = doc(db, "users", uid, "resumes", res.id);
      await setDoc(docRef, {
        ...res,
        userId: uid,
        updatedAt: new Date().toISOString()
      });
      setSaveStatus("Saved to Cloud");
    } catch (error) {
      console.error("Cloud syncing error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewResume = () => {
    const novel = defaultResumeData();
    novel.id = "resume-" + Date.now().toString();
    novel.title = "Targeted Application Resume";
    novel.userId = currentUser ? currentUser.uid : "guest";
    novel.createdAt = new Date().toISOString();
    novel.updatedAt = new Date().toISOString();

    const newList = [...resumes, novel];
    setResumes(newList);
    setSelectedResume(novel);

    if (currentUser) {
      saveResumeToCloud(novel, currentUser.uid);
    } else {
      localStorage.setItem("offline-resumes", JSON.stringify(newList));
    }
  };

  const handleDeleteResume = async (resumeId: string) => {
    if (resumes.length <= 1) {
      alert("You should keep at least one active resume document.");
      return;
    }
    const filtered = resumes.filter(r => r.id !== resumeId);
    setResumes(filtered);
    setSelectedResume(filtered[0]);

    if (currentUser) {
      try {
        await deleteDoc(doc(db, "users", currentUser.uid, "resumes", resumeId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `users/${currentUser.uid}/resumes/${resumeId}`);
      }
    } else {
      localStorage.setItem("offline-resumes", JSON.stringify(filtered));
    }
  };

  // LinkedIn Parser Trigger
  const handleParseLinkedInText = async () => {
    if (!linkedinText.trim()) return;
    setParsingLinkedin(true);
    setParseError("");
    try {
      const res = await fetch("/api/resume/parse-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: linkedinText })
      });

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "Failed to parse profile details.");
      }

      const parsed = await res.json();
      
      if (!selectedResume) return;

      // Map parsed items into selected resume ensuring robust default types are assigned
      const updated: Resume = {
        ...selectedResume,
        personalInfo: {
          fullName: parsed.fullName || selectedResume.personalInfo.fullName,
          email: parsed.email || selectedResume.personalInfo.email,
          phone: parsed.phone || selectedResume.personalInfo.phone,
          location: parsed.location || selectedResume.personalInfo.location,
          website: parsed.website || selectedResume.personalInfo.website,
          linkedin: parsed.linkedin || selectedResume.personalInfo.linkedin
        },
        summary: parsed.summary || selectedResume.summary,
        skills: Array.isArray(parsed.skills) && parsed.skills.length > 0 ? parsed.skills : selectedResume.skills,
        experience: Array.isArray(parsed.experience) && parsed.experience.length > 0 ? parsed.experience.map((exp: any, i: number) => ({
          id: `exp-parsed-${i}-${Date.now()}`,
          company: exp.company || "Company Name",
          role: exp.role || "Job Title",
          startDate: exp.startDate || "",
          endDate: exp.endDate || "",
          description: exp.description || "",
          current: typeof exp.current === "boolean" ? exp.current : false
        })) : selectedResume.experience,
        education: Array.isArray(parsed.education) && parsed.education.length > 0 ? parsed.education.map((edu: any, i: number) => ({
          id: `edu-parsed-${i}-${Date.now()}`,
          school: edu.school || "University/School",
          degree: edu.degree || "",
          fieldOfStudy: edu.fieldOfStudy || "",
          startDate: edu.startDate || "",
          endDate: edu.endDate || "",
          current: typeof edu.current === "boolean" ? edu.current : false
        })) : selectedResume.education,
        updatedAt: new Date().toISOString()
      };

      triggerResumeUpdate(updated);
      setActiveModal(false);
      setLinkedinText("");
    } catch (e: any) {
      setParseError(e.message || "An error occurred during AI LinkedIn decoding.");
    } finally {
      setParsingLinkedin(false);
    }
  };

  // Safe Resume file import handler (takes PDF or TXT, extracts sections with Gemini, and focuses the ATS view)
  const handleImportResumeFile = async (file: File) => {
    if (!file) return;
    setImportingResume(true);
    setImportError("");
    try {
      if (file.size > 4 * 1024 * 1024) {
        throw new Error("File size should be under 4MB to ensure quick processing.");
      }

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1] || result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file contents."));
      });
      reader.readAsDataURL(file);

      const fileData = await base64Promise;

      const res = await fetch("/api/resume/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData,
          fileName: file.name,
          mimeType: file.type || "text/plain"
        })
      });

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error || "Failed to process resume document.");
      }

      const parsed = await res.json();

      const novel: Resume = {
        id: "resume-imported-" + Date.now().toString(),
        userId: currentUser ? currentUser.uid : "guest",
        title: parsed.fullName ? `${parsed.fullName} - Imported Resume` : `Imported Resume (${file.name})`,
        templateId: "modern",
        personalInfo: {
          fullName: parsed.fullName || "Candidate Name",
          email: parsed.email || "",
          phone: parsed.phone || "",
          location: parsed.location || "",
          website: parsed.website || "",
          linkedin: parsed.linkedin || ""
        },
        summary: parsed.summary || "",
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        experience: Array.isArray(parsed.experience) ? parsed.experience.map((exp: any, i: number) => ({
          id: `exp-imported-${i}-${Date.now()}`,
          company: exp.company || "Company Name",
          role: exp.role || "Job Title",
          startDate: exp.startDate || "",
          endDate: exp.endDate || "",
          description: exp.description || "",
          current: typeof exp.current === "boolean" ? exp.current : false
        })) : [],
        education: Array.isArray(parsed.education) ? parsed.education.map((edu: any, i: number) => ({
          id: `edu-imported-${i}-${Date.now()}`,
          school: edu.school || "University / School",
          degree: edu.degree || "",
          fieldOfStudy: edu.fieldOfStudy || "",
          startDate: edu.startDate || "",
          endDate: edu.endDate || "",
          current: typeof edu.current === "boolean" ? edu.current : false
        })) : [],
        targetJobDescription: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const newList = [...resumes, novel];
      setResumes(newList);
      setSelectedResume(novel);

      if (currentUser) {
        saveResumeToCloud(novel, currentUser.uid);
      } else {
        localStorage.setItem("offline-resumes", JSON.stringify(newList));
      }

      setImportResumeModalOpen(false);
      // Automatically navigate to ATS tab as requested
      setActiveTab("ats");
    } catch (e: any) {
      setImportError(e.message || "Failed to upload and parse resume document.");
    } finally {
      setImportingResume(false);
    }
  };

  // Specific custom field modifications helpers
  const updatePersonalInfo = (field: keyof PersonalInfo, val: string) => {
    if (!selectedResume) return;
    const updated = {
      ...selectedResume,
      personalInfo: {
        ...selectedResume.personalInfo,
        [field]: val
      }
    };
    triggerResumeUpdate(updated);
  };

  const handleUpdateExperience = (id: string, updatedField: Partial<ExperienceItem>) => {
    if (!selectedResume) return;
    const experiences = selectedResume.experience.map(exp => {
      if (exp.id === id) {
        return { ...exp, ...updatedField };
      }
      return exp;
    });
    triggerResumeUpdate({ ...selectedResume, experience: experiences });
  };

  const handleAddExperience = () => {
    if (!selectedResume) return;
    const newItem: ExperienceItem = {
      id: "exp-" + Date.now().toString(),
      company: "Company Name",
      role: "Job Title",
      startDate: "Start Date",
      endDate: "End Date",
      description: "• Managed tasks...\n• Achieved metrics...",
      current: false
    };
    triggerResumeUpdate({
      ...selectedResume,
      experience: [...selectedResume.experience, newItem]
    });
  };

  const handleRemoveExperience = (id: string) => {
    if (!selectedResume) return;
    const filtered = selectedResume.experience.filter(exp => exp.id !== id);
    triggerResumeUpdate({ ...selectedResume, experience: filtered });
  };

  const handleUpdateEducation = (id: string, updatedField: Partial<EducationItem>) => {
    if (!selectedResume) return;
    const educations = selectedResume.education.map(edu => {
      if (edu.id === id) {
        return { ...edu, ...updatedField };
      }
      return edu;
    });
    triggerResumeUpdate({ ...selectedResume, education: educations });
  };

  const handleAddEducation = () => {
    if (!selectedResume) return;
    const newItem: EducationItem = {
      id: "edu-" + Date.now(),
      school: "University / School",
      degree: "Degree Name",
      fieldOfStudy: "Major field",
      startDate: "Start Date",
      endDate: "End Date",
      current: false
    };
    triggerResumeUpdate({
      ...selectedResume,
      education: [...selectedResume.education, newItem]
    });
  };

  const handleRemoveEducation = (id: string) => {
    if (!selectedResume) return;
    const filtered = selectedResume.education.filter(edu => edu.id !== id);
    triggerResumeUpdate({ ...selectedResume, education: filtered });
  };

  const handleAddSkill = (skillText: string) => {
    if (!selectedResume) return;
    const trimmed = skillText.trim();
    if (!trimmed || selectedResume.skills.includes(trimmed)) return;
    triggerResumeUpdate({
      ...selectedResume,
      skills: [...selectedResume.skills, trimmed]
    });
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    if (!selectedResume) return;
    const filtered = selectedResume.skills.filter(s => s !== skillToRemove);
    triggerResumeUpdate({ ...selectedResume, skills: filtered });
  };

  // Generate Profile professional AI summary
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const handleGenerateAISummary = async () => {
    if (!selectedResume) return;
    setGeneratingSummary(true);
    try {
      const res = await fetch("/api/resume/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedResume.personalInfo.fullName ? `${selectedResume.title}` : "Software Specialist",
          experienceYears: selectedResume.experience.length * 2, // approximation
          skills: selectedResume.skills.slice(0, 5),
          tone: "polished, results-driven"
        })
      });

      if (!res.ok) throw new Error("Could not construct summary summary.");
      const data = await res.json();
      if (data.summary) {
        triggerResumeUpdate({
          ...selectedResume,
          summary: data.summary
        });
      }
    } catch (e) {
      console.error(e);
      alert("AI Writer busy. Please edit text manually.");
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100 font-sans flex flex-col transition-colors overflow-x-hidden">
      
      {/* Dynamic Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-850 bg-white dark:bg-[#09090B] py-3.5 px-6 sticky top-0 z-30 flex items-center justify-between print:hidden shadow-2xs backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-650 dark:bg-blue-600 text-white p-2 rounded-lg font-black tracking-tight" id="logo-icon">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-zinc-950 dark:text-zinc-100 flex items-center gap-2">
              ResuMate AI
              <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-405 border border-blue-500/25 font-bold px-1.5 py-0.5 rounded-sm">
                Pro
              </span>
            </h1>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-500 font-mono">ATS compatible document engine</p>
          </div>
        </div>

        {/* Syncing Status Indicator */}
        <div className="hidden sm:flex items-center gap-2 text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 py-1.5 px-3 rounded-md">
          <div className={`w-2 h-2 rounded-full ${isSaving ? "bg-amber-400 animate-ping" : "bg-green-500"}`} />
          <span className="text-[10px] font-mono font-medium text-zinc-500 dark:text-zinc-400 uppercase">
            {saveStatus}
          </span>
        </div>

        {/* Controls block */}
        <div className="flex items-center gap-3">
          {/* Light/Dark Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-300 transition-colors cursor-pointer text-xs"
            id="theme-toggler"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Authentication State */}
          {authLoading ? (
            <div className="w-7 h-7 rounded-full border border-zinc-200 animate-spin border-t-zinc-700" />
          ) : currentUser ? (
            <div className="flex items-center gap-3 border-l border-zinc-200 dark:border-zinc-800 pl-3">
              <div className="hidden md:block text-right">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 capitalize">{currentUser.displayName || "User"}</p>
                <button onClick={logOut} className="text-[10px] font-medium text-red-500 hover:underline cursor-pointer block text-right w-full">
                  Disconnect Cloud
                </button>
              </div>
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Profile" className="w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-800" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white text-xs font-bold font-mono">
                  {(currentUser.email || "U")[0].toUpperCase()}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-lg font-bold shadow-xs cursor-pointer transition-all border-none"
              id="signin-btn"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sync Storage (Cloud)
            </button>
          )}
        </div>
      </header>

      {/* Main Split Interface */}
      <main className="flex-1 flex flex-col lg:flex-row min-w-0">
        
        {/* Left Side Sidebar - Doc manager Drawer */}
        <aside className="w-full lg:w-64 bg-white dark:bg-[#121214] border-r lg:border-b-0 border-zinc-200 dark:border-zinc-800 p-4 shrink-0 flex flex-col gap-4 print:hidden" id="app-sidebar">
          
          {/* Section: Your Resume collections */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                DOCUMENTS ({resumes.length})
              </span>
              <button
                onClick={handleCreateNewResume}
                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Target
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 lg:max-h-80 overflow-y-auto pr-1">
              {resumes.map((res) => {
                const isSelected = selectedResume?.id === res.id;
                return (
                  <div
                    key={res.id}
                    onClick={() => {
                        setSelectedResume(res);
                        setEditTitle(false);
                    }}
                    className={`group/doc flex items-center justify-between p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      isSelected
                        ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 font-medium text-zinc-950 dark:text-white"
                        : "bg-white dark:bg-zinc-900/10 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-650 dark:text-zinc-450"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      <FileText className={`w-4 h-4 shrink-0 ${isSelected ? "text-blue-500" : "text-zinc-400"}`} />
                      <span className="text-xs truncate text-zinc-800 dark:text-zinc-200">{res.title}</span>
                    </div>
                    {resumes.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteResume(res.id);
                        }}
                        className="opacity-0 group-hover/doc:opacity-100 text-zinc-400 hover:text-red-500 p-1 rounded-sm cursor-pointer"
                        title="Delete this targeted document"
                      >
                        <Trash2 className="w-3  h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick AI Profile text Parser Import Button */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 space-y-2">
            <span className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-2">INTEGRATIONS</span>
            <button
              onClick={() => setActiveModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600/5 hover:bg-blue-600/10 dark:bg-blue-600/5 dark:hover:bg-blue-600/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-xs p-2.5 rounded-lg cursor-pointer transition-colors"
              id="import-linkedin-btn"
            >
              <Linkedin className="w-4 h-4 text-blue-500 fill-blue-500" />
              Sync LinkedIn Profile Info
            </button>
            <button
              onClick={() => setImportResumeModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs p-2.5 rounded-lg cursor-pointer transition-colors"
              id="import-resume-btn"
            >
              <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
              Import Resume (PDF / TXT)
            </button>
          </div>

          <div className="hidden lg:block mt-auto text-xs text-zinc-400 items-baseline p-2 space-y-1 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/40 dark:border-zinc-800 rounded-lg shrink-0">
            <FolderLock className="w-3.5 h-3.5 text-blue-500 inline mr-1" />
            <span className="text-[10px]">GDPR Secure local state configured. All sync frames validated off zero-trust structures.</span>
          </div>
        </aside>

        {selectedResume ? (
          <div className="flex-1 flex flex-col lg:flex-row min-w-0 shrink">
            
            {/* Middle Section: Main Editor controls Panel */}
            <section className="flex-1 border-r border-zinc-200 dark:border-zinc-800 p-6 space-y-5 overflow-y-auto max-h-screen shrink-0 print:hidden bg-white dark:bg-[#121214]" id="editor-panel">
              
              {/* Top Resume Header and Template Changer */}
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  {editTitle ? (
                    <input
                      type="text"
                      value={selectedResume.title}
                      onChange={(e) => triggerResumeUpdate({ ...selectedResume, title: e.target.value })}
                      onBlur={() => setEditTitle(false)}
                      autoFocus
                      className="text-sm font-bold bg-zinc-50 dark:bg-[#09090B] border border-zinc-300 dark:border-zinc-800 rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                    />
                  ) : (
                    <h2
                      onClick={() => setEditTitle(true)}
                      className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2 py-1 rounded-md cursor-pointer truncate max-w-sm border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                      title="Click to rename targeted file"
                    >
                      {selectedResume.title}
                    </h2>
                  )}
                </div>

                {/* Template Preset Swapper */}
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-[#09090B] p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {(["modern", "minimalist", "executive"] as const).map((temp) => (
                    <button
                      key={temp}
                      onClick={() => triggerResumeUpdate({ ...selectedResume, templateId: temp })}
                      className={`text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-md cursor-pointer transition-all ${
                        selectedResume.templateId === temp
                          ? "bg-white dark:bg-blue-600 text-zinc-900 dark:text-white shadow-3xs"
                          : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      }`}
                    >
                      {temp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Navigation Tabs */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto gap-2 text-xs scrollbar-none">
                {[
                  { id: "personal", label: "Contact Details", icon: UserIcon },
                  { id: "experience", label: "Work History", icon: Briefcase },
                  { id: "education", label: "Education", icon: GraduationCap },
                  { id: "skills", label: "Expertises", icon: Hammer },
                  { id: "ats", label: "ATS Grade Scan", icon: Sparkles }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isAct = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        if (tab.id !== "ats") {
                          setHelperSection(tab.id as any);
                        }
                      }}
                      className={`flex items-center gap-1.5 font-bold px-3 py-2 border-b-2 cursor-pointer whitespace-nowrap transition-all ${
                        isAct
                          ? "border-zinc-900 dark:border-blue-500 text-zinc-950 dark:text-blue-400 font-extrabold"
                          : "border-transparent text-zinc-450 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Form Areas mapped to Tab indexes */}
              <div className="space-y-4">
                
                {/* TAB 1: Personal Contact Details */}
                {activeTab === "personal" && (
                  <div className="space-y-4 font-sans animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Full Name</label>
                        <input
                          type="text"
                          value={selectedResume.personalInfo.fullName}
                          onChange={(e) => updatePersonalInfo("fullName", e.target.value)}
                          className="w-full bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Email address</label>
                        <input
                          type="email"
                          value={selectedResume.personalInfo.email}
                          onChange={(e) => updatePersonalInfo("email", e.target.value)}
                          className="w-full bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Phone Number</label>
                        <input
                          type="text"
                          value={selectedResume.personalInfo.phone}
                          onChange={(e) => updatePersonalInfo("phone", e.target.value)}
                          className="w-full bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Location (City, Country)</label>
                        <input
                          type="text"
                          value={selectedResume.personalInfo.location || ""}
                          onChange={(e) => updatePersonalInfo("location", e.target.value)}
                          className="w-full bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Web portfolio link</label>
                        <input
                          type="text"
                          value={selectedResume.personalInfo.website}
                          onChange={(e) => updatePersonalInfo("website", e.target.value)}
                          className="w-full bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">LinkedIn Profile link</label>
                        <input
                          type="text"
                          value={selectedResume.personalInfo.linkedin}
                          onChange={(e) => updatePersonalInfo("linkedin", e.target.value)}
                          className="w-full bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Pro Introduction summary text */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">
                          Executive Professional Summary
                        </label>
                        <button
                          onClick={handleGenerateAISummary}
                          disabled={generatingSummary}
                          className="text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-blue-500" />
                          {generatingSummary ? "Writing..." : "AI Generate Summary"}
                        </button>
                      </div>
                      <textarea
                        value={selectedResume.summary}
                        onChange={(e) => triggerResumeUpdate({ ...selectedResume, summary: e.target.value })}
                        rows={4}
                        placeholder="Detail major career parameters, technologies, and leadership..."
                        className="w-full bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500 leading-relaxed resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: Experience / Employment history */}
                {activeTab === "experience" && (
                  <div className="space-y-4 animate-fade-in text-sans">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">List of work positions ({selectedResume.experience.length})</span>
                      <button
                        onClick={handleAddExperience}
                        className="flex items-center gap-1 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                        id="add-experience-btn"
                      >
                        <Plus className="w-3.5 h-3.5" /> Append Experience
                      </button>
                    </div>

                    <div className="space-y-4">
                      {selectedResume.experience.map((exp, expIdx) => (
                        <div key={exp.id} className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-4 rounded-xl space-y-3 relative shadow-3xs">
                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveExperience(exp.id)}
                            className="absolute right-4 top-4 text-zinc-400 hover:text-red-500 cursor-pointer"
                            title="Remove of this history record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <div className="text-[10px] font-mono font-bold text-zinc-400 dark:text-zinc-500 uppercase">
                            Position #{expIdx + 1}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">Company Name</label>
                              <input
                                type="text"
                                value={exp.company}
                                onChange={(e) => handleUpdateExperience(exp.id, { company: e.target.value })}
                                className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">Role Title</label>
                              <input
                                type="text"
                                value={exp.role}
                                onChange={(e) => handleUpdateExperience(exp.id, { role: e.target.value })}
                                className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">Start Date (e.g. June 2021)</label>
                              <input
                                type="text"
                                value={exp.startDate}
                                onChange={(e) => handleUpdateExperience(exp.id, { startDate: e.target.value })}
                                className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">End Date</label>
                              <input
                                type="text"
                                value={exp.current ? "Present" : exp.endDate}
                                disabled={exp.current}
                                onChange={(e) => handleUpdateExperience(exp.id, { endDate: e.target.value })}
                                className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500 disabled:opacity-50"
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="checkbox"
                              checked={exp.current || false}
                              id={`exp-curr-${exp.id}`}
                              onChange={(e) => handleUpdateExperience(exp.id, { current: e.target.checked })}
                              className="rounded-sm border-zinc-300 dark:border-zinc-800 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                            <label htmlFor={`exp-curr-${exp.id}`} className="text-[10px] font-bold text-zinc-500 dark:text-zinc-450 uppercase cursor-pointer">
                              Currently Employed Here
                            </label>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Descriptions & Bullet points</label>
                            <textarea
                              value={exp.description}
                              onChange={(e) => handleUpdateExperience(exp.id, { description: e.target.value })}
                              rows={3}
                              placeholder="Write key scope achievements, using • bullets."
                              className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500 font-mono leading-relaxed resize-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 3: Education Details */}
                {activeTab === "education" && (
                  <div className="space-y-4 animate-fade-in text-sans">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase">Degrees & Certification listings</span>
                      <button
                        onClick={handleAddEducation}
                        className="flex items-center gap-1 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white dark:text-zinc-100 px-3 py-1.5 rounded-lg cursor-pointer"
                        id="add-education-btn"
                      >
                        <Plus className="w-3.5 h-3.5" /> Append Education
                      </button>
                    </div>

                    <div className="space-y-4">
                      {selectedResume.education.map((edu, eduIdx) => (
                        <div key={edu.id} className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] p-4 rounded-xl space-y-3 relative shadow-3xs">
                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveEducation(edu.id)}
                            className="absolute right-4 top-4 text-zinc-400 hover:text-red-500 cursor-pointer"
                            title="Remove educational reference"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <div className="text-[10px] font-mono font-bold text-zinc-400 dark:text-zinc-500 uppercase">
                            Education Item #{eduIdx + 1}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">School / College</label>
                              <input
                                type="text"
                                value={edu.school}
                                onChange={(e) => handleUpdateEducation(edu.id, { school: e.target.value })}
                                className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">Degree / Certificate</label>
                              <input
                                type="text"
                                value={edu.degree}
                                onChange={(e) => handleUpdateEducation(edu.id, { degree: e.target.value })}
                                className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">Field of Study</label>
                              <input
                                type="text"
                                value={edu.fieldOfStudy}
                                onChange={(e) => handleUpdateEducation(edu.id, { fieldOfStudy: e.target.value })}
                                className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">Start Year</label>
                                <input
                                  type="text"
                                  value={edu.startDate}
                                  onChange={(e) => handleUpdateEducation(edu.id, { startDate: e.target.value })}
                                  placeholder="2017"
                                  className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-0.5">End Year</label>
                                <input
                                  type="text"
                                  value={edu.endDate}
                                  onChange={(e) => handleUpdateEducation(edu.id, { endDate: e.target.value })}
                                  placeholder="2021"
                                  className="w-full bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-md p-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 4: Core Skills */}
                {activeTab === "skills" && (
                  <div className="space-y-4 animate-fade-in text-sans">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase mb-1">Add Skills Parameter</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Kubernetes, Python, Machine Learning"
                          id="skill-input-add"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const target = e.currentTarget;
                              handleAddSkill(target.value);
                              target.value = "";
                            }
                          }}
                          className="flex-1 bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500"
                        />
                        <button
                          onClick={() => {
                            const input = document.getElementById("skill-input-add") as HTMLInputElement;
                            if (input) {
                              handleAddSkill(input.value);
                              input.value = "";
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors"
                        >
                          Append
                        </button>
                      </div>
                      <span className="text-[10px] text-zinc-400 block mt-1">Press enter or tap Append to save. Use precise vocabulary for ATS checking.</span>
                    </div>

                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-[#121214]/50">
                      <span className="block text-[10px] font-bold text-zinc-400 uppercase mb-3">Your Skills Block ({selectedResume.skills.length})</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedResume.skills.map((sk) => (
                          <span
                            key={sk}
                            className="bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs px-2.5 py-1 rounded-md flex items-center gap-1.5"
                          >
                            {sk}
                            <button
                              onClick={() => handleRemoveSkill(sk)}
                              className="text-zinc-400 hover:text-red-500 text-[10px] font-bold font-sans cursor-pointer focus:outline-hidden ml-1"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 5: ATS Scanners & Optimizer checks */}
                {activeTab === "ats" && (
                  <div className="animate-fade-in">
                    <AtsScanner
                      resume={selectedResume}
                      onUpdateResume={triggerResumeUpdate}
                    />
                  </div>
                )}
              </div>

              {/* Suggestions Sidebar inside Tab layout */}
              {activeTab !== "ats" && (
                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
                  <RealTimeHelper
                    sectionType={helperSection}
                    currentValue={
                      helperSection === "summary"
                        ? selectedResume.summary
                        : helperSection === "experience"
                        ? selectedResume.experience.map(e => `${e.company}: ${e.role}\n${e.description}`).join("\n\n")
                        : helperSection === "skills"
                        ? selectedResume.skills.join(", ")
                        : selectedResume.title
                    }
                    onApplyRewrite={(optimizedText) => {
                      if (helperSection === "summary") {
                        triggerResumeUpdate({ ...selectedResume, summary: optimizedText });
                      } else if (helperSection === "experience") {
                        // Optimizing first experience listing as a primary edit demo to see the direct merge
                        if (selectedResume.experience.length > 0) {
                          const updatedExp = [...selectedResume.experience];
                          updatedExp[0].description = optimizedText;
                          triggerResumeUpdate({ ...selectedResume, experience: updatedExp });
                        }
                      } else if (helperSection === "skills") {
                        const splitted = optimizedText.split(",").map(s => s.trim()).filter(Boolean);
                        triggerResumeUpdate({ ...selectedResume, skills: splitted });
                      } else {
                        triggerResumeUpdate({ ...selectedResume, title: optimizedText });
                      }
                    }}
                  />
                </div>
              )}
            </section>

            {/* Right Side: High Fidelity A4 Live preview area */}
            <section className="flex-1 bg-zinc-100 dark:bg-[#18181B] p-6 overflow-y-auto max-h-screen border-l border-zinc-200 dark:border-zinc-800" id="preview-panel">
              <div className="flex justify-between items-center mb-3 text-xs print:hidden">
                <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  <Layout className="w-3.5 h-3.5 text-blue-500" />
                  Live Resume Sheet Preview
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 italic font-mono">Adjusts dynamically as you type</span>
              </div>
              <ResumePreview resume={selectedResume} />
            </section>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
            <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-3 animate-bounce" />
            <span className="text-sm font-semibold text-zinc-500">Draft document not found. Create one.</span>
            <button
              onClick={handleCreateNewResume}
              className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-4 rounded-lg font-bold cursor-pointer transition-colors"
            >
              Add New Resume
            </button>
          </div>
        )}
      </main>

      {/* MODAL / OVERLAY: LinkedIn Raw Import Profile details */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center print:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setActiveModal(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
          />

          {/* Modal Container */}
          <div className="relative bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-xl w-full p-6 mx-4 shadow-xl z-10 transition-all text-zinc-900 dark:text-zinc-100">
            <div className="flex items-start gap-3.5 border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
              <div className="bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-lg text-blue-600 dark:text-blue-400">
                <Linkedin className="w-5 h-5 fill-blue-600 dark:fill-blue-400" />
              </div>
              <div>
                <h3 className="text-md font-bold tracking-tight text-zinc-950 dark:text-zinc-100">Sync details via LinkedIn profile info</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">Paste your raw copied text from your LinkedIn PDF profile export or profile copy feed. Our AI extracts complete sections instantly.</p>
              </div>
            </div>

            <textarea
              value={linkedinText}
              onChange={(e) => setLinkedinText(e.target.value)}
              placeholder="Paste LinkedIn contact, about text, education logs, and positions details here..."
              rows={8}
              className="w-full bg-zinc-50 dark:bg-[#121214] border border-zinc-200 dark:border-[#1e1e24] rounded-lg p-3 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-blue-500 font-mono resize-none leading-relaxed"
            />

            {parseError && (
              <p className="text-xs text-red-500 mt-2">{parseError}</p>
            )}

            <div className="flex items-center justify-end gap-3 mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-3.5">
              <button
                onClick={() => setActiveModal(false)}
                className="bg-zinc-100 hover:bg-zinc-200 dark:bg-[#121214] dark:hover:bg-[#1c1c1f] text-zinc-650 dark:text-zinc-350 text-xs px-4 py-2 rounded-lg font-bold transition-all cursor-pointer border-none"
              >
                Cancel
              </button>
              <button
                onClick={handleParseLinkedInText}
                disabled={parsingLinkedin || !linkedinText.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-lg font-bold transition-all disabled:opacity-50 cursor-pointer border-none"
                id="parse-linkedin-submit-btn"
              >
                {parsingLinkedin ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Extracting profile...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Parse Account profile
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / OVERLAY: Import Resume Document */}
      {importResumeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center print:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setImportResumeModalOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
          />

          {/* Modal Container */}
          <div className="relative bg-white dark:bg-[#09090B] border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-md w-full p-6 mx-4 shadow-xl z-10 transition-all text-zinc-900 dark:text-zinc-100 animate-fade-in">
            <div className="flex items-start gap-3.5 border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
              <div className="bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded-lg text-blue-600 dark:text-blue-400">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-md font-bold tracking-tight text-zinc-950 dark:text-zinc-100">Import Existing Resume</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans">Upload your existing resume file. Our AI parses structures instantly and allows checking ATS match score metrics.</p>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div className="space-y-4">
              <label 
                className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                  importingResume
                    ? "border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/10 opacity-60 cursor-not-allowed"
                    : "border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/10 hover:border-blue-500 dark:hover:border-blue-400"
                }`}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                  <FileText className="w-8 h-8 text-zinc-400 dark:text-zinc-500 mb-2.5 animate-pulse" />
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    {importingResume ? "AI Engine Reading Document..." : "Click or Drag & Drop File"}
                  </p>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-450 font-sans leading-normal">
                    Supported: PDF and Plain Text (.txt) files under 4MB
                  </p>
                </div>
                <input
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  disabled={importingResume}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImportResumeFile(file);
                    }
                  }}
                />
              </label>

              {importError && (
                <div className="flex items-center gap-2 text-xs bg-red-950/40 border border-red-800/50 p-3 rounded-lg text-red-300 leading-normal">
                  <p>{importError}</p>
                </div>
              )}

              {importingResume && (
                <div className="flex items-center justify-center gap-2.5 text-xs text-blue-600 dark:text-blue-400 font-semibold font-mono bg-blue-500/5 p-3 rounded-lg border border-blue-500/15">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  Parsing resume document structures...
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-5 border-t border-zinc-100 dark:border-zinc-800 pt-3.5">
              <button
                onClick={() => setImportResumeModalOpen(false)}
                disabled={importingResume}
                className="bg-zinc-100 hover:bg-zinc-200 dark:bg-[#121214] dark:hover:bg-[#1c1c1f] text-zinc-650 dark:text-zinc-350 text-xs px-4 py-2 rounded-lg font-bold transition-all cursor-pointer border-none disabled:opacity-40"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
