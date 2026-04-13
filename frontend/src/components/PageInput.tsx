"use client";

import React, { useEffect, useRef, useState } from "react";

interface PageInputProps {
  onUrlReady: (url: string) => void;
}

export default function PageInput({ onUrlReady }: PageInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [committed, setCommitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const PRIVATE_PATTERNS = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\./,
    /^https?:\/\/192\.168\./,
    /^https?:\/\/10\./,
    /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  ];

  function validate(raw: string): string | null {
    raw = raw.trim();
    if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
      return "URL must start with https://";
    }
    for (const pattern of PRIVATE_PATTERNS) {
      if (pattern.test(raw)) {
        return "Private/local URLs are not allowed";
      }
    }
    return null;
  }

  function handleCommit() {
    const err = validate(url);
    if (err) {
      setError(err);
      setCommitted(false);
      return;
    }
    setError("");
    setCommitted(true);
    onUrlReady(url.trim());
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
    setError("");
    setCommitted(false);
  }

  return (
    <div className="page-input">
      <div className="page-input-row">
        <div className="page-input-field">
          <input
            ref={inputRef}
            id="landing-page-url"
            type="url"
            className={`input page-url-input ${error ? "input--error" : ""} ${committed ? "input--success" : ""}`}
            placeholder="https://your-landing-page.com"
            value={url}
            onChange={handleChange}
            onKeyDown={(e) => e.key === "Enter" && handleCommit()}
            onBlur={handleCommit}
            aria-label="Landing page URL"
            aria-describedby={error ? "page-url-error" : undefined}
            aria-invalid={!!error}
            autoComplete="url"
            spellCheck={false}
          />
          {committed && !error && (
            <span className="input-badge input-badge--ok" aria-label="URL valid">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          {error && (
            <span className="input-badge input-badge--err" aria-hidden="true">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
          )}
        </div>
        <button
          className="btn-secondary page-input-btn"
          onClick={handleCommit}
          aria-label="Confirm landing page URL"
        >
          Confirm
        </button>
      </div>

      {error && (
        <p id="page-url-error" className="field-error" role="alert">
          {error}
        </p>
      )}

      {committed && !error && (
        <div className="page-confirmed animate-fade-in" role="status">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6" stroke="#06B6D4" strokeWidth="1.3" />
            <path d="M4 7l2 2 4-4" stroke="#06B6D4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Ready - <code className="page-url-preview">{url.length > 50 ? url.slice(0, 50) + "…" : url}</code></span>
        </div>
      )}

      <style jsx>{`
        .page-input { display: flex; flex-direction: column; gap: 0.6rem; }

        .page-input-row {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .page-input-field {
          flex: 1;
          position: relative;
        }

        .page-url-input { padding-right: 2.5rem; }

        .page-url-input.input--error { border-color: #EF4444; }
        .page-url-input.input--success { border-color: var(--cta); }

        .input-badge {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .input-badge--ok { background: rgba(6,182,212,0.15); color: var(--cta); }
        .input-badge--err { background: rgba(239,68,68,0.15); color: #EF4444; }

        .page-input-btn { white-space: nowrap; }

        .field-error {
          font-size: 0.8rem;
          color: #EF4444;
        }

        .page-confirmed {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.82rem;
          color: var(--cta);
        }

        .page-url-preview {
          font-family: 'Courier New', monospace;
          font-size: 0.78rem;
          color: #AAA;
        }
      `}</style>
    </div>
  );
}
