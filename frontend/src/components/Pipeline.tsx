"use client";

import React from "react";

export type PipelineStage =
  | "idle"
  | "analyzing_ad"
  | "fetching_page"
  | "generating_changes"
  | "applying_changes"
  | "done"
  | "failed";

const STAGES: { key: PipelineStage; label: string }[] = [
  { key: "analyzing_ad",       label: "Analyzing Ad" },
  { key: "fetching_page",      label: "Fetching Page" },
  { key: "generating_changes", label: "Generating Changes" },
  { key: "applying_changes",   label: "Applying Changes" },
  { key: "done",               label: "Done" },
];

function getStageIndex(stage: PipelineStage): number {
  return STAGES.findIndex((s) => s.key === stage);
}

interface PipelineProps {
  stage: PipelineStage;
  error?: string | null;
}

export default function Pipeline({ stage, error }: PipelineProps) {
  const currentIndex = getStageIndex(stage);
  const progress =
    stage === "done" ? 100 : stage === "idle" ? 0 : Math.round(((currentIndex + 1) / STAGES.length) * 100);

  return (
    <div className="pipeline-container animate-fade-up" role="status" aria-live="polite" aria-label="Pipeline progress">
      {/* Progress Bar */}
      <div className="pipeline-bar-track" aria-hidden="true">
        <div
          className="pipeline-bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stages */}
      <ol className="pipeline-stages" aria-label="Processing stages">
        {STAGES.map((s, i) => {
          const isDone    = i < currentIndex || stage === "done";
          const isActive  = i === currentIndex && stage !== "done" && stage !== "idle";
          const isFailed  = stage === "failed" && i === currentIndex;
          const isPending = i > currentIndex && stage !== "done";

          return (
            <li
              key={s.key}
              className={[
                "pipeline-step",
                isDone   ? "pipeline-step--done"    : "",
                isActive ? "pipeline-step--active"  : "",
                isFailed ? "pipeline-step--failed"  : "",
                isPending ? "pipeline-step--pending" : "",
              ].filter(Boolean).join(" ")}
              aria-current={isActive ? "step" : undefined}
            >
              <span className="pipeline-step-dot" aria-hidden="true">
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : isActive ? (
                  <span className="pipeline-spinner animate-spin" aria-hidden="true" />
                ) : isFailed ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <span className="pipeline-dot-inner" aria-hidden="true" />
                )}
              </span>
              <span className="pipeline-step-label">{s.label}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="pipeline-error" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {error}
        </p>
      )}

      <style jsx>{`
        .pipeline-container {
          padding: 1.5rem;
          background: var(--dark-card);
          border: 1px solid #222;
          border-radius: var(--radius-lg);
        }

        .pipeline-bar-track {
          width: 100%;
          height: 4px;
          background: #2A2A2A;
          border-radius: 2px;
          margin-bottom: 1.5rem;
          overflow: hidden;
        }

        .pipeline-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary), var(--cta));
          border-radius: 2px;
          transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        .pipeline-stages {
          display: flex;
          justify-content: space-between;
          list-style: none;
          gap: 0.5rem;
        }

        .pipeline-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          flex: 1;
        }

        .pipeline-step-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #333;
          background: var(--dark-surface);
          color: var(--gray-dim);
          transition: all 250ms ease;
          flex-shrink: 0;
        }

        .pipeline-step--done .pipeline-step-dot {
          background: var(--cta);
          border-color: var(--cta);
          color: var(--white);
        }

        .pipeline-step--active .pipeline-step-dot {
          border-color: var(--primary);
          background: rgba(236,72,153,0.12);
          color: var(--primary);
          animation: pulseGlow 1.5s ease infinite;
        }

        .pipeline-step--failed .pipeline-step-dot {
          border-color: #EF4444;
          background: rgba(239,68,68,0.12);
          color: #EF4444;
        }

        .pipeline-step-label {
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.02em;
          text-align: center;
          color: var(--gray-dim);
          transition: color 250ms ease;
        }

        .pipeline-step--done .pipeline-step-label,
        .pipeline-step--active .pipeline-step-label {
          color: var(--white);
        }

        .pipeline-spinner {
          display: block;
          width: 10px;
          height: 10px;
          border: 2px solid rgba(236,72,153,0.3);
          border-top-color: var(--primary);
          border-radius: 50%;
        }

        .pipeline-dot-inner {
          display: block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #444;
        }

        .pipeline-error {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 1rem;
          color: #EF4444;
          font-size: 0.85rem;
          font-weight: 500;
        }

        @media (max-width: 640px) {
          .pipeline-stages { gap: 0; }
          .pipeline-step-label { font-size: 0.62rem; }
          .pipeline-step-dot { width: 22px; height: 22px; }
        }
      `}</style>
    </div>
  );
}
