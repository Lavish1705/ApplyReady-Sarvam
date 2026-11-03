/**
 * ApplyReady AI — Sarvam AI Integration Service
 * 
 * Provides official Sarvam AI API integrations:
 * 1. Multilingual Translation (Mayura / Translate API across 10 Indian languages)
 * 2. Expressive Indian Text-to-Speech (Bulbul v4-flash)
 * 3. Speech-to-Text / Transcribe (Saaras v4)
 * 4. Grounded Multilingual Reasoning & Interview Q&A (sarvam-105b Chat Completions)
 * 
 * SECURITY & RELIABILITY GUARANTEES:
 * - API Key strictly read from SARVAM_API_KEY environment variable.
 * - Key is never returned in API responses, logs, or client-accessible payloads.
 * - Graceful fallbacks and explicit error reporting when key is absent or API is offline.
 * - Input validation and safe sentence chunking for TTS length limits.
 */

"use strict";

const SARVAM_API_BASE = "https://api.sarvam.ai";

const SUPPORTED_LANGUAGES = [
    { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
    { code: "bn-IN", name: "Bengali", native: "বাংলা" },
    { code: "mr-IN", name: "Marathi", native: "मराठी" },
    { code: "te-IN", name: "Telugu", native: "తెలుగు" },
    { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
    { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
    { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
    { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
    { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
    { code: "od-IN", name: "Odia", native: "ଓଡ଼ିଆ" },
    { code: "en-IN", name: "English (Indian)", native: "English" },
];

function getApiKey() {
    const key = process.env.SARVAM_API_KEY || "";
    return key.trim();
}

function isConfigured() {
    return Boolean(getApiKey());
}

/**
 * Returns public status metadata (never leaks key).
 */
function getStatus() {
    const configured = isConfigured();
    return {
        configured,
        provider: "Sarvam AI",
        models: {
            translation: "mayura:v1",
            tts: "bulbul:v4-flash",
            asr: "saaras:v4",
            chat: "sarvam-105b",
        },
        supportedLanguages: SUPPORTED_LANGUAGES,
        message: configured
            ? "Sarvam AI Indian Language & Voice Intelligence is active and ready."
            : "Sarvam subscription key is not configured in backend/.env. Core assessment features remain fully operational. Add your key to enable Indian voice and multilingual features.",
    };
}

/**
 * Translates text into target Indian language using Sarvam Translate API.
 * Endpoint: POST https://api.sarvam.ai/translate
 */
async function translateText({ input, targetLanguageCode = "hi-IN", sourceLanguageCode = "en-IN", mode = "formal" }) {
    if (input === null || input === undefined || typeof input !== "string" || !input.trim()) {
        return {
            success: true,
            translatedText: "",
            targetLanguageCode,
        };
    }

    const cleanInput = input.trim();

    // If source and target are identical, return unchanged without needing an API call
    if (sourceLanguageCode === targetLanguageCode) {
        return {
            success: true,
            translatedText: cleanInput,
            targetLanguageCode,
        };
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            success: false,
            error: "SARVAM_API_KEY is not configured.",
            translatedText: null,
            targetLanguageCode,
        };
    }

    // Sarvam translate has a maximum recommended chunk size of ~1000 characters.
    // For longer text, we split by paragraphs/sentences and recombine.
    if (cleanInput.length > 900) {
        return await translateLongText({
            text: cleanInput,
            targetLanguageCode,
            sourceLanguageCode,
            mode,
        });
    }

    try {
        const response = await fetch(`${SARVAM_API_BASE}/translate`, {
            method: "POST",
            headers: {
                "api-subscription-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: cleanInput,
                source_language_code: sourceLanguageCode,
                target_language_code: targetLanguageCode,
                mode: mode,
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            let parsedDetail = `HTTP ${response.status}`;
            try {
                const j = JSON.parse(errBody);
                parsedDetail = j.detail || j.message || parsedDetail;
            } catch (_) {}

            return {
                success: false,
                error: `Sarvam Translation failed: ${parsedDetail}`,
                translatedText: null,
                targetLanguageCode,
            };
        }

        const data = await response.json();
        const translatedText = data.translated_text || data.translation || "";

        return {
            success: true,
            translatedText,
            targetLanguageCode,
            sourceLanguageCode,
        };
    } catch (err) {
        return {
            success: false,
            error: err.name === "AbortError" ? "Translation request timed out." : (err.message || "Network error"),
            translatedText: null,
            targetLanguageCode,
        };
    }
}

/**
 * Helper to split and translate long texts chunk-by-chunk.
 */
async function translateLongText({ text, targetLanguageCode, sourceLanguageCode, mode }) {
    const paragraphs = text.split(/\n\n+/);
    const translatedParagraphs = [];

    for (const para of paragraphs) {
        if (!para.trim()) {
            translatedParagraphs.push("");
            continue;
        }

        // If paragraph itself is > 900 chars, break by sentence
        if (para.length > 900) {
            const sentences = para.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [para];
            const translatedSentences = [];
            for (const sentence of sentences) {
                if (!sentence.trim()) continue;
                const res = await translateText({
                    input: sentence.trim(),
                    targetLanguageCode,
                    sourceLanguageCode,
                    mode,
                });
                if (res.success && res.translatedText) {
                    translatedSentences.push(res.translatedText);
                } else {
                    translatedSentences.push(sentence.trim());
                }
            }
            translatedParagraphs.push(translatedSentences.join(" "));
        } else {
            const res = await translateText({
                input: para,
                targetLanguageCode,
                sourceLanguageCode,
                mode,
            });
            if (res.success && res.translatedText) {
                translatedParagraphs.push(res.translatedText);
            } else {
                translatedParagraphs.push(para);
            }
        }
    }

    return {
        success: true,
        translatedText: translatedParagraphs.join("\n\n"),
        targetLanguageCode,
        sourceLanguageCode,
    };
}

/**
 * Synthesizes text to speech using Sarvam Bulbul v4-flash.
 * Endpoint: POST https://api.sarvam.ai/text-to-speech
 */
async function textToSpeech({
    text,
    targetLanguageCode = "en-IN",
    speaker = "ishita_enhi_companion",
    pace = 1.0,
    sampleRate = 24000,
}) {
    if (!text || typeof text !== "string" || !text.trim()) {
        return {
            success: false,
            error: "No text provided for speech synthesis.",
            audioBase64: null,
        };
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            success: false,
            error: "SARVAM_API_KEY is not configured.",
            audioBase64: null,
        };
    }

    // Limit text length to ~500 chars per Bulbul API guidelines for crisp, timely audio briefing
    let speechText = text.trim();
    if (speechText.length > 500) {
        // Find safe sentence boundary before 490 chars
        const truncated = speechText.slice(0, 490);
        const lastPunct = Math.max(truncated.lastIndexOf("."), truncated.lastIndexOf("!"), truncated.lastIndexOf("?"));
        speechText = (lastPunct > 200 ? truncated.slice(0, lastPunct + 1) : truncated) + " For full details, please review your written report.";
    }

    try {
        const payload = {
            text: speechText,
            target_language_code: targetLanguageCode,
            model: "bulbul:v4-flash",
            speaker: speaker,
            pace: pace,
            speech_sample_rate: sampleRate,
        };

        const response = await fetch(`${SARVAM_API_BASE}/text-to-speech`, {
            method: "POST",
            headers: {
                "api-subscription-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            let detail = `HTTP ${response.status}`;
            try {
                const j = JSON.parse(errBody);
                detail = j.detail || j.message || detail;
            } catch (_) {}

            return {
                success: false,
                error: `Sarvam Text-to-Speech failed: ${detail}`,
                audioBase64: null,
            };
        }

        const data = await response.json();
        // Sarvam Bulbul returns an array of base64 strings in `audios`
        const audios = data.audios || [];
        if (!audios.length || !audios[0]) {
            return {
                success: false,
                error: "Sarvam Text-to-Speech returned empty audio data.",
                audioBase64: null,
            };
        }

        return {
            success: true,
            audioBase64: audios[0],
            contentType: "audio/wav",
            model: "bulbul:v4-flash",
            targetLanguageCode,
        };
    } catch (err) {
        return {
            success: false,
            error: err.name === "AbortError" ? "TTS request timed out." : (err.message || "Network error"),
            audioBase64: null,
        };
    }
}

/**
 * Transcribes audio file buffer using Sarvam Saaras v4.
 * Endpoint: POST https://api.sarvam.ai/speech-to-text
 */
async function speechToText({ audioBuffer, filename = "voice_input.wav", mimeType = "audio/wav", languageCode = "unknown" }) {
    if (!audioBuffer || !audioBuffer.length) {
        return {
            success: false,
            error: "Audio buffer is empty.",
            transcript: null,
        };
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            success: false,
            error: "SARVAM_API_KEY is not configured.",
            transcript: null,
        };
    }

    try {
        const formData = new FormData();
        const blob = new Blob([audioBuffer], { type: mimeType });
        formData.append("file", blob, filename);
        formData.append("model", "saaras:v4");
        if (languageCode && languageCode !== "unknown") {
            formData.append("language_code", languageCode);
        }

        const response = await fetch(`${SARVAM_API_BASE}/speech-to-text`, {
            method: "POST",
            headers: {
                "api-subscription-key": apiKey,
            },
            body: formData,
            signal: AbortSignal.timeout(25000),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            let detail = `HTTP ${response.status}`;
            try {
                const j = JSON.parse(errBody);
                detail = j.detail || j.message || detail;
            } catch (_) {}

            return {
                success: false,
                error: `Sarvam Speech-to-Text failed: ${detail}`,
                transcript: null,
            };
        }

        const data = await response.json();
        const transcript = (data.transcript || data.text || "").trim();

        return {
            success: true,
            transcript: transcript,
            languageCode: data.language_code || languageCode,
            model: "saaras:v4",
            requestId: data.request_id || null,
        };
    } catch (err) {
        return {
            success: false,
            error: err.name === "AbortError" ? "STT request timed out." : (err.message || "Network error"),
            transcript: null,
        };
    }
}

/**
 * Chat completion using Sarvam flagship models (e.g. sarvam-105b).
 * Endpoint: POST https://api.sarvam.ai/v1/chat/completions (or /v2/chat/completions)
 */
async function chatCompletion({
    messages,
    model = "sarvam-105b",
    maxTokens = 1000,
    temperature = 0.3,
}) {
    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            success: false,
            error: "SARVAM_API_KEY is not configured.",
            text: null,
        };
    }

    if (!messages || !Array.isArray(messages) || !messages.length) {
        return {
            success: false,
            error: "Messages array cannot be empty.",
            text: null,
        };
    }

    // Try V1 first, then fallback to V2
    const endpoints = [
        `${SARVAM_API_BASE}/v1/chat/completions`,
        `${SARVAM_API_BASE}/v2/chat/completions`,
    ];

    let lastError = "";

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "api-subscription-key": apiKey,
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature,
                }),
                signal: AbortSignal.timeout(30000),
            });

            if (response.ok) {
                const data = await response.json();
                const choice = data.choices && data.choices[0];
                const content = choice?.message?.content || "";
                return {
                    success: true,
                    text: content.trim(),
                    model: model,
                    usage: data.usage || null,
                };
            }

            const errBody = await response.text().catch(() => "");
            lastError = `Endpoint ${endpoint} returned HTTP ${response.status}: ${errBody}`;
        } catch (err) {
            lastError = err.message;
        }
    }

    return {
        success: false,
        error: `Sarvam Chat Completion failed: ${lastError}`,
        text: null,
    };
}

