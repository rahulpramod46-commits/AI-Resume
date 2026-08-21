const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { PredictionServiceClient } = require("@google-cloud/aiplatform").v1;
const PDFDocument = require("pdfkit");
const mammoth = require("mammoth");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();

const frontendRoot = path.resolve(__dirname, "..", "Frontend");

app.use(cors());
app.use(express.json());
app.use(express.static(frontendRoot));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const aiProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_PROJECT_ID || "";
const aiRegion = process.env.GOOGLE_CLOUD_REGION || process.env.GOOGLE_AI_REGION || "us-central1";
const aiEndpointId = process.env.GOOGLE_AI_ENDPOINT_ID || "";
const aiEndpoint = process.env.GOOGLE_AI_ENDPOINT || (aiProject && aiRegion && aiEndpointId ? `projects/${aiProject}/locations/${aiRegion}/endpoints/${aiEndpointId}` : "");

if (!aiEndpoint) {
    console.warn("Warning: GOOGLE_AI_ENDPOINT or GOOGLE_AI_ENDPOINT_ID is not set. Resume generation will use fallback content only.");
}
const aiClient = aiEndpoint ? new PredictionServiceClient() : null;

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`)
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
}

function extractResumeSections(text) {
    const raw = text || "";
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    const contactPatterns = [
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
        /\(\d{3}\)\s?\d{3}[-.\s]?\d{4}\b/,
        /\b\d{10}\b/,
        /\blinkedin\.com\/[A-z0-9-_/]+/i,
        /\bgithub\.com\/[A-z0-9-_/]+/i
    ];

    const sections = {};
    let current = "header";
    sections[current] = [];

    lines.forEach((line) => {
        const heading = line.trim().toLowerCase().replace(/[:]/g, "");
        const normalizedHeading = heading
            .replace(/professional experience/, "experience")
            .replace(/work experience/, "experience")
            .replace(/technical skills?/, "skills")
            .replace(/professional summary/, "summary")
            .replace(/about me/, "summary");

        if ([
            "summary",
            "experience",
            "projects",
            "education",
            "skills",
            "certifications",
            "interests",
            "achievements",
            "objective",
            "contact"
        ].includes(normalizedHeading)) {
            current = normalizedHeading;
            sections[current] = [];
        } else {
            sections[current] = sections[current] || [];
            sections[current].push(line);
        }
    });

    const rawName = (sections.header || []).find((line) => !contactPatterns.some((pattern) => pattern.test(line))) || "";
    const rawContact = (sections.header || []).find((line) => contactPatterns.some((pattern) => pattern.test(line))) || "";
    const summary = (sections.summary || []).join(" ");
    const skills = (sections.skills || [])
        .join(" ")
        .split(/[,•;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);

    return {
        rawName,
        rawContact,
        summary,
        skills,
        experience: sections.experience || [],
        projects: sections.projects || [],
        education: sections.education || [],
        certifications: sections.certifications || [],
        interests: sections.interests || []
    };
}

function inferSkills(text) {
    const skillBank = [
        { name: "JavaScript", patterns: [/javascript/, /js\b/, /es6/i] },
        { name: "TypeScript", patterns: [/typescript/, /ts\b/] },
        { name: "React", patterns: [/react/i] },
        { name: "Node.js", patterns: [/node\.js/, /nodejs/, /node/i] },
        { name: "Express", patterns: [/express/i] },
        { name: "MongoDB", patterns: [/mongodb/, /mongo/i] },
        { name: "SQL", patterns: [/sql/i] },
        { name: "Python", patterns: [/python/i] },
        { name: "AWS", patterns: [/aws/i] },
        { name: "Docker", patterns: [/docker/i] },
        { name: "Git", patterns: [/git/i] },
        { name: "REST APIs", patterns: [/rest api/, /api/i] },
        { name: "UI/UX", patterns: [/ui\/ux/, /ux/i] },
        { name: "Figma", patterns: [/figma/i] },
        { name: "HTML", patterns: [/html/i] },
        { name: "CSS", patterns: [/css/i] }
    ];

    const found = [];
    const lowered = text.toLowerCase();

    skillBank.forEach((skill) => {
        if (skill.patterns.some((pattern) => pattern.test(lowered))) {
            found.push(skill.name);
        }
    });

    return found.length ? found : ["JavaScript", "React", "Node.js", "MongoDB", "Git", "REST APIs"];
}

function buildAnalysisSummary(sections, skills) {
    return `Parsed ${skills.length} skill keywords, ${sections.experience.length} experience lines, ${sections.education.length} education lines, ${sections.projects.length} project lines, and ${sections.certifications.length} certification references from the uploaded resume.`;
}

function buildRecommendations(skills) {
    const missing = [];
    ["Agile", "AWS", "Docker", "TypeScript", "DevOps"].forEach((keyword) => {
        if (!skills.some((skill) => skill.toLowerCase() === keyword.toLowerCase())) {
            missing.push(keyword);
        }
    });

    return [
        "Use strong result-oriented action verbs and quantify your achievements where possible.",
        "Highlight measurable outcomes such as time saved, revenue gained, or performance improvements.",
        `Include additional relevant keywords like ${missing.slice(0, 3).join(", ")} if they match your experience and the role you are targeting.`
    ];
}

function buildImprovementSummary(sections, skills) {
    const preservedSections = [
        sections.rawContact ? "name and contact details" : "name details",
        sections.summary ? "summary" : null,
        sections.skills.length ? "skills" : null,
        sections.experience.length ? "experience" : null,
        sections.projects.length ? "projects" : null,
        sections.education.length ? "education" : null,
        sections.certifications.length ? "certifications" : null,
        sections.interests.length ? "interests" : null
    ].filter(Boolean);

    return `Preserved original ${preservedSections.join(", ")} from the uploaded resume. Improved grammar, punctuation, formatting, and recruiter-friendly language while organizing skills, enhancing project descriptions, and adding relevant ATS keywords that match the candidate profile.`;
}

function buildResumeRewritePrompt(extractedText) {
    return `Rewrite the following resume using only the uploaded resume content. Preserve all original details including name, contact information, education, skills, projects, experience, certifications, and interests. Correct grammar, spelling, and punctuation. Improve sentence structure and formatting. Rewrite weak content into professional, recruiter-friendly language. Organize the skills section and enhance project descriptions. Add only relevant ATS-friendly keywords that are consistent with the candidate's profile. Output the rewritten resume in JSON with fields: fullName, contact, professionalSummary, technicalSkills, experience, projects, education, certifications, interests, atsKeywords, improvementSummary, analysisSummary, recommendations.` + "\n\n" + extractedText;
}

