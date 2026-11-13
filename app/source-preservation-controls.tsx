import { useId, useRef, useState } from "react";
import { activateBrowserFile } from "./browser-file-activation.ts";
import { recoverSourcePreservation, type RecoveredSource } from "./source-preservation.ts";

export function PreservationDownload({ file, error }: { file: File | null; error: string }) {
  const [message, setMessage] = useState("");
  if (!file && !error) return null;
  return <div className="source-preservation">
    {file && <>
      <button type="button" className="secondary-button" onClick={() => {
        try {
          activateBrowserFile(file, "download");
          setMessage("Preservation package download requested. Confirm the file was saved.");
        } catch {
          setMessage("The download could not start. Try downloading the package again.");
        }
      }}>Download preservation package</button>
      <p>Includes the exact original file and this review. Download before leaving or selecting another source; workspace backups do not include it. Plaintext, not encrypted.</p>
    </>}
    {error && <p className="field-error" role="alert">Preservation unavailable: {error}</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}

export function SourcePreservationRecovery() {
  const id = useId();
  const request = useRef(0);
  const [busy, setBusy] = useState(false);
  const [recovered, setRecovered] = useState<RecoveredSource | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const deliver = (file: File) => {
    try {
      activateBrowserFile(file, "download");
      setMessage("Download requested. Confirm the recovered file was saved.");
    } catch {
      setError("The download could not start. Try downloading again.");
    }
  };
  return <details className="source-preservation source-recovery">
    <summary>Recover a preserved source</summary>
    <p id={id}>Open a native preservation package to check its digests and recover the original file. Recovery does not apply records to this workspace.</p>
    <label className="file-field"><span>Choose preservation package</span><input
      type="file" accept=".json,application/json" disabled={busy} aria-describedby={id}
      onChange={async (event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;
        const attempt = ++request.current;
        setRecovered(null); setError(""); setMessage(""); setBusy(true);
        try {
          const result = await recoverSourcePreservation(file);
          if (attempt === request.current) setRecovered(result);
        } catch (cause) {
          if (attempt === request.current) setError(cause instanceof Error ? cause.message : "The package could not be recovered.");
        } finally {
          if (attempt === request.current) setBusy(false);
        }
      }}
    /></label>
    <p role="status">{busy ? "Checking preservation package…" : recovered ? "Package and original source digests match." : ""}</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    {recovered && <div className="source-recovery-result">
      <p><strong>{recovered.metadata.filename}</strong> · {recovered.metadata.bytes.toLocaleString()} bytes</p>
      <p>Recorded review: {recovered.review.snapshot.blocked ? "blocked" : "passed"} · {recovered.review.parserProfile}</p>
      <p>{String(recovered.review.snapshot.summary)}</p>
      <p className="source-digest">SHA-256: <code>{recovered.metadata.sha256}</code></p>
      <div className="button-row">
        <button type="button" className="secondary-button" onClick={() => deliver(recovered.file)}>Download original source</button>
        <button type="button" className="secondary-button" onClick={() => deliver(new File([JSON.stringify(recovered.review, null, 2)], "preserved-review.json", { type: "application/json" }))}>Download recorded review</button>
      </div>
      <p>Matching digests establish internal consistency, not authenticity. The recorded review is historical; review the recovered source again before applying it. Unsafe download-name characters are replaced; the package retains the original filename.</p>
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
