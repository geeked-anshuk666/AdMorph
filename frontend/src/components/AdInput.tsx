"use client";

import React, { useRef, useState } from "react";

interface AdInputProps {
  onAdReady: (data: { base64?: string; url?: string; thumbnail: string }) => void;
}

export default function AdInput({ onAdReady }: AdInputProps) {
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [dragging, setDragging] = useState(false);
  const [thumbnail, setThumbnail] = useState<string>("");
  const [urlValue, setUrlValue] = useState("");
  const [urlError, setUrlError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_BYTES = 30 * 1024 * 1024; // 30 MB
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("unsupported image format - use JPEG, PNG, WebP, or GIF");
      return;
    }
    if (file.size > MAX_BYTES) {
      alert("image too large - max 30MB");
      return;
    }
    const base64 = await readFileAsBase64(file);
    const objectUrl = URL.createObjectURL(file);
    setThumbnail(objectUrl);
    setFileName(file.name);
    onAdReady({ base64, thumbnail: objectUrl });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleUrlSubmit() {
    setUrlError("");
    if (!urlValue.startsWith("http://") && !urlValue.startsWith("https://")) {
      setUrlError("URL must start with http:// or https://");
      return;
    }
    setThumbnail(urlValue);
    onAdReady({ url: urlValue, thumbnail: urlValue });
  }

  return (
    <div className="ad-input">
      {/* Tabs */}
      <div className="ad-tabs" role="tablist" aria-label="Ad input method">
        {(["upload", "url"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            id={`ad-tab-${t}`}
            aria-controls={`ad-panel-${t}`}
            onClick={() => setTab(t)}
            className={`ad-tab ${tab === t ? "ad-tab--active" : ""}`}
          >
            {t === "upload" ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M7 1v9M3.5 4.5L7 1l3.5 3.5M1 11h12v2H1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Upload
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M5.5 8.5a4 4 0 005.657-5.657L9.743 4.257M8.5 5.5a4 4 0 00-5.657 5.657L4.257 9.743M5 9l-2 2M9 5l2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                URL
              </>
            )}
          </button>
        ))}
      </div>

      {/* Upload panel */}
      <div
        id="ad-panel-upload"
        role="tabpanel"
        aria-labelledby="ad-tab-upload"
        hidden={tab !== "upload"}
      >
        <div
          className={`drop-zone ${dragging ? "drop-zone--dragging" : ""} ${thumbnail ? "drop-zone--filled" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Drop or click to upload ad image"
          onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        >
          {thumbnail ? (
            <div className="drop-zone-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbnail} alt="Ad creative preview" className="ad-thumbnail" />
              <p className="drop-zone-filename">{fileName}</p>
              <span className="drop-zone-change">Click to change</span>
            </div>
          ) : (
            <div className="drop-zone-placeholder">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect x="1" y="1" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                <path d="M16 10v12M10 16h12" stroke="#EC4899" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="drop-zone-hint">
                <strong>Drag &amp; drop</strong> your ad image here<br />
                <span>or click to browse</span>
              </p>
              <p className="drop-zone-spec">JPEG · PNG · WebP · GIF · Max 30MB</p>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="visually-hidden"
          aria-label="File upload input"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
      </div>

      {/* URL panel */}
      <div
        id="ad-panel-url"
        role="tabpanel"
        aria-labelledby="ad-tab-url"
        hidden={tab !== "url"}
      >
        <div className="url-input-row">
          <input
            type="url"
            className="input"
            placeholder="https://example.com/ad-image.jpg"
            value={urlValue}
            onChange={(e) => { setUrlValue(e.target.value); setUrlError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
            aria-label="Ad image URL"
            aria-describedby={urlError ? "ad-url-error" : undefined}
          />
          <button
            className="btn-primary"
            onClick={handleUrlSubmit}
            disabled={!urlValue}
            aria-label="Load ad from URL"
          >
            Load
          </button>
        </div>
        {urlError && (
          <p id="ad-url-error" className="field-error" role="alert">
            {urlError}
          </p>
        )}
        {thumbnail && tab === "url" && (
          <div className="url-preview animate-fade-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnail} alt="Ad preview" className="ad-thumbnail" onError={() => setThumbnail("")} />
          </div>
        )}
      </div>

      <style jsx>{`
        .ad-input { display: flex; flex-direction: column; gap: 1rem; }

        .ad-tabs {
          display: flex;
          background: #111;
          border-radius: var(--radius-base);
          padding: 3px;
          gap: 3px;
        }

        .ad-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--gray-dim);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: background var(--transition), color var(--transition);
          font-family: inherit;
        }

        .ad-tab--active {
          background: var(--dark-card);
          color: var(--white);
        }

        .drop-zone {
          border: 1.5px dashed #333;
          border-radius: var(--radius-lg);
          padding: 2rem;
          cursor: pointer;
          transition: border-color var(--transition), background var(--transition);
          min-height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .drop-zone:hover,
        .drop-zone--dragging {
          border-color: var(--primary);
          background: rgba(236,72,153,0.04);
        }

        .drop-zone--filled { border-style: solid; border-color: var(--cta); }

        .drop-zone-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          color: var(--gray-dim);
          text-align: center;
        }

        .drop-zone-hint { font-size: 0.9rem; color: var(--gray-dim); }
        .drop-zone-hint strong { color: var(--white); }
        .drop-zone-spec { font-size: 0.75rem; color: #555; }

        .drop-zone-preview {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .ad-thumbnail {
          max-width: 240px;
          max-height: 140px;
          object-fit: contain;
          border-radius: var(--radius-base);
        }

        .drop-zone-filename { font-size: 0.8rem; color: var(--gray-dim); }
        .drop-zone-change { font-size: 0.75rem; color: var(--cta); }

        .url-input-row {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        .url-preview {
          margin-top: 1rem;
          display: flex;
          justify-content: center;
        }

        .field-error {
          font-size: 0.8rem;
          color: #EF4444;
          margin-top: 0.4rem;
        }
      `}</style>
    </div>
  );
}
