"use client";

import React, { useState } from "react";

interface ChangeItem {
  selector: string;
  attribute: string;
  new_value: string;
  reason: string;
}

interface ChangePanelProps {
  changes: ChangeItem[];
  warnings: string[];
}

const ATTRIBUTE_COLORS: Record<string, string> = {
  textContent: "#06B6D4",
  innerHTML:   "#F59E0B",
  src:         "#0D9488",
  alt:         "#10B981",
  href:        "#EC4899",
  style:       "#EF4444",
  class:       "#6366F1",
};

export default function ChangePanel({ changes, warnings }: ChangePanelProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="change-panel animate-fade-up">
      <div className="change-panel-header">
        <h2 className="change-panel-title">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M3 9h12M9 3l6 6-6 6" stroke="#06B6D4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Changes Applied
        </h2>
        <span className="change-count" aria-label={`${changes.length} changes`}>
          {changes.length}
        </span>
      </div>

      {changes.length === 0 ? (
        <p className="change-empty">No changes were applied to this page.</p>
      ) : (
        <ol className="change-list" aria-label="Applied changes">
          {changes.map((change, i) => {
            const isOpen = expanded === i;
            const attrColor = ATTRIBUTE_COLORS[change.attribute] ?? "#888";

            return (
              <li key={i} className="change-item">
                <button
                  className="change-item-header"
                  onClick={() => setExpanded(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={`change-detail-${i}`}
                  id={`change-btn-${i}`}
                >
                  <span className="change-number" aria-hidden="true">{i + 1}</span>
                  <div className="change-item-summary">
                    <code className="change-selector">{change.selector}</code>
                    <span
                      className="change-attr-chip"
                      style={{ "--chip-color": attrColor } as React.CSSProperties}
                    >
                      {change.attribute}
                    </span>
                  </div>
                  <svg
                    className={`change-chevron ${isOpen ? "change-chevron--open" : ""}`}
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                <div
                  id={`change-detail-${i}`}
                  role="region"
                  aria-labelledby={`change-btn-${i}`}
                  className={`change-detail ${isOpen ? "change-detail--open" : ""}`}
                >
                  <div className="change-detail-inner">
                    <div className="change-field">
                      <span className="change-field-label">New Value</span>
                      <code className="change-field-value">{change.new_value.slice(0, 120)}{change.new_value.length > 120 ? "…" : ""}</code>
                    </div>
                    <div className="change-field">
                      <span className="change-field-label">AI Rationale</span>
                      <p className="change-reason">{change.reason}</p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {warnings.length > 0 && (
        <div className="change-warnings" role="alert" aria-label="Warnings">
          <p className="change-warnings-title">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1L13 12H1L7 1z" stroke="#F59E0B" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M7 5v3M7 9.5v.5" stroke="#F59E0B" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Warnings
          </p>
          <ul className="change-warnings-list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <style jsx>{`
        .change-panel {
          background: var(--dark-card);
          border: 1px solid #222;
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .change-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #222;
        }

        .change-panel-title {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .change-count {
          background: var(--cta);
          color: var(--white);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 99px;
          min-width: 24px;
          text-align: center;
        }

        .change-empty {
          padding: 1.5rem;
          color: var(--gray-dim);
          font-size: 0.9rem;
        }

        .change-list { list-style: none; }

        .change-item { border-bottom: 1px solid #1A1A1A; }
        .change-item:last-child { border-bottom: none; }

        .change-item-header {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.9rem 1.5rem;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--white);
          text-align: left;
          transition: background var(--transition);
          font-family: inherit;
        }

        .change-item-header:hover { background: rgba(255,255,255,0.03); }

        .change-number {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #2A2A2A;
          color: var(--gray-dim);
          font-size: 0.72rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .change-item-summary {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          min-width: 0;
        }

        .change-selector {
          font-size: 0.82rem;
          color: var(--secondary);
          font-family: 'Courier New', monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;
        }

        .change-attr-chip {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
          background: color-mix(in srgb, var(--chip-color) 15%, transparent);
          color: var(--chip-color);
          letter-spacing: 0.02em;
          flex-shrink: 0;
        }

        .change-chevron {
          color: var(--gray-dim);
          transition: transform var(--transition);
          flex-shrink: 0;
        }

        .change-chevron--open { transform: rotate(180deg); }

        .change-detail {
          max-height: 0;
          overflow: hidden;
          transition: max-height 300ms ease;
        }

        .change-detail--open { max-height: 200px; }

        .change-detail-inner {
          padding: 0 1.5rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .change-field { display: flex; flex-direction: column; gap: 0.25rem; }

        .change-field-label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--gray-dim);
        }

        .change-field-value {
          font-family: 'Courier New', monospace;
          font-size: 0.82rem;
          color: var(--cta);
          background: rgba(6,182,212,0.08);
          padding: 4px 8px;
          border-radius: 4px;
        }

        .change-reason {
          font-size: 0.85rem;
          color: #CCC;
          line-height: 1.5;
        }

        .change-warnings {
          padding: 1rem 1.5rem;
          background: rgba(245,158,11,0.07);
          border-top: 1px solid rgba(245,158,11,0.2);
        }

        .change-warnings-title {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8rem;
          font-weight: 700;
          color: #F59E0B;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .change-warnings-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .change-warnings-list li {
          font-size: 0.8rem;
          color: #CCA63A;
          padding-left: 0.75rem;
          position: relative;
        }

        .change-warnings-list li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: #F59E0B;
        }
      `}</style>
    </div>
  );
}
