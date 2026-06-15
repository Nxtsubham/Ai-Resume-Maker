import React, { useState } from "react";
import { Resume } from "../types";
import { Printer, MapPin, Mail, Phone, Globe, Linkedin, FileDown } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

interface ResumePreviewProps {
  resume: Resume;
}

export const ResumePreview: React.FC<ResumePreviewProps> = ({ resume }) => {
  const { personalInfo, summary, experience, education, skills, templateId } = resume;
  const [downloading, setDownloading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById("resume-sheet");
    if (!element) return;

    setDownloading(true);

    // 1. Store original stylesheet HTML and inline styles to restore later
    const styleElements = Array.from(document.querySelectorAll("style"));
    const originalStyles = styleElements.map((el) => el.innerHTML);

    const elementsWithInlineStyle = Array.from(element.querySelectorAll("[style]"));
    const originalInlineStyles = elementsWithInlineStyle.map((el) => el.getAttribute("style") || "");

    // Helper to convert OKLCH color strings to safe HSL strings that html2canvas can parse
    const convertOklchToHsl = (cssText: string) => {
      const oklchRegex = /oklch\(\s*([\d.%]+)\s+([\d.%]+)\s+([\d.%]+)(?:\s*[\/]\s*([\d.%]+))?\s*\)/gi;
      return cssText.replace(oklchRegex, (match, lStr, cStr, hStr, aStr) => {
        const lNum = parseFloat(lStr);
        const cNum = parseFloat(cStr);
        const hNum = parseFloat(hStr);
        const aNum = aStr ? parseFloat(aStr) : null;

        // Normalize lightness (0-1 or 0-100%)
        const l = (lStr.includes("%") || lNum > 1) ? lNum / 100 : lNum;
        // Normalize chroma (typically 0-0.4)
        const c = cStr.includes("%") ? parseFloat(cStr) / 100 : cNum;
        // Normalize hue (0-360)
        const h = hStr.includes("%") ? (parseFloat(hStr) / 100) * 360 : hNum;

        // Map L (0-1) to HSL Lightness percentage (0-100%)
        const lPercent = Math.max(0, Math.min(100, Math.round(l * 100)));
        // Map Chroma (0-0.4) to HSL Saturation percentage (0-100%)
        const sPercent = Math.max(0, Math.min(100, Math.round((c / 0.4) * 100)));
        const hDeg = Math.max(0, Math.min(360, Math.round(h)));

        if (aNum !== null) {
          const a = aStr.includes("%") ? parseFloat(aStr) / 100 : aNum;
          return `hsla(${hDeg}, ${sPercent}%, ${lPercent}%, ${a})`;
        }
        return `hsl(${hDeg}, ${sPercent}%, ${lPercent}%)`;
      });
    };

    try {
      // 2. Temporarily convert OKLCH to HSL in all stylesheets
      styleElements.forEach((el) => {
        try {
          el.innerHTML = convertOklchToHsl(el.innerHTML);
        } catch (e) {
          console.warn("Could not patch style element inline content", e);
        }
      });

      // 3. Temporarily convert OKLCH to HSL in inline styles
      elementsWithInlineStyle.forEach((el, index) => {
        const currentStyle = el.getAttribute("style") || "";
        el.setAttribute("style", convertOklchToHsl(currentStyle));
      });

      // Small delay to let any rendering/styles settle
      await new Promise((resolve) => setTimeout(resolve, 150));

      const canvas = await html2canvas(element, {
        scale: 2, // Scale up for crisp vector quality text
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const imgWidth = 210; // A4 standard width in mm
      const pageHeight = 297; // A4 standard height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;

      // Handle multi-page documents seamlessly
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= pageHeight;
      }

      const formattedName = (personalInfo.fullName || "Resume").replace(/\s+/g, "_");
      pdf.save(`${formattedName}_CV.pdf`);
    } catch (err) {
      console.error("Error generating high fidelity PDF:", err);
    } finally {
      // 4. Restore original styles to guarantee preview matches original design perfectly
      styleElements.forEach((el, index) => {
        try {
          el.innerHTML = originalStyles[index];
        } catch (e) {
          console.warn("Could not restore original style element", e);
        }
      });

      elementsWithInlineStyle.forEach((el, index) => {
        if (originalInlineStyles[index]) {
          el.setAttribute("style", originalInlineStyles[index]);
        } else {
          el.removeAttribute("style");
        }
      });

      setDownloading(false);
    }
  };

  // Base typography styles matching our design principles
  const getTemplateStyles = () => {
    switch (templateId) {
      case "minimalist":
        return {
          container: "bg-white p-8 md:p-12 text-zinc-900 font-sans max-w-[21cm] mx-auto min-h-[29.7cm] shadow-xs border border-zinc-100",
          name: "text-3xl font-mono uppercase tracking-widest text-zinc-950 font-bold border-b border-zinc-950 pb-3 mb-4",
          sectionHeader: "text-xs font-mono uppercase tracking-widest text-zinc-500 font-semibold border-b border-zinc-200 pb-1 mb-3 mt-6",
          metaText: "text-xs font-mono text-zinc-500",
          bodyText: "text-sm text-zinc-700 leading-relaxed",
          companyTitle: "font-semibold text-zinc-900 text-sm",
          roleTitle: "text-zinc-600 text-sm italic",
          skillPill: "bg-zinc-100 text-zinc-800 text-xs font-mono px-2 py-1 rounded-sm border border-zinc-200",
        };
      case "executive":
        return {
          container: "bg-white p-8 md:p-12 text-slate-900 font-sans max-w-[21cm] mx-auto min-h-[29.7cm] shadow-xs border border-slate-100",
          name: "text-3xl font-serif text-indigo-950 font-bold tracking-tight mb-2",
          sectionHeader: "text-sm font-semibold uppercase tracking-wider text-indigo-900 border-b-2 border-indigo-900 pb-1 mb-4 mt-6",
          metaText: "text-xs text-slate-500 font-medium",
          bodyText: "text-sm text-slate-700 leading-relaxed",
          companyTitle: "font-semibold text-slate-900 text-sm",
          roleTitle: "text-indigo-800 text-sm font-medium",
          skillPill: "bg-indigo-50 text-indigo-950 text-xs px-2.5 py-1 rounded-md border border-indigo-100 font-medium",
        };
      case "modern":
      default:
        return {
          container: "bg-white p-8 md:p-12 text-slate-800 font-sans max-w-[21cm] mx-auto min-h-[29.7cm] shadow-xs border border-slate-100",
          name: "text-4xl text-slate-900 font-extrabold tracking-tight mb-1",
          sectionHeader: "text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2 border-b-2 border-slate-100 pb-1.5 mb-4 mt-6",
          metaText: "text-xs text-slate-500",
          bodyText: "text-sm text-slate-600 leading-relaxed",
          companyTitle: "font-bold text-slate-900 text-sm",
          roleTitle: "text-blue-600 font-semibold text-sm",
          skillPill: "bg-slate-50 text-slate-700 text-xs px-2.5 py-1 rounded-full border border-slate-200",
        };
    }
  };

  const styles = getTemplateStyles();

  return (
    <div className="relative group/preview mt-4">
      {/* Print Action Overlay for Screen */}
      <div className="absolute right-4 top-4 z-10 print:hidden opacity-90 hover:opacity-100 transition-opacity flex items-center gap-2">
        <button
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs px-3.5 py-2 rounded-lg font-bold shadow-sm transition-all focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
          id="download-pdf-btn"
        >
          {downloading ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
              Generating PDF...
            </>
          ) : (
            <>
              <FileDown className="w-3.5 h-3.5 text-white" />
              Download as PDF
            </>
          )}
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs px-3.5 py-2 rounded-lg font-bold shadow-sm transition-all focus:ring-2 focus:ring-zinc-700 cursor-pointer"
          id="print-resume-btn"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / Print Page
        </button>
      </div>

      {/* Actual A4 Sized Sheet Area */}
      <div className={styles.container} id="resume-sheet">
        {/* Header Contact Block */}
        <div className="mb-6">
          <h1 className={styles.name}>{personalInfo.fullName || "Your Full Name"}</h1>
          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-2 text-xs text-slate-500">
            {personalInfo.email && (
              <span className="flex items-center gap-1.5 font-medium">
                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                {personalInfo.email}
              </span>
            )}
            {personalInfo.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-zinc-400" />
                {personalInfo.phone}
              </span>
            )}
            {personalInfo.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                {personalInfo.location}
              </span>
            )}
            {personalInfo.website && (
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-zinc-400" />
                {personalInfo.website}
              </span>
            )}
            {personalInfo.linkedin && (
              <span className="flex items-center gap-1.5">
                <Linkedin className="w-3.5 h-3.5 text-zinc-400" />
                {personalInfo.linkedin}
              </span>
            )}
          </div>
        </div>

        {/* Summary Block */}
        {summary && (
          <div className="mb-4">
            <h2 className={styles.sectionHeader}>Professional Summary</h2>
            <p className={styles.bodyText}>{summary}</p>
          </div>
        )}

        {/* Experience Block */}
        {experience && experience.length > 0 && (
          <div className="mb-4">
            <h2 className={styles.sectionHeader}>Work Experience</h2>
            <div className="space-y-4">
              {experience.map((exp) => (
                <div key={exp.id} className="relative">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-1">
                    <div>
                      <span className={styles.companyTitle}>{exp.company}</span>
                      <span className="mx-2 text-zinc-300">|</span>
                      <span className={styles.roleTitle}>{exp.role}</span>
                    </div>
                    <span className={styles.metaText}>
                      {exp.startDate} – {exp.current ? "Present" : exp.endDate}
                    </span>
                  </div>
                  <p className={`${styles.bodyText} whitespace-pre-line`}>{exp.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education Block */}
        {education && education.length > 0 && (
          <div className="mb-4">
            <h2 className={styles.sectionHeader}>Education</h2>
            <div className="space-y-3">
              {education.map((edu) => (
                <div key={edu.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                  <div>
                    <span className="font-semibold text-zinc-900 text-sm">
                      {edu.school}
                    </span>
                    {edu.degree && (
                      <span className="text-zinc-600 text-sm italic">
                        {" "}({edu.degree} {edu.fieldOfStudy && `in ${edu.fieldOfStudy}`})
                      </span>
                    )}
                  </div>
                  <span className={styles.metaText}>
                    {edu.startDate} – {edu.current ? "Present" : edu.endDate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills Block */}
        {skills && skills.length > 0 && (
          <div>
            <h2 className={styles.sectionHeader}>Core Expertises & Skills</h2>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, index) => (
                <span key={index} className={styles.skillPill}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Styled Printable Styles Overwrite */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #resume-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            background: white !important;
          }
          /* Hide screen-only controls */
          .print\\:hidden, 
          #app-sidebar, 
          #editor-panel, 
          #control-header, 
          #toast-container {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};
export default ResumePreview;