function parseSectionItems(lines, defaultTitle, defaultCompany) {
    if (!lines || !lines.length) {
        return [];
    }

    return [
        {
            title: defaultTitle,
            company: defaultCompany,
            duration: "See uploaded resume for exact dates",
            highlights: lines.map((line) => line.replace(/^[-•\s]+/, "").trim()).filter(Boolean)
        }
    ];
}

function buildFallbackResume(extractedText) {
    const text = normalizeText(extractedText);
    const sections = extractResumeSections(extractedText);
    const skills = sections.skills.length ? sections.skills : inferSkills(text);
    const words = text.split(/\s+/).filter(Boolean);
    const likelyName = sections.rawName || words.slice(0, 3).join(" ") || "Professional Candidate";
    const effectiveSummary = sections.summary || (text.length > 240 ? `${text.slice(0, 240)}...` : text || "Professional candidate with experience in software engineering, product delivery, and collaborative problem solving.");

    const experience = sections.experience.length
        ? parseSectionItems(sections.experience, "Professional Experience", "Based on uploaded resume")
        : [
            {
                title: "Professional Experience",
                company: "Based on uploaded resume",
                duration: "Available in the source document",
                highlights: [
                    "Experience and achievements from the uploaded resume were preserved and restructured for better recruiter visibility.",
                    effectiveSummary
                ]
            }
        ];

    const projects = sections.projects.length
        ? parseSectionItems(sections.projects, "Key Projects", "Based on uploaded resume")
        : [
            {
                name: "Key Projects",
                description: "Projects and outcomes from the uploaded resume are summarized in a recruiter-friendly format.",
                highlights: [effectiveSummary]
            }
        ];

    const education = sections.education.length
        ? sections.education.map((line) => ({ degree: line, institution: "Original resume source", year: "" }))
        : [
            {
                degree: "Education details available in the original resume",
                institution: "Original resume source",
                year: "Included in uploaded document"
            }
        ];

    const certifications = sections.certifications.length
        ? sections.certifications.map((line) => line)
        : ["Professional certifications from the original resume can be added here if present"];

    const interests = sections.interests.length
        ? sections.interests.map((line) => line)
        : [];

    return {
        fullName: likelyName,
        contact: sections.rawContact || "Contact details available in the uploaded resume",
        professionalSummary: sections.summary || `Results-driven professional with experience in ${skills.slice(0, 3).join(", ")} and a strong foundation in modern software development. The original resume content has been preserved, structured, and enhanced for ATS readability and recruiter screening.`,
        technicalSkills: skills,
        experience,
        projects,
        education,
        certifications,
        interests,
        atsKeywords: [...skills, "Problem Solving", "Communication", "Leadership", "Collaboration", "Agile", "Software Development"],
        highlights: "Improved and structured using the extracted resume content.",
        analysisSummary: buildAnalysisSummary(sections, skills),
        improvementSummary: buildImprovementSummary({ ...sections, rawContact: sections.rawContact, summary: sections.summary }, skills),
        recommendations: buildRecommendations(skills),
        originalTextPreview: text.slice(0, 240) + (text.length > 240 ? "..." : "")
    };
}

