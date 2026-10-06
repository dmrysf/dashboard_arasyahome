export type LiveEvent = { seq: number; type: string; exceptionId?: string; transferId?: string; orderId?: string; orderNumber?: string; status?: string; decidedBy?: string; requestId?: string; revisionNumber?: number };
type Frame = { event: string; id: number | null; data: Record<string, unknown> };

/** Parses a complete text/event-stream body; malformed data lines are skipped. */
export function parseSse(text: string): Frame[] {
  const frames: Frame[] = [];
  for (const block of text.replace(/\r\n/g, "\n").split("\n\n")) {
    let event = "message";
    let id: number | null = null;
    let data: Record<string, unknown> | null = null;
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("id: ")) { const value = Number(line.slice(4)); id = Number.isSafeInteger(value) && value > 0 ? value : null; }
      else if (line.startsWith("data: ")) {
        try { const parsed: unknown = JSON.parse(line.slice(6)); data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; }
        catch { data = null; }
      }
    }
    if (data) frames.push({ event, id, data });
  }
  return frames;
}

export type LiveOptions = {
  fetchBatch: (after: number | null, signal: AbortSignal) => Promise<{ status: number; text: string }>;
  onEvent: (event: LiveEvent) => void;
  onState?: (state: "connected" | "reconnecting") => void;
  isVisible?: () => boolean;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  if (signal.aborted) { resolve(); return; }
  const timer = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

/**
 * Reconnecting reader of the authenticated event stream. It starts at the current cursor (no history),
 * resumes after the last cursor and never delivers a sequence number twice. Failures back off up to 30 s;
 * 401/403 stop the loop (the session handling takes over).
 */
export function startLive(options: LiveOptions): () => void {
  const controller = new AbortController();
  const sleep = options.sleep ?? wait;
  const visible = options.isVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible");
  let cursor: number | null = null;
  let lastDelivered = 0;
  let failures = 0;
  let bootstrapped = false;
  void (async () => {
    while (!controller.signal.aborted) {
      try {
        const batch = await options.fetchBatch(cursor, controller.signal);
        if (batch.status === 401 || batch.status === 403) return;
        if (batch.status !== 200) throw new Error(`live ${batch.status}`);
        for (const frame of parseSse(batch.text)) {
          if (frame.event === "ready" || frame.event === "cursor") {
            const next = Number(frame.data.cursor);
            if (Number.isSafeInteger(next) && next >= 0 && (cursor === null || next >= cursor)) cursor = next;
            continue;
          }
          if (frame.id === null || frame.id <= lastDelivered) continue;
          lastDelivered = frame.id;
          const text = (key: string) => (typeof frame.data[key] === "string" ? frame.data[key] as string : undefined);
          options.onEvent({ seq: frame.id, type: frame.event, exceptionId: text("exceptionId"), transferId: text("transferId"), orderId: text("orderId"), orderNumber: text("orderNumber"), status: text("status"), decidedBy: text("decidedBy"), requestId: text("requestId"),
            revisionNumber: typeof frame.data.revisionNumber === "number" && Number.isSafeInteger(frame.data.revisionNumber) ? frame.data.revisionNumber : undefined });
        }
        if (failures > 0 || !bootstrapped) options.onState?.("connected");
        bootstrapped = true;
        failures = 0;
        await sleep(visible() ? 2_500 : 15_000, controller.signal);
      } catch {
        if (controller.signal.aborted) return;
        failures += 1;
        options.onState?.("reconnecting");
        await sleep(Math.min(30_000, 2_000 * 2 ** (failures - 1)), controller.signal);
      }
    }
  })();
  return () => controller.abort();
}
