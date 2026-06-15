export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt?: string;
}

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  linkedin: string;
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  current: boolean;
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  current: boolean;
}

export interface AtsReport {
  score: number;
  matchingKeywords: string[];
  missingKeywords: string[];
  recommendations: string[];
}

export interface OptimizedBullet {
  company: string;
  role: string;
  originalBullets: string;
  suggestedBulletPoints: string[];
}

export interface OptimizeResponse {
  optimizedBullets: OptimizedBullet[];
  suggestedSkillsToAdd: string[];
  optimizationSummary: string;
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  templateId: 'modern' | 'minimalist' | 'executive';
  personalInfo: PersonalInfo;
  summary: string;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  targetJobDescription: string;
  atsReport?: AtsReport;
  createdAt: string;
  updatedAt: string;
}
