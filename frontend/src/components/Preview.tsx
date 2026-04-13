"use client";

import React, { useState } from "react";

interface PreviewProps {
  jobId: string;
  backendUrl: string;
  variantId: string;
}

export default function Preview({ jobId, backendUrl, variantId }: PreviewProps) {
  const [activeTab, setActiveTab] = useState<"before" | "after">("after");

  const previewUrl = variantId
    ? `${backendUrl}/api/preview/${jobId}?variant=${variantId}`
    : `${backendUrl}/api/preview/${jobId}`;

  return (
    <div className="preview-container animate-fade-up">
      {/* Tab controls */}
      <div className="preview-tabs" role="tablist" aria-label="Preview mode">
        {(["before", "after"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            id={`preview-tab-${t}`}
            aria-controls={`preview-panel-${t}`}
            aria-selected={activeTab === t}
            onClick={() => setActiveTab(t)}
            className={`preview-tab ${activeTab === t ? "preview-tab--active" : ""}`}
          >
            {t === "before" ? (
              <>
                <span className="preview-dot preview-dot--before" aria-hidden="true" />
                Original
              </>
            ) : (
              <>
                <span className="preview-dot preview-dot--after" aria-hidden="true" />
                Personalized
              </>
            )}
          </button>
        ))}
      </div>

      {/* Iframe panels */}
      <div className="preview-iframe-wrapper">
        {/* Before - blank since we just show the iframe label */}
        <div
          id="preview-panel-before"
          role="tabpanel"
          aria-labelledby="preview-tab-before"
          hidden={activeTab !== "before"}
          className="preview-panel"
        >
          <div className="preview-placeholder">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="44" height="44" rx="4" stroke="#333" strokeWidth="1.5" />
              <path d="M2 16h44M12 2v14" stroke="#333" strokeWidth="1.5" />
              <circle cx="6" cy="9" r="2" fill="#444" />
              <circle cx="12" cy="9" r="2" fill="#444" />
            </svg>
            <p>Original page preview</p>
            <p className="preview-placeholder-sub">
              The un-modified page is not loaded locally for privacy. Compare with the personalized version on the right.
            </p>
          </div>
        </div>

        {/* After - serves the personalized HTML */}
        <div
          id="preview-panel-after"
          role="tabpanel"
          aria-labelledby="preview-tab-after"
          hidden={activeTab !== "after"}
          className="preview-panel"
        >
          <iframe
            src={previewUrl}
            title="Personalized landing page preview"
            className="preview-iframe"
            sandbox="allow-same-origin allow-forms allow-popups"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Download hint */}
      <div className="preview-footer">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="6" stroke="#555" strokeWidth="1.3" />
          <path d="M7 5v4M5 9h4" stroke="#555" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span>Scripts stripped for safe preview · Download to get the full self-contained HTML</span>
      </div>

      <style jsx>{`
        .preview-container {
          background: var(--dark-card);
          border: 1px solid #222;
          border-radius: var(--radius-lg);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .preview-tabs {
          display: flex;
          border-bottom: 1px solid #222;
          background: #111;
        }

        .preview-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          border: none;
          background: transparent;
          color: var(--gray-dim);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: color var(--transition), background var(--transition);
          font-family: inherit;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
        }

        .preview-tab--active {
          color: var(--white);
          border-bottom-color: var(--primary);
          background: rgba(236,72,153,0.05);
        }

        .preview-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .preview-dot--before { background: #555; }
        .preview-dot--after  { background: var(--cta); }

        .preview-iframe-wrapper { flex: 1; min-height: 0; }

        .preview-panel { height: 500px; }

        .preview-iframe {
          width: 100%;
          height: 100%;
          border: none;
          background: #fff;
          display: block;
        }

        .preview-placeholder {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          color: var(--gray-dim);
          text-align: center;
          padding: 2rem;
        }

        .preview-placeholder p { font-size: 0.95rem; }

        .preview-placeholder-sub {
          font-size: 0.82rem !important;
          color: #555;
          max-width: 380px;
          line-height: 1.6;
        }

        .preview-footer {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 1.25rem;
          border-top: 1px solid #1A1A1A;
          color: #555;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}
