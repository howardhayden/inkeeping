export type BrowserFileDisposition = "download" | "open";

export function isBrowserFile(value: unknown): value is File {
  if (typeof Blob === "undefined" || value === null || typeof value !== "object") return false;
  try {
    Blob.prototype.slice.call(value, 0, 0);
    const candidate = value as File;
    return typeof candidate.name === "string" && typeof candidate.lastModified === "number";
  } catch {
    return false;
  }
}

export async function readBrowserFileBytes(value: unknown): Promise<ArrayBuffer> {
  if (!isBrowserFile(value)) throw new Error("Artifact activation requires an immutable File.");
  return Blob.prototype.arrayBuffer.call(value) as Promise<ArrayBuffer>;
}

/** Synchronously offers one already-constructed immutable File to the browser. */
export function activateBrowserFile(file: File, disposition: BrowserFileDisposition): void {
  if (!isBrowserFile(file)) throw new Error("Artifact activation requires an immutable File.");
  if (disposition !== "download" && disposition !== "open") throw new Error("Artifact activation disposition is unsupported.");
  const url = URL.createObjectURL(file);
  let anchor: HTMLAnchorElement | null = null;
  try {
    anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener noreferrer";
    anchor.referrerPolicy = "no-referrer";
    if (disposition === "download") anchor.download = file.name;
    else anchor.target = "_blank";
    document.body.append(anchor);
    anchor.click();
    const revokeTimer: unknown = window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (typeof revokeTimer === "object" && revokeTimer !== null && "unref" in revokeTimer) {
      const unref = (revokeTimer as { unref?: unknown }).unref;
      if (typeof unref === "function") unref.call(revokeTimer);
    }
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor?.remove();
  }
}
