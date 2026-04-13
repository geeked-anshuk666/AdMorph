"use client";

import React, { useState, useEffect } from "react";
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

interface HealthModalProps {
  onClose: () => void;
}

export default function HealthModal({ onClose }: HealthModalProps) {
  const [backendLatency, setBackendLatency] = useState<number | null>(null);
  const [llmLatency, setLlmLatency] = useState<number | null>(null);
  const [isBackendLoading, setIsBackendLoading] = useState(false);
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  const testBackend = async () => {
    setIsBackendLoading(true);
    setBackendError(null);
    const start = Date.now();
    try {
      const res = await fetch(`${BACKEND}/api/status`);
      if (!res.ok) throw new Error("Failed");
      setBackendLatency(Date.now() - start);
    } catch (err: any) {
      setBackendError(err.message);
    } finally {
      setIsBackendLoading(false);
    }
  };

  const testLLM = async () => {
    setIsLlmLoading(true);
    setLlmError(null);
    try {
      const res = await fetch(`${BACKEND}/api/health/llm`);
      if (!res.ok) throw new Error("API call failed");
      const data = await res.json();
      
      if (data.status === "quota_exceeded") {
        setLlmError("QUOTA_REACHED");
        return;
      }
      if (data.status === "error") throw new Error(data.error);
      
      setLlmLatency(data.latency_ms);
    } catch (err: any) {
      setLlmError(err.message);
    } finally {
      setIsLlmLoading(false);
    }
  };

  useEffect(() => {
    testBackend();
    testLLM();
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <header className="modal-header">
          <h2>System Health Status</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        
        <div className="modal-body">
          <div className="health-row">
            <div className="health-info">
              <h3>FastAPI Backend</h3>
              <p>Measures core API connectivity</p>
            </div>
            <div className="health-status">
              {isBackendLoading ? (
                <span className="latency loading">Pinging...</span>
              ) : backendError ? (
                <span className="latency error">Error</span>
              ) : backendLatency !== null ? (
                <span className={`latency ${backendLatency < 300 ? "good" : "slow"}`}>
                  {backendLatency}ms
                </span>
              ) : null}
              <button 
                className="refresh-btn" 
                onClick={testBackend} 
                disabled={isBackendLoading}
                aria-label="Refresh Backend Status"
              >
                ↻
              </button>
            </div>
          </div>

          <div className="health-row">
            <div className="health-info">
              <h3>Gemini LLM Pipeline</h3>
              <p>Measures direct model generation speed</p>
            </div>
            <div className="health-status">
              {isLlmLoading ? (
                <span className="latency loading">Pinging...</span>
              ) : llmError === "QUOTA_REACHED" ? (
                <span className="latency error">Quota Exceeded</span>
              ) : llmError ? (
                <span className="latency error">Error</span>
              ) : llmLatency !== null ? (
                <span className={`latency ${llmLatency < 1000 ? "good" : "slow"}`}>
                  {llmLatency}ms
                </span>
              ) : null}
              <button 
                className="refresh-btn" 
                onClick={testLLM} 
                disabled={isLlmLoading}
                aria-label="Refresh LLM Status"
              >
                ↻
              </button>
            </div>
            {llmError === "QUOTA_REACHED" && (
              <p className="quota-hint animate-fade-in" style={{ gridColumn: "1 / -1", fontSize: "0.75rem", color: "#F87171", marginTop: "8px" }}>
                Daily Gemini Free Tier limit reached (20 req/day). Try again later.
              </p>
            )}
          </div>
        </div>


      </div>
    </div>
  );
}