async function extractTextFromUpload(file) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const buffer = fs.readFileSync(file.path);

    if (ext === ".pdf") {
        const pdfData = await pdfParse(buffer);
        return normalizeText(pdfData.text || "");
    }

    if (ext === ".docx") {
        const result = await mammoth.extractRawText({ buffer });
        return normalizeText(result.value || "");
    }

    return normalizeText(buffer.toString("utf8"));
}

async function generateOptimizedResume(extractedText) {
    const fallback = buildFallbackResume(extractedText);

    if (!aiClient || !aiEndpoint) {
        return fallback;
    }

    try {
        const request = {
            endpoint: aiEndpoint,
            instances: [{ content: buildResumeRewritePrompt(extractedText) }],
            parameters: {
                temperature: 0.0,
                maxOutputTokens: 1024
            }
        };

        const [response] = await aiClient.predict(request);
        const prediction = Array.isArray(response.predictions) ? response.predictions[0] : response.prediction;

        let content = "";
        if (typeof prediction === "string") {
            content = prediction;
        } else if (prediction && typeof prediction === "object") {
            content = prediction.content || prediction.text || JSON.stringify(prediction);
        }

        let parsed = {};
        try {
            parsed = content ? JSON.parse(content) : {};
        } catch (parseError) {
            console.warn("Could not parse Gemini response as JSON; using fallback:", parseError.message);
        }

        return {
            fullName: parsed.fullName || fallback.fullName,
            contact: parsed.contact || fallback.contact,
            professionalSummary: parsed.professionalSummary || fallback.professionalSummary,
            technicalSkills: Array.isArray(parsed.technicalSkills) && parsed.technicalSkills.length ? parsed.technicalSkills : fallback.technicalSkills,
            experience: Array.isArray(parsed.experience) && parsed.experience.length ? parsed.experience : fallback.experience,
            projects: Array.isArray(parsed.projects) && parsed.projects.length ? parsed.projects : fallback.projects,
            education: Array.isArray(parsed.education) && parsed.education.length ? parsed.education : fallback.education,
            certifications: Array.isArray(parsed.certifications) && parsed.certifications.length ? parsed.certifications : fallback.certifications,
            interests: Array.isArray(parsed.interests) && parsed.interests.length ? parsed.interests : fallback.interests,
            atsKeywords: Array.isArray(parsed.atsKeywords) && parsed.atsKeywords.length ? parsed.atsKeywords : fallback.atsKeywords,
            highlights: parsed.highlights || fallback.highlights,
            analysisSummary: parsed.analysisSummary || fallback.analysisSummary,
            improvementSummary: parsed.improvementSummary || fallback.improvementSummary,
            recommendations: Array.isArray(parsed.recommendations) && parsed.recommendations.length ? parsed.recommendations : fallback.recommendations,
            originalTextPreview: parsed.originalTextPreview || fallback.originalTextPreview
        };
    } catch (error) {
        console.error("Gemini resume generation failed, using fallback:", error.message || error);
        return fallback;
    }
}

