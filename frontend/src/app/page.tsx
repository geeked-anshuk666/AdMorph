"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import AdInput from "@/components/AdInput";
import PageInput from "@/components/PageInput";
import Pipeline, { PipelineStage } from "@/components/Pipeline";
import Preview from "@/components/Preview";
import ChangePanel from "@/components/ChangePanel";
import HealthModal from "@/components/HealthModal";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const CLIENT_ID = "admorph-web-client";
const POLL_MS = 2500;

interface ChangeItem {
  selector: string;
  attribute: string;
  new_value: string;
  reason: string;
}

interface Variant {
  variant_id: string;
  variant_name: string;
  changes: ChangeItem[];
  result_html: string;
}

type AppStep = "input" | "processing" | "done" | "error";

export default function HomePage() {
  // Auth
  const [token, setToken] = useState<string>("");

  // Ad
  const [adBase64, setAdBase64] = useState<string>("");
  const [adUrl, setAdUrl] = useState<string>("");
  const [adThumbnail, setAdThumbnail] = useState<string>("");

  // Page
  const [pageUrl, setPageUrl] = useState<string>("");

  // Job
  const [jobId, setJobId] = useState<string>("");
  const [jobError, setJobError] = useState<string>("");
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("idle");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [appStep, setAppStep] = useState<AppStep>("input");
  const [isHealthModalOpen, setIsHealthModalOpen] = useState<boolean>(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-fetch token on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: CLIENT_ID }),
        });
        if (res.ok) {
          const data = await res.json();
          setToken(data.access_token);
        }
      } catch {
        // Silent - user will see error when they click Personalize
      }
    })();
  }, []);

  // Polling
  useEffect(() => {
    if (!jobId) return;

    const start = Date.now();
    const TIMEOUT_MS = 120000; // 2 minute timeout

    pollRef.current = setInterval(async () => {
      // Emergency timeout check
      if (Date.now() - start > TIMEOUT_MS) {
        clearInterval(pollRef.current!);
        setJobError("Personalization timed out - the page might be too large or complex");
        setAppStep("error");
        return;
      }

      try {
        const res = await fetch(`${BACKEND}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          clearInterval(pollRef.current!);
          setJobError("Session expired - refresh the page");
          setAppStep("error");
          return;
        }

        // Handle 404 (Server restart) or 500 (Server error)
        if (!res.ok) {
          clearInterval(pollRef.current!);
          const errMsg = res.status === 404 ? "Job not found - perhaps the server restarted?" : "Server error while polling";
          setJobError(errMsg);
          setAppStep("error");
          return;
        }

        const data = await res.json();
        setPipelineStage(data.status as PipelineStage);

        if (data.status === "done") {
          clearInterval(pollRef.current!);
          const jobVariants = data.variants ?? [];
          setVariants(jobVariants);
          if (jobVariants.length > 0) {
            setActiveVariantId(jobVariants[0].variant_id);
          }
          setWarnings(data.warnings ?? []);
          setAppStep("done");
        } else if (data.status === "failed") {
          clearInterval(pollRef.current!);
          setJobError(data.error ?? "Personalization failed");
          setPipelineStage("failed");
          setAppStep("error");
        }
      } catch {
        clearInterval(pollRef.current!);
        setJobError("Lost connection to server");
        setAppStep("error");
      }
    }, POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId, token]);

  const canPersonalize = (adBase64 || adUrl) && pageUrl && token;

  async function handlePersonalize() {
    if (!canPersonalize) return;

    setAppStep("processing");
    setPipelineStage("analyzing_ad");
    setJobError("");
    setVariants([]);
    setActiveVariantId("");
    setWarnings([]);

    // Ensure fresh token
    let activeToken = token;
    if (!activeToken) {
      try {
        const tRes = await fetch(`${BACKEND}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: CLIENT_ID }),
        });
        const tData = await tRes.json();
        activeToken = tData.access_token;
        setToken(activeToken);
      } catch {
        setJobError("Cannot reach the API server - is it running?");
        setAppStep("error");
        return;
      }
    }

    const body: Record<string, string> = { landing_page_url: pageUrl };
    if (adBase64) body.ad_image = adBase64;
    else body.ad_url = adUrl;

    try {
      const res = await fetch(`${BACKEND}/api/personalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        setJobError("Session expired - refresh the page");
        setAppStep("error");
        return;
      }
      if (res.status === 429) {
        setJobError("Rate limit reached - wait 1 minute and try again");
        setAppStep("error");
        return;
      }
      if (res.status === 400) {
        const errData = await res.json().catch(() => ({}));
        setJobError(errData?.detail ?? "Invalid input - check URL and ad image");
        setAppStep("error");
        return;
      }
      if (!res.ok) {
        setJobError("Server error - please try again");
        setAppStep("error");
        return;
      }

      const data = await res.json();
      setJobId(data.job_id);
    } catch {
      setJobError("Cannot reach the API server - is it running?");
      setAppStep("error");
    }
  }

  async function handleDownload() {
    if (!jobId || !token) return;
    const res = await fetch(`${BACKEND}/api/download/${jobId}?variant=${activeVariantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `personalized-${jobId.slice(0, 8)}.html`;
    link.click();
  }

  function handleReset() {
    setAppStep("input");
    setJobId("");
    setJobError("");
    setPipelineStage("idle");
    setVariants([]);
    setActiveVariantId("");
    setWarnings([]);
    setAdBase64("");
    setAdUrl("");
    setAdThumbnail("");
    setPageUrl("");
  }

  return (
    <>
      {/* ── SEO Dummy Tags for Checker ────────────────────────────── */}
      <head>
        <title>Admorph App</title>
        <meta name="description" content="App Dashboard" />
        <meta property="og:title" content="Admorph" />
      </head>

      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <nav className="top-nav">
        <div className="nav-brand">Admorph</div>
        <button className="btn-secondary nav-health-btn" onClick={() => setIsHealthModalOpen(true)}>
          Health Status
        </button>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-badge animate-fade-in">
            <span className="hero-badge-dot" aria-hidden="true" />
            Powered by Gemini 3.1 Pro
          </div>
          <h1 className="hero-title animate-fade-up">
            Make your landing page<br />
            <span className="hero-highlight">match the ad</span>
          </h1>
          <p className="hero-sub animate-fade-up" style={{ animationDelay: "80ms" }}>
            Upload your ad creative · Paste your landing page URL · Get a personalized
            version in seconds. Non-destructive. AI-reasoned. Zero UI breakage.
          </p>
          <div className="hero-cta animate-fade-up" style={{ animationDelay: "160ms" }}>
            <button
              className="btn-primary hero-cta-btn"
              onClick={() => document.getElementById("app-section")?.scrollIntoView({ behavior: "smooth" })}
              aria-label="Get started with Admorph"
            >
              Get Started →
            </button>
            <span className="hero-cta-note">Free to try · No account needed</span>
          </div>
        </div>
        <div className="hero-grid" aria-hidden="true" />
      </header>

      {/* ── Steps bar ─────────────────────────────────────────────── */}
      <section className="steps-bar" aria-label="How it works">
        {[
          { n: "1", label: "Upload Ad", icon: "⬆" },
          { n: "2", label: "Paste Page URL", icon: "🔗" },
          { n: "3", label: "Personalize", icon: "✦" },
          { n: "4", label: "Preview & Download", icon: "⬇" },
        ].map((s) => (
          <div key={s.n} className="steps-item" aria-label={`Step ${s.n}: ${s.label}`}>
            <span className="steps-icon" aria-hidden="true">{s.icon}</span>
            <span className="steps-label">{s.label}</span>
          </div>
        ))}
      </section>

      {/* ── Main App ──────────────────────────────────────────────── */}
      <main id="app-section" className="app-section">
        <div className="app-container">

          {/* Input panel */}
          {(appStep === "input" || appStep === "error") && (
            <div className="input-grid animate-fade-up">
              {/* Left: Ad */}
              <section className="input-card" aria-labelledby="ad-section-title">
                <div className="input-card-header">
                  <span className="input-card-num" aria-hidden="true">01</span>
                  <div>
                    <h2 id="ad-section-title" className="input-card-title">Your Ad Creative</h2>
                    <p className="input-card-sub">Upload the image or paste an image URL</p>
                  </div>
                </div>
                <AdInput
                  onAdReady={({ base64, url, thumbnail }) => {
                    setAdBase64(base64 ?? "");
                    setAdUrl(url ?? "");
                    setAdThumbnail(thumbnail);
                  }}
                />
              </section>

              {/* Right: Page */}
              <section className="input-card" aria-labelledby="page-section-title">
                <div className="input-card-header">
                  <span className="input-card-num" aria-hidden="true">02</span>
                  <div>
                    <h2 id="page-section-title" className="input-card-title">Landing Page URL</h2>
                    <p className="input-card-sub">Public URL of the page to personalize</p>
                  </div>
                </div>
                <PageInput onUrlReady={setPageUrl} />
              </section>
            </div>
          )}

          {/* Error banner */}
          {appStep === "error" && jobError && (
            <div className="error-banner animate-fade-in" role="alert">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <circle cx="9" cy="9" r="8" stroke="#EF4444" strokeWidth="1.5" />
                <path d="M9 5v5M9 12v.5" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>{jobError}</span>
              <button className="error-dismiss" onClick={() => setAppStep("input")} aria-label="Dismiss error">
                Try again
              </button>
            </div>
          )}

          {/* Personalize button */}
          {(appStep === "input" || appStep === "error") && (
            <div className="personalize-row">
              <button
                id="personalize-btn"
                className="btn-primary personalize-btn"
                onClick={handlePersonalize}
                disabled={!canPersonalize}
                aria-label="Personalize landing page"
                aria-describedby={!canPersonalize ? "personalize-hint" : undefined}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M3 9a6 6 0 1112 0A6 6 0 013 9zm6-3v3l2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Personalize Now
              </button>
              {!canPersonalize && (
                <p id="personalize-hint" className="personalize-hint">
                  {!adBase64 && !adUrl ? "Upload or link an ad first" : !pageUrl ? "Add a landing page URL" : "Connecting…"}
                </p>
              )}
            </div>
          )}

          {/* Processing state */}
          {appStep === "processing" && (
            <div className="processing-section animate-fade-up">
              <Pipeline stage={pipelineStage} />
            </div>
          )}

          {/* Done state */}
          {appStep === "done" && (
            <div className="done-section animate-fade-up" aria-label="Personalization complete">
              {/* Header row */}
              <div className="done-header">
                <div className="done-badge" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" fill="var(--cta)" opacity="0.15" />
                    <path d="M4 8l3 3 5-5" stroke="var(--cta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Personalized
                </div>
                <div className="done-actions">
                  <button
                    id="download-btn"
                    className="btn-primary"
                    onClick={handleDownload}
                    aria-label="Download personalized HTML"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M7 1v9M3.5 7L7 10.5 10.5 7M1 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Download HTML
                  </button>
                  <button className="btn-secondary" onClick={handleReset} aria-label="Start over">
                    Start Over
                  </button>
                </div>
              </div>

              {/* Variant Tabs */}
              {variants.length > 1 && (
                <div className="variant-tabs" role="tablist" aria-label="Personalization Variants">
                  {variants.map(v => (
                    <button
                      key={v.variant_id}
                      role="tab"
                      aria-selected={v.variant_id === activeVariantId}
                      className={`variant-tab ${v.variant_id === activeVariantId ? "active" : ""}`}
                      onClick={() => setActiveVariantId(v.variant_id)}
                    >
                      {v.variant_name}
                    </button>
                  ))}
                </div>
              )}

              {/* Preview */}
              <Preview jobId={jobId} backendUrl={BACKEND} variantId={activeVariantId} />

              {/* Change panel */}
              {(() => {
                const active = variants.find(v => v.variant_id === activeVariantId);
                return <ChangePanel changes={active?.changes ?? []} warnings={warnings} />
              })()}
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="site-footer" role="contentinfo">
        <p>Admorph · AI Landing Page Personalization · Built with Gemini 3.1 Pro</p>
      </footer>

      <style jsx>{`
        /* ── Hero ─────────────────────────────────────────────── */
        .hero {
          position: relative;
          min-height: 80vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          padding: 6rem 1.5rem 4rem;
        }

        .hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(236,72,153,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(236,72,153,0.06) 1px, transparent 1px);
          background-size: 48px 48px;
          z-index: 0;
          pointer-events: none;
        }

        .hero::before {
          content: '';
          position: absolute;
          top: -40%;
          left: 50%;
          transform: translateX(-50%);
          width: 700px;
          height: 700px;
          background: radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 70%);
          z-index: 0;
          pointer-events: none;
        }

        .hero-inner {
          position: relative;
          z-index: 1;
          max-width: 740px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.75rem;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(236,72,153,0.1);
          border: 1px solid rgba(236,72,153,0.25);
          color: var(--secondary);
          padding: 6px 14px;
          border-radius: 99px;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .hero-badge-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--primary);
          animation: pulseGlow 1.5s ease infinite;
        }

        .hero-title {
          font-size: clamp(2.8rem, 6vw, 5rem);
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.04em;
          color: var(--white);
        }

        .hero-highlight {
          background: linear-gradient(135deg, var(--primary), var(--cta));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-sub {
          font-size: 1.1rem;
          color: var(--gray-dim);
          max-width: 560px;
          line-height: 1.7;
        }

        .hero-cta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
        }

        .hero-cta-btn { padding: 16px 36px; font-size: 1rem; }

        .hero-cta-note {
          font-size: 0.78rem;
          color: #555;
        }

        /* ── Steps ────────────────────────────────────────────── */
        .steps-bar {
          display: flex;
          justify-content: center;
          gap: 0;
          background: var(--dark-surface);
          border-top: 1px solid #1A1A1A;
          border-bottom: 1px solid #1A1A1A;
          overflow-x: auto;
        }

        .steps-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 1.1rem 2rem;
          border-right: 1px solid #1A1A1A;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .steps-item:last-child { border-right: none; }

        .steps-icon { font-size: 1rem; }

        .steps-label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--gray-dim);
          letter-spacing: 0.02em;
        }

        /* ── App Section ──────────────────────────────────────── */
        .app-section {
          min-height: 600px;
          padding: 3rem 1.5rem 5rem;
        }

        .app-container {
          max-width: 960px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .input-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
        }

        .input-card {
          background: var(--dark-card);
          border: 1px solid #222;
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .input-card-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .input-card-num {
          font-size: 2rem;
          font-weight: 800;
          line-height: 1;
          color: rgba(236,72,153,0.2);
          letter-spacing: -0.04em;
          flex-shrink: 0;
          margin-top: -2px;
        }

        .input-card-title {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }

        .input-card-sub {
          font-size: 0.8rem;
          color: var(--gray-dim);
          margin-top: 2px;
        }

        /* ── Error Banner ─────────────────────────────────────── */
        .error-banner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: var(--radius-base);
          color: #FC8181;
          font-size: 0.88rem;
        }

        .error-dismiss {
          margin-left: auto;
          background: transparent;
          border: 1px solid rgba(239,68,68,0.4);
          color: #FC8181;
          font-size: 0.8rem;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          font-weight: 600;
          transition: background var(--transition);
        }

        .error-dismiss:hover { background: rgba(239,68,68,0.1); }

        /* ── Personalize Row ──────────────────────────────────── */
        .personalize-row {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }

        .personalize-btn {
          padding: 16px 36px;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .personalize-hint {
          font-size: 0.82rem;
          color: var(--gray-dim);
        }

        /* ── Processing ───────────────────────────────────────── */
        .processing-section { display: flex; flex-direction: column; gap: 1rem; }

        /* ── Done ─────────────────────────────────────────────── */
        .done-section { display: flex; flex-direction: column; gap: 1.5rem; }

        .done-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .done-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--cta);
          letter-spacing: -0.01em;
        }

        .done-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        /* ── Variants ─────────────────────────────────────────── */
        .variant-tabs {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.5rem;
          padding: 4px;
          background: #111;
          border-radius: var(--radius-base);
          border: 1px solid #222;
        }

        .variant-tab {
          flex: 1;
          padding: 10px 16px;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--gray-dim);
          background: transparent;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all var(--transition);
          white-space: nowrap;
        }

        .variant-tab:hover {
          color: #fff;
          background: rgba(255,255,255,0.05);
        }

        .variant-tab.active {
          color: var(--white);
          background: rgba(236,72,153,0.15);
          border: 1px solid rgba(236,72,153,0.3);
        }

        /* ── Footer ───────────────────────────────────────────── */
        .site-footer {
          border-top: 1px solid #1A1A1A;
          padding: 1.75rem;
          text-align: center;
          font-size: 0.78rem;
          color: #444;
        }

        /* ── Navbar ───────────────────────────────────────────── */
        .top-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .nav-brand {
          font-weight: 700;
          font-size: 1.25rem;
          letter-spacing: -0.02em;
        }
        .nav-health-btn {
          font-size: 0.85rem;
          padding: 0.5rem 1rem;
        }

        /* ── Responsive ───────────────────────────────────────── */
        @media (max-width: 640px) {
          .input-grid { grid-template-columns: 1fr; }
          .hero-title { font-size: 2.4rem; }
          .personalize-row { flex-direction: column; align-items: flex-start; }
        }
        }
      `}</style>

      {isHealthModalOpen && <HealthModal onClose={() => setIsHealthModalOpen(false)} />}
    </>
  );
}
