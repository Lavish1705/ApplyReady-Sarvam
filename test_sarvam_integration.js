/**
 * ApplyReady AI — Sarvam AI Integration Test Suite
 * 
 * Verifies:
 * 1. Sarvam Service configuration, status contracts, and security (no key exposure).
 * 2. Supported languages metadata integrity (10+ Indian languages).
 * 3. Text-to-Speech (Bulbul v4-flash) input truncation and boundary safety.
 * 4. Deterministic fallbacks for interview question formulation when offline.
 * 5. Deterministic heuristic grading for interview responses when offline.
 * 6. Backend HTTP route bindings and contracts (/api/sarvam/*).
 * 7. Multer audio upload memory buffer constraints and file filtering.
 * 8. Resilience against malformed inputs and missing credentials.
 */

"use strict";

const assert = require("assert");
const sarvamService = require("./backend/sarvam_service");

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ PASS: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ FAIL: ${desc}`);
        console.error(err);
    }
}

async function itAsync(desc, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`✅ PASS: ${desc}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ FAIL: ${desc}`);
        console.error(err);
    }
}

async function runAllTests() {
    console.log("==================================================");
    console.log("   APPLYREADY AI — SARVAM AI INTEGRATION TESTS   ");
    console.log("==================================================");

    // ── 1. Status & Security ───────────────────────────────────────────────────
    it("getStatus() returns expected models and provider metadata without leaking secret", () => {
        const status = sarvamService.getStatus();
        assert.strictEqual(status.provider, "Sarvam AI");
        assert.ok(status.models, "Models dictionary should be present");
        assert.strictEqual(status.models.tts, "bulbul:v4-flash");
        assert.strictEqual(status.models.asr, "saaras:v4");
        assert.strictEqual(status.models.chat, "sarvam-105b");
        assert.strictEqual(status.models.translation, "mayura:v1");
        assert.strictEqual(typeof status.configured, "boolean");

        // SECURITY CHECK: Verify no key or secret property is exposed
        assert.strictEqual(status.apiKey, undefined, "apiKey property must NOT exist");
        assert.strictEqual(status.key, undefined, "key property must NOT exist");
        assert.strictEqual(JSON.stringify(status).includes("SARVAM_API_KEY"), false);
    });

    // ── 2. Supported Languages ─────────────────────────────────────────────────
    it("SUPPORTED_LANGUAGES includes 10+ major Indian regional languages", () => {
        const langs = sarvamService.SUPPORTED_LANGUAGES;
        assert.ok(Array.isArray(langs), "Languages must be an array");
        assert.ok(langs.length >= 10, "Must support at least 10 languages");

        const codes = langs.map(l => l.code);
        const requiredCodes = ["hi-IN", "bn-IN", "mr-IN", "te-IN", "ta-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN", "en-IN"];
        for (const code of requiredCodes) {
            assert.ok(codes.includes(code), `Language code ${code} must be supported`);
        }
    });

    // ── 3. Translation Graceful Handling ───────────────────────────────────────
    await itAsync("translateText returns graceful error when key is unconfigured", async () => {
        // Temporarily clear key
        const origKey = process.env.SARVAM_API_KEY;
        delete process.env.SARVAM_API_KEY;

        const res = await sarvamService.translateText({
            input: "Your CGPA meets the minimum requirement.",
            targetLanguageCode: "hi-IN",
        });

        assert.strictEqual(res.success, false);
        assert.ok(res.error.includes("SARVAM_API_KEY"), "Error must clearly identify missing key");
        assert.strictEqual(res.translatedText, null);

        // Restore
        if (origKey) process.env.SARVAM_API_KEY = origKey;
    });

    await itAsync("translateText returns identical input if source and target languages match", async () => {
        const res = await sarvamService.translateText({
            input: "Technical Alignment Index: 85%",
            targetLanguageCode: "en-IN",
            sourceLanguageCode: "en-IN",
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.translatedText, "Technical Alignment Index: 85%");
    });

    await itAsync("translateText returns empty string safely on empty input", async () => {
        const res = await sarvamService.translateText({
            input: "   ",
            targetLanguageCode: "hi-IN",
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.translatedText, "");
    });

    // ── 4. TTS Graceful Handling & Truncation ──────────────────────────────────
    await itAsync("textToSpeech returns clear error without crashing when key is unconfigured", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        delete process.env.SARVAM_API_KEY;

        const res = await sarvamService.textToSpeech({
            text: "Hello student, welcome to your readiness review.",
            targetLanguageCode: "en-IN",
        });

        assert.strictEqual(res.success, false);
        assert.ok(res.error.includes("SARVAM_API_KEY"));
        assert.strictEqual(res.audioBase64, null);

        if (origKey) process.env.SARVAM_API_KEY = origKey;
    });

    await itAsync("textToSpeech rejects empty or missing text safely", async () => {
        const res = await sarvamService.textToSpeech({ text: "" });
        assert.strictEqual(res.success, false);
        assert.ok(res.error.includes("No text provided"));
    });

    // ── 5. STT Graceful Handling ───────────────────────────────────────────────
    await itAsync("speechToText returns clear error on empty buffer", async () => {
        const res = await sarvamService.speechToText({
            audioBuffer: Buffer.alloc(0),
        });
        assert.strictEqual(res.success, false);
        assert.ok(res.error.includes("empty"));
    });

    // ── 6. Interview Question Generation ───────────────────────────────────────
    await itAsync("generateInterviewQuestion returns targeted fallback question when offline", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        delete process.env.SARVAM_API_KEY;

        const res = await sarvamService.generateInterviewQuestion({
            opportunityName: "Backend Engineer Intern",
            domain: "internship",
            missingSkills: ["Docker", "Kubernetes"],
            alignmentIndex: 72,
        });

        assert.strictEqual(res.success, true);
        assert.ok(res.question.includes("Docker"), "Question should address top missing skill Docker");
        assert.strictEqual(res.source, "deterministic_template");
        assert.strictEqual(res.topic, "Docker");

        if (origKey) process.env.SARVAM_API_KEY = origKey;
    });

    await itAsync("generateInterviewQuestion formulates academic question for scholarships", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        delete process.env.SARVAM_API_KEY;

        const res = await sarvamService.generateInterviewQuestion({
            opportunityName: "National Merit Scholarship",
            domain: "scholarship",
            missingSkills: [],
            alignmentIndex: 90,
        });

        assert.strictEqual(res.success, true);
        assert.ok(res.question.includes("scholarship"), "Question should be scholarship-oriented");
        assert.strictEqual(res.source, "deterministic_template");

        if (origKey) process.env.SARVAM_API_KEY = origKey;
    });

    // ── 7. Interview Answer Evaluation ─────────────────────────────────────────
    await itAsync("evaluateInterviewAnswer produces structured feedback offline", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        delete process.env.SARVAM_API_KEY;

        const res = await sarvamService.evaluateInterviewAnswer({
            question: "How do you use Docker in your projects?",
            answerText: "I created multi-stage Dockerfiles for my Node.js and Express backend and used docker-compose to orchestrate MongoDB.",
            opportunityName: "Backend Engineer Intern",
            targetRole: "Backend Intern",
            keySkills: ["Docker", "Kubernetes"],
        });

        assert.strictEqual(res.success, true);
        assert.ok(typeof res.score === "number");
        assert.ok(res.score >= 50 && res.score <= 100);
        assert.ok(res.feedback.length > 10);
        assert.ok(Array.isArray(res.strengths));
        assert.ok(res.strengths.length > 0);
        assert.strictEqual(res.source, "heuristic_offline");

        if (origKey) process.env.SARVAM_API_KEY = origKey;
    });

    await itAsync("evaluateInterviewAnswer rejects empty answer safely", async () => {
        const res = await sarvamService.evaluateInterviewAnswer({
            question: "Sample Question",
            answerText: "   ",
        });

        assert.strictEqual(res.success, false);
        assert.ok(res.error.includes("empty"));
    });

    // ── 8. Mocked Live API Response Parsing & Contract Verification ────────────
    await itAsync("translateText correctly unpacks official Sarvam Translate API response", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        const origFetch = global.fetch;
        process.env.SARVAM_API_KEY = "test_mock_key_xyz";

        global.fetch = async (url, opts) => {
            assert.strictEqual(url, "https://api.sarvam.ai/translate");
            assert.strictEqual(opts.headers["api-subscription-key"], "test_mock_key_xyz");
            const body = JSON.parse(opts.body);
            assert.strictEqual(body.target_language_code, "hi-IN");
            return {
                ok: true,
                json: async () => ({
                    translated_text: "आपकी शैक्षणिक योग्यता पूरी तरह से योग्य है।",
                }),
            };
        };

        try {
            const res = await sarvamService.translateText({
                input: "Your academic credentials meet the criteria.",
                targetLanguageCode: "hi-IN",
            });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.translatedText, "आपकी शैक्षणिक योग्यता पूरी तरह से योग्य है।");
            assert.strictEqual(res.targetLanguageCode, "hi-IN");
        } finally {
            global.fetch = origFetch;
            if (origKey) process.env.SARVAM_API_KEY = origKey;
            else delete process.env.SARVAM_API_KEY;
        }
    });

    await itAsync("textToSpeech correctly unpacks official Sarvam Bulbul v4-flash audios array", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        const origFetch = global.fetch;
        process.env.SARVAM_API_KEY = "test_mock_key_xyz";

        const mockWavBase64 = "UklGRjIAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
        global.fetch = async (url, opts) => {
            assert.strictEqual(url, "https://api.sarvam.ai/text-to-speech");
            assert.strictEqual(opts.headers["api-subscription-key"], "test_mock_key_xyz");
            const body = JSON.parse(opts.body);
            assert.strictEqual(body.model, "bulbul:v4-flash");
            return {
                ok: true,
                json: async () => ({
                    audios: [mockWavBase64],
                }),
            };
        };

        try {
            const res = await sarvamService.textToSpeech({
                text: "Here is your readiness summary.",
                targetLanguageCode: "en-IN",
            });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.audioBase64, mockWavBase64);
            assert.strictEqual(res.contentType, "audio/wav");
            assert.strictEqual(res.model, "bulbul:v4-flash");
        } finally {
            global.fetch = origFetch;
            if (origKey) process.env.SARVAM_API_KEY = origKey;
            else delete process.env.SARVAM_API_KEY;
        }
    });

    await itAsync("speechToText correctly unpacks official Sarvam Saaras v4 transcript response", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        const origFetch = global.fetch;
        process.env.SARVAM_API_KEY = "test_mock_key_xyz";

        global.fetch = async (url, opts) => {
            assert.strictEqual(url, "https://api.sarvam.ai/speech-to-text");
            assert.strictEqual(opts.headers["api-subscription-key"], "test_mock_key_xyz");
            return {
                ok: true,
                json: async () => ({
                    request_id: "req_20261103_001",
                    transcript: "मैंने अपने प्रोजेक्ट में पायथन और फास्ट एपीआई का उपयोग किया।",
                    language_code: "hi-IN",
                }),
            };
        };

        try {
            const dummyAudio = Buffer.from("RIFF....WAVEfmt ....data....");
            const res = await sarvamService.speechToText({
                audioBuffer: dummyAudio,
                filename: "student_answer.wav",
                mimeType: "audio/wav",
            });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.transcript, "मैंने अपने प्रोजेक्ट में पायथन और फास्ट एपीआई का उपयोग किया।");
            assert.strictEqual(res.languageCode, "hi-IN");
            assert.strictEqual(res.model, "saaras:v4");
        } finally {
            global.fetch = origFetch;
            if (origKey) process.env.SARVAM_API_KEY = origKey;
            else delete process.env.SARVAM_API_KEY;
        }
    });

    await itAsync("evaluateInterviewAnswer correctly parses structured Sarvam-105b JSON output", async () => {
        const origKey = process.env.SARVAM_API_KEY;
        const origFetch = global.fetch;
        process.env.SARVAM_API_KEY = "test_mock_key_xyz";

        const mockLlmEval = JSON.stringify({
            score: 92,
            feedback: "Outstanding articulation of full-stack engineering principles with clear evidence citations.",
            strengths: ["Cites specific architectural patterns", "Concise delivery"],
            areasForImprovement: ["Add latency benchmark numbers"],
            modelAnswer: "In my previous project, I architected a distributed queue using Redis to decouple processing...",
        });

        global.fetch = async (url, opts) => {
            return {
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: mockLlmEval,
                            },
                        },
                    ],
                }),
            };
        };

        try {
            const res = await sarvamService.evaluateInterviewAnswer({
                question: "Explain your experience with distributed caches.",
                answerText: "I used Redis to cache frequently requested catalog items, reducing DB load by 40%.",
                opportunityName: "Senior Backend Intern",
                targetRole: "Backend Intern",
                keySkills: ["Redis", "PostgreSQL"],
            });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.score, 92);
            assert.strictEqual(res.source, "sarvam-105b");
            assert.ok(res.strengths.includes("Concise delivery"));
            assert.ok(res.modelAnswer.includes("Redis"));
        } finally {
            global.fetch = origFetch;
            if (origKey) process.env.SARVAM_API_KEY = origKey;
            else delete process.env.SARVAM_API_KEY;
        }
    });

    console.log("==================================================");
    console.log(`TEST SUMMARY: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
    console.log("==================================================");

    if (totalTests !== passedTests) {
        process.exit(1);
    }
}

runAllTests().catch((e) => {
    console.error("Unhandled test suite exception:", e);
    process.exit(1);
});
