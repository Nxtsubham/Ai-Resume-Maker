import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Initialize Gemini client on the server side
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// Error wrapper helper
function runAsync(fn: (req: express.Request, res: express.Response) => Promise<any>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res).catch(next);
  };
}

// 1. Health Status endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    apiKeyConfigured: !!apiKey,
    timestamp: new Date().toISOString()
  });
});

// 2. Parse LinkedIn endpoint (extracts LinkedIn text/markdown content to resume sections)
app.post("/api/resume/parse-linkedin", runAsync(async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API key is not configured inside server secrets." });
  }

  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Please provide non-empty plain text copied from a LinkedIn profile or export." });
  }

  const prompt = `
    Analyze the following raw copy-pasted text from a LinkedIn profile or PDF export. Extract the information into a structured resume format.
    Fill out contact details (full name, email, phone, location, linkedin profile link), a summary, list of experience items, education items, and core skills.
    Infer dates cleanly if available (e.g. "June 2021" or "2023").

    IMPORTANT: If some sections (such as experience, education, or skills) are completely missing or not available in the raw text, please return them as empty arrays rather than failing or omitting the keys. Do not fail if details are missing; extract as much as possible.

    RAW TEXT FROM LINKEDIN:
    ---
    ${text}
    ---
  `;

  const parsedSchema = {
    type: Type.OBJECT,
    properties: {
      fullName: { type: Type.STRING },
      email: { type: Type.STRING },
      phone: { type: Type.STRING },
      location: { type: Type.STRING },
      linkedin: { type: Type.STRING },
      summary: { type: Type.STRING },
      experience: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            company: { type: Type.STRING },
            role: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING },
            description: { type: Type.STRING },
            current: { type: Type.BOOLEAN }
          },
          required: ["company", "role"]
        }
      },
      education: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            school: { type: Type.STRING },
            degree: { type: Type.STRING },
            fieldOfStudy: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING }
          },
          required: ["school"]
        }
      },
      skills: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    },
    required: ["fullName"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: parsedSchema,
      systemInstruction: "You are an expert LinkedIn profile parser. Safely parse and cleanse messy string feeds."
    }
  });

  const parsedData = JSON.parse(response.text?.trim() || "{}");
  res.json(parsedData);
}));

// 2b. Import Resume document endpoint (analyzes files like PDF and TXT into structured resume sections)
app.post("/api/resume/import", runAsync(async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API key is not configured inside server secrets." });
  }

  const { fileData, mimeType, fileName } = req.body;
  if (!fileData) {
    return res.status(400).json({ error: "Please provide base64 resume file content." });
  }

  const prompt = `
    Analyze the uploaded resume document. Extract the user's information and format it into a structured resume JSON schema.
    Ensure that you capture the candidate's full name, email, phone, location, a professional summary, list of experiences (company, role, startDate, endDate, description, current), education items, and core skills.
    
    If any section is missing or sparse, provide clean default empty strings or representation empty arrays. In descriptions, prioritize standard bullet points starting with '•'.
  `;

  let contents: any[] = [];
  if (mimeType === "application/pdf") {
    contents = [
      {
        inlineData: {
          mimeType: "application/pdf",
          data: fileData
        }
      },
      prompt
    ];
  } else {
    const textContent = Buffer.from(fileData, 'base64').toString('utf-8');
    contents = [
      prompt + `\n\nRESUME RAW CONTENT:\n${textContent}`
    ];
  }

  const parsedSchema = {
    type: Type.OBJECT,
    properties: {
      fullName: { type: Type.STRING },
      email: { type: Type.STRING },
      phone: { type: Type.STRING },
      location: { type: Type.STRING },
      website: { type: Type.STRING },
      linkedin: { type: Type.STRING },
      summary: { type: Type.STRING },
      experience: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            company: { type: Type.STRING },
            role: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING },
            description: { type: Type.STRING },
            current: { type: Type.BOOLEAN }
          },
          required: ["company", "role"]
        }
      },
      education: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            school: { type: Type.STRING },
            degree: { type: Type.STRING },
            fieldOfStudy: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING }
          },
          required: ["school"]
        }
      },
      skills: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    },
    required: ["fullName"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: parsedSchema,
      systemInstruction: "You are an elite corporate resume parsing algorithm. Extract structured information with high precision."
    }
  });

  const parsedData = JSON.parse(response.text?.trim() || "{}");
  res.json(parsedData);
}));

