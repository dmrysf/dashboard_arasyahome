export type CuttingTransfer = {
  id: string; status: "pending" | "approved" | "accepted" | "completed" | "rejected" | "cancelled"; version: number;
  order: { id: string; orderNumber: string; source: string; productionVersion: number };
  from: { id: string; name: string }; to: { id: string; name: string };
  reason: { key: string; label: string; comment: string | null };
  requestedAt: string; decidedAt: string | null; acceptedAt: string | null; qrVerifiedAt: string | null; resolvedAt: string | null;
  decisionComment: string | null; decidedBy: string | null;
  actions: { canDecide: boolean; canCancel: boolean; canAccept: boolean; canVerify: boolean };
  history?: { action: string; actor: string; at: string; facts: Record<string, unknown> }[];
};
export type DisplayDevice = { id: string; name: string; pairedAt: string | null; lastSeenAt: string | null; revokedAt: string | null; pairingExpiresAt: string | null; sessionExpiresAt: string | null };
export type DisplaySettings = { thresholds: number[]; version: number };
export type DisplayPairing = { id: string; pairingExpiresAt: string; pairingCode?: string };
export const transferStatus = { pending: "Așteaptă aprobarea", approved: "Aprobat · așteaptă acceptarea", accepted: "Acceptat · așteaptă QR", completed: "Transfer finalizat", rejected: "Respins", cancelled: "Anulat de Root" };