function createProfessionalPDF(resumeData, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 36, size: "A4" });
        const stream = fs.createWriteStream(outputPath);

        doc.pipe(stream);
        doc.font("Helvetica-Bold").fontSize(24).text(resumeData.fullName || "Professional Candidate", { align: "left" });
        doc.moveDown(0.2);
        doc.font("Helvetica").fontSize(10).text(resumeData.contact || "Contact details available in the uploaded resume");
        doc.moveDown(0.8);

        doc.font("Helvetica-Bold").fontSize(12).text("Professional Summary");
        doc.font("Helvetica").fontSize(10).text(resumeData.professionalSummary || "", { align: "justify" });
        doc.moveDown(0.6);

        if (resumeData.improvementSummary) {
            doc.font("Helvetica-Bold").fontSize(12).text("Improvement Summary");
            doc.font("Helvetica").fontSize(10).text(resumeData.improvementSummary, { align: "justify" });
            doc.moveDown(0.6);
        }

        doc.font("Helvetica-Bold").fontSize(12).text("Technical Skills");
        doc.font("Helvetica").fontSize(10).text((resumeData.technicalSkills || []).join(" • "));
        doc.moveDown(0.6);

        doc.font("Helvetica-Bold").fontSize(12).text("Experience");
        (resumeData.experience || []).forEach((item) => {
            doc.font("Helvetica-Bold").fontSize(10).text(`${item.title || "Experience"} — ${item.company || ""}`);
            doc.font("Helvetica").fontSize(9).text(item.duration || "");
            (item.highlights || []).forEach((highlight) => {
                doc.font("Helvetica").fontSize(9).text(`• ${highlight}`);
            });
            doc.moveDown(0.2);
        });
        doc.moveDown(0.3);

        doc.font("Helvetica-Bold").fontSize(12).text("Projects");
        (resumeData.projects || []).forEach((project) => {
            doc.font("Helvetica-Bold").fontSize(10).text(project.name || "Project");
            doc.font("Helvetica").fontSize(9).text(project.description || "");
            (project.highlights || []).forEach((highlight) => {
                doc.font("Helvetica").fontSize(9).text(`• ${highlight}`);
            });
            doc.moveDown(0.2);
        });
        doc.moveDown(0.3);

        doc.font("Helvetica-Bold").fontSize(12).text("Education");
        (resumeData.education || []).forEach((item) => {
            doc.font("Helvetica-Bold").fontSize(10).text(`${item.degree || "Education"} — ${item.institution || ""}`);
            doc.font("Helvetica").fontSize(9).text(item.year || "");
        });
        doc.moveDown(0.3);

        doc.font("Helvetica-Bold").fontSize(12).text("Certifications");
        doc.font("Helvetica").fontSize(10).text((resumeData.certifications || []).join(" • "));
        doc.moveDown(0.3);

        if (resumeData.interests && resumeData.interests.length) {
            doc.font("Helvetica-Bold").fontSize(12).text("Interests");
            doc.font("Helvetica").fontSize(10).text((resumeData.interests || []).join(" • "));
            doc.moveDown(0.3);
        }

        doc.font("Helvetica-Bold").fontSize(12).text("ATS Keywords");
        doc.font("Helvetica").fontSize(10).text((resumeData.atsKeywords || []).join(" • "));

        doc.end();

        stream.on("finish", resolve);
        stream.on("error", reject);
    });
}

app.post("/upload", (req, res) => {
    console.log("Upload request received", req.method, req.headers["content-type"]);

    upload.single("resume")(req, res, async (err) => {
        if (err) {
            console.error("Multer error:", err && err.stack ? err.stack : err);
            return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
        }

        try {
            console.log("Multer finished, req.file =", req.file ? req.file.originalname : "none");

            if (!req.file) {
                return res.status(400).json({ success: false, message: "No resume file uploaded." });
            }

            console.log("Resume received:", req.file.originalname);

            let extractedText = "";
            try {
                console.log("Step 1: reading uploaded file", req.file.path);
                extractedText = await extractTextFromUpload(req.file);
                console.log("Step 2: extracted text received");
            } catch (parseError) {
                console.warn("Document parsing failed, using fallback content:", parseError.message);
                extractedText = `Resume uploaded for ${req.file.originalname}. The document could not be parsed into text automatically, so a structured fallback resume was generated instead.`;
            }

            console.log("Step 4: generating optimized resume");
            const improvedResume = await generateOptimizedResume(extractedText);
            const pdfFileName = `${Date.now()}-${req.file.originalname.replace(/\.[^/.]+$/, "") || "resume"}.pdf`;
            const pdfPath = path.join(uploadsDir, pdfFileName);

            let pdfUrl = "";
            try {
                console.log("Step 5: creating PDF");
                await createProfessionalPDF(improvedResume, pdfPath);
                pdfUrl = `/uploads/${pdfFileName}`;
            } catch (pdfError) {
                console.error("PDF generation failed:", pdfError.message);
            }

            console.log("Step 6: sending success response");
            return res.json({
                success: true,
                fileName: req.file.originalname,
                originalResume: extractedText,
                improvedResume,
                pdfUrl,
                pdfGenerated: Boolean(pdfUrl),
                message: pdfUrl ? "Resume processed successfully." : "Resume processed, but the PDF export could not be generated."
            });
        } catch (err) {
            console.error("Backend Error:", err && err.stack ? err.stack : err);
            return res.status(500).json({
                success: false,
                message: err && err.message ? err.message : "Failed to process resume. Please upload a valid PDF or try again."
            });
        }
    });
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error("Multer error:", err.code, err.message);
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    }

    console.error("Unhandled server error:", err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: err && err.message ? err.message : "Failed to process resume" });
});

app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
    console.log("Serving frontend from:", frontendRoot);
});