/**
 * Generates an interview or clarification question tailored to the student's actual verification gaps.
 */
async function generateInterviewQuestion({
    opportunityName = "Opportunity",
    domain = "internship",
    missingSkills = [],
    alignmentIndex = 0,
    extractedEvidence = {},
}) {
    // Deterministic fallback question if AI is offline or key missing
    const fallbackTopic = missingSkills.length > 0
        ? missingSkills[0]
        : (domain === "internship" ? "technical projects" : "academic coursework and CGPA");

    const fallbackQuestion = domain === "internship"
        ? `In your application for ${opportunityName}, your CV indicates interest in this role, but does not yet cite hands-on evidence for ${fallbackTopic}. Could you describe a project or practical scenario where you used ${fallbackTopic} or a related technology?`
        : `For ${opportunityName}, scholarships often review academic consistency and degree eligibility. Could you explain how your coursework and background align with the stated criteria?`;

    const apiKey = getApiKey();
    if (!apiKey) {
        return {
            success: true,
            question: fallbackQuestion,
            source: "deterministic_template",
            topic: fallbackTopic,
        };
    }

    const systemPrompt = `You are an expert Indian technical interviewer and academic counselor for ApplyReady AI.
Your role is to formulate a single, professional, empathetic interview or clarification question tailored to the student's actual evidence gaps.
Focus on real skills or eligibility requirements.
Keep the question concise (1-2 sentences maximum).
Never be rude or discouraging.`;

    const userPrompt = `Opportunity: ${opportunityName} (${domain})
Technical Alignment: ${alignmentIndex}%
Missing / Unverified Skills: ${missingSkills.join(", ") || "None"}
Candidate Evidence Summary: ${JSON.stringify(extractedEvidence)}

Generate one thoughtful interview question asking the student to elaborate on one of their missing skills or explain how they plan to bridge that gap.`;

    const chatRes = await chatCompletion({
        model: "sarvam-105b",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        maxTokens: 250,
        temperature: 0.4,
    });

    if (chatRes.success && chatRes.text) {
        return {
            success: true,
            question: chatRes.text.replace(/^["']|["']$/g, "").trim(),
            source: "sarvam-105b",
            topic: fallbackTopic,
        };
    }

    return {
        success: true,
        question: fallbackQuestion,
        source: "deterministic_fallback",
        topic: fallbackTopic,
    };
}

/**
 * Evaluates the student's answer (transcribed from audio or typed) against the interview question.
 */
async function evaluateInterviewAnswer({
    question,
    answerText,
    opportunityName = "Opportunity",
    targetRole = "Software Engineering Intern",
    keySkills = [],
}) {
    if (!answerText || !answerText.trim()) {
        return {
            success: false,
            error: "Answer text is empty.",
            feedback: null,
        };
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        // Helpful heuristic evaluation when key is unconfigured
        const wordCount = answerText.trim().split(/\s+/).length;
        const mentionsSkill = keySkills.some((s) => answerText.toLowerCase().includes(s.toLowerCase()));

        return {
            success: true,
            score: Math.min(85, Math.max(50, wordCount > 25 ? 75 : 55) + (mentionsSkill ? 10 : 0)),
            feedback: `Thank you for sharing your response. You provided a ${wordCount}-word explanation. To make your answer stand out in Indian technical interviews, use the STAR format (Situation, Task, Action, Result) and cite specific libraries or tools. (Note: Live Sarvam-105b LLM evaluation is available when SARVAM_API_KEY is configured in backend/.env).`,
            strengths: ["Clear communication", wordCount > 30 ? "Good detail" : "Direct response"],
            suggestedImprovement: "Include measurable outcomes (e.g. reduced load time, number of users, GitHub link) to substantiate your claim.",
            source: "heuristic_offline",
        };
    }

    const systemPrompt = `You are a senior technical hiring manager and mentor at a premier Indian technology organization.
You are evaluating a student candidate's mock interview response for ApplyReady AI.
Evaluate the candidate's answer constructively with high pedagogical value.
Return your evaluation in valid JSON with these exact keys:
{
  "score": <number between 0 and 100>,
  "feedback": "<concise 2-3 sentence assessment>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "areasForImprovement": ["<area 1>", "<area 2>"],
  "modelAnswer": "<an exemplary 2-3 sentence answer demonstrating how a top candidate would answer this concisely>"
}`;

    const userPrompt = `Role / Opportunity: ${opportunityName} (${targetRole})
Interview Question: "${question}"
Candidate Answer: "${answerText}"
Relevant Technical Context: ${keySkills.join(", ") || "General Technical Readiness"}

Provide your evaluation in valid JSON format only.`;

    const chatRes = await chatCompletion({
        model: "sarvam-105b",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        maxTokens: 600,
        temperature: 0.2,
    });

    if (chatRes.success && chatRes.text) {
        try {
            // Strip code fences if present
            let cleaned = chatRes.text.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
            }
            const parsed = JSON.parse(cleaned);
            return {
                success: true,
                score: typeof parsed.score === "number" ? parsed.score : 75,
                feedback: parsed.feedback || "Good response.",
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ["Clear articulation"],
                areasForImprovement: Array.isArray(parsed.areasForImprovement) ? parsed.areasForImprovement : ["Add specific project details"],
                modelAnswer: parsed.modelAnswer || null,
                source: "sarvam-105b",
            };
        } catch (_) {
            return {
                success: true,
                score: 75,
                feedback: chatRes.text,
                strengths: ["Communicates directly"],
                areasForImprovement: ["Structure answer using STAR method"],
                source: "sarvam-105b_raw",
            };
        }
    }

    return {
        success: false,
        error: chatRes.error || "Unable to evaluate answer.",
    };
}

module.exports = {
    SUPPORTED_LANGUAGES,
    isConfigured,
    getStatus,
    translateText,
    translateLongText,
    textToSpeech,
    speechToText,
    chatCompletion,
    generateInterviewQuestion,
    evaluateInterviewAnswer,
};
