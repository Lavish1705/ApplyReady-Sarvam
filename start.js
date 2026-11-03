/**
 * ApplyReady AI — Universal Launcher
 * Starts both Python FastAPI ML service and Node.js Express Backend in a single command.
 * Automatically resolves virtual environment across macOS, Linux, and Windows.
 */

"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT_DIR = __dirname;
const ML_DIR = path.join(ROOT_DIR, "ml-service");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");

// 1. Resolve Python executable
function resolvePython() {
    const candidates = [
        path.join(ML_DIR, ".venv_mac", "bin", "python"),
        path.join(ML_DIR, ".venv_mac", "bin", "python3"),
        path.join(ML_DIR, "venv", "bin", "python"),
        path.join(ML_DIR, "venv", "bin", "python3"),
        path.join(ML_DIR, "venv312", "Scripts", "python.exe"),
        path.join(ML_DIR, "venv_test", "Scripts", "python.exe"),
        path.join(ROOT_DIR, "venv_test", "Scripts", "python.exe"),
        "python3",
        "python",
    ];

    for (const p of candidates) {
        if (p.includes(path.sep)) {
            if (fs.existsSync(p)) {
                return p;
            }
        } else {
            return p;
        }
    }
    return "python3";
}

const pythonBin = resolvePython();
console.log("==================================================");
console.log("   APPLYREADY AI — LAUNCHING SERVICES");
console.log("==================================================");
console.log(`[Launcher] Using Python: ${pythonBin}`);

// 2. Spawn ML Service
const mlProcess = spawn(
    pythonBin,
    ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
    {
        cwd: ML_DIR,
        stdio: ["ignore", "pipe", "pipe"],
    }
);

mlProcess.stdout.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[ML Service] ${msg}`);
});

mlProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[ML Service] ${msg}`);
});

// 3. Spawn Backend Server
const backendProcess = spawn(
    process.execPath, // node
    ["server.js"],
    {
        cwd: BACKEND_DIR,
        stdio: "inherit",
    }
);

setTimeout(() => {
    console.log("\n==================================================");
    console.log("   APPLYREADY AI — ALL SERVICES RUNNING");
    console.log("==================================================");
    console.log("🌐 Open Web App:   http://127.0.0.1:5000");
    console.log("                   http://localhost:5000");
    console.log("🚀 ML Intelligence: http://127.0.0.1:8000");
    console.log("🇮🇳 Sarvam AI:       Ready (Mayura · Bulbul · Saaras · 105B)");
    console.log("--------------------------------------------------");
    console.log("💡 Mac Note: If localhost gives '403 Forbidden', use http://127.0.0.1:5000 (macOS AirPlay takes port 5000 on localhost).");
    console.log("==================================================\n");
}, 1500);

// 4. Handle Shutdown
function shutdown() {
    console.log("\n[Launcher] Stopping services...");
    try { mlProcess.kill("SIGINT"); } catch (_) {}
    try { backendProcess.kill("SIGINT"); } catch (_) {}
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

mlProcess.on("close", (code) => {
    if (code !== 0 && code !== null) {
        console.error(`[Launcher] ML Service exited with code ${code}`);
    }
});

backendProcess.on("close", (code) => {
    if (code !== 0 && code !== null) {
        console.error(`[Launcher] Backend server exited with code ${code}`);
    }
    shutdown();
});