// 3. Optimize Resume keywords matching job description
app.post("/api/resume/optimize-keywords", runAsync(async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API key is not configured." });
  }

  const { resumeData, jobDescription } = req.body;
  if (!resumeData || !jobDescription) {
    return res.status(400).json({ error: "Missing resumeData or target jobDescription." });
  }

  const prompt = `
    Compare this user's current resume information with the targeted job description:
    
    RESUME:
    ${JSON.stringify(resumeData, null, 2)}
    
    TARGET JOB DESCRIPTION:
    ${jobDescription}
    
    Your task:
    1. Identify key missing professional keywords in the resume that are crucial in the Job Description.
    2. Suggest highly tailored, metric-driven optimized bullet points for their experience section that naturally weave in these missing keywords.
    3. Return suggestions for custom skills they should append to their core skill set.
  `;

  const optimizationSchema = {
    type: Type.OBJECT,
    properties: {
      optimizedBullets: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            company: { type: Type.STRING },
            role: { type: Type.STRING },
            originalBullets: { type: Type.STRING, description: "Brief original summary description of role" },
            suggestedBulletPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 highly optimized, targeted accomplishments incorporating missing keywords"
            }
          },
          required: ["company", "role", "suggestedBulletPoints"]
        }
      },
      suggestedSkillsToAdd: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Missing hard skills found in job description"
      },
      optimizationSummary: {
        type: Type.STRING,
        description: "Summary of changes and overall alignment feedback"
      }
    },
    required: ["optimizedBullets", "suggestedSkillsToAdd", "optimizationSummary"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: optimizationSchema,
      systemInstruction: "You are an elite Applicant Tracking System (ATS) optimization specialist who understands industry-specific vocabulary."
    }
  });

  const optimizedResult = JSON.parse(response.text?.trim() || "{}");
  res.json(optimizedResult);
}));

// 4. Check ATS compliance and matching details
app.post("/api/resume/check-ats", runAsync(async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API key is not configured." });
  }

  const { resumeData, jobDescription } = req.body;
  if (!resumeData || !jobDescription) {
    return res.status(400).json({ error: "Missing resumeData or target jobDescription." });
  }

  const prompt = `
    Conduct a realistic Applicant Tracking System (ATS) scan of the user's resume properties against the targeted job requirements.
    
    RESUME DATA:
    ${JSON.stringify(resumeData, null, 2)}
    
    JOB DESCRIPTION:
    ${jobDescription}
    
    Determine:
    1. A rigorous match score from 0 to 100 based on core qualifications, hard skills, education, and years of experience.
    2. List of exact match keywords.
    3. List of critical missing keywords.
    4. Construct specific, actionable structural and editing recommendations.
  `;

  const atsSchema = {
    type: Type.OBJECT,
    properties: {
      score: { type: Type.INTEGER, description: "ATS score out of 100" },
      matchingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
      missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
      recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["score", "matchingKeywords", "missingKeywords", "recommendations"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: atsSchema,
      systemInstruction: "You are an automated corporate ATS scanning processor checking compatibility filters."
    }
  });

  const scoreResult = JSON.parse(response.text?.trim() || "{}");
  res.json(scoreResult);
}));

// 5. Calculate real-time suggestions and improvements for raw text fields
app.post("/api/resume/realtime-suggestions", runAsync(async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API key is not configured." });
  }

  const { text, type } = req.body; // type can be 'summary', 'experience', or 'skills'
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Provide a valid input text string." });
  }

  const prompt = `
    Analyze this single section text (${type || "resume section"}) and provide:
    1. Crucial recommendations and grammar suggestions.
    2. Three premium, professional, metric-oriented rewrites that are highly impactful.

    INPUT TEXT:
    ${text}
  `;

  const suggestionsSchema = {
    type: Type.OBJECT,
    properties: {
      suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      rewrites: { type: Type.ARRAY, items: { type: Type.STRING } }
    },
    required: ["suggestions", "rewrites"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: suggestionsSchema,
      systemInstruction: "You are a professional executive resume writer and grammar editor."
    }
  });

  const suggestionsResult = JSON.parse(response.text?.trim() || "{}");
  res.json(suggestionsResult);
}));

// 6. Generate Profile Professional Summary
app.post("/api/resume/generate-summary", runAsync(async (req, res) => {
  if (!ai) {
    return res.status(500).json({ error: "Gemini API key is not configured." });
  }

  const { role, experienceYears, skills, tone } = req.body;
  const prompt = `
    Generate a concise, outstanding 3-to-4 sentence professional summary.
    Role: ${role || "Specialist"}
    Years of Experience: ${experienceYears || "0"} years
    Keywords/Skills: ${(skills || []).join(", ")}
    Tone: ${tone || "professional, metrics-focused"}
  `;

  const summarySchema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING }
    },
    required: ["summary"]
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: summarySchema,
      systemInstruction: "You create executive level resume summary introductions."
    }
  });

  const result = JSON.parse(response.text?.trim() || '{"summary": ""}');
  res.json(result);
}));

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
