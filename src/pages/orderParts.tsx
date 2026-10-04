import type { OrderSummary, ProductionState } from "../api/types";
import { Badge } from "../components/ui";
import { useI18n } from "../i18n/context";

/**
 * Commerce and production are rendered with different shapes on purpose: the store status is a neutral
 * outlined chip prefixed "store", the production stage a filled chip with its ordinal. They are never
 * merged into one "status".
 */
export function CommerceChip({ status }: { status: OrderSummary["commerce"]["status"] }) {
  const { t } = useI18n();
  return (
    <span className="chip chip-commerce" data-kind="commerce" title={t.orders.commerceStatus}>
      <span className="chip-prefix" aria-hidden="true">⌂</span>
      {status ? (status.label ?? status.code) : t.orders.noCommerceStatus}
    </span>
  );
}

export function StageChip({ stage }: { stage: OrderSummary["production"]["stage"] }) {
  const { t, stage: stageName } = useI18n();
  return (
    <span className="chip chip-stage" data-kind="production" data-stage-id={stage.id} title={t.orders.stage}>
      <span className="ordinal">{stage.ordinal}</span>
      {stageName(stage.id, stage.label)}
    </span>
  );
}

const STATE_TONE: Record<ProductionState, "accent" | "success" | "neutral"> = { active: "accent", completed: "success", cancelled: "neutral" };

export function ProductionStateBadge({ state }: { state: ProductionState }) {
  const { t } = useI18n();
  return <span data-production-state={state}><Badge tone={STATE_TONE[state] ?? "neutral"}>{t.orders.states[state] ?? state}</Badge></span>;
}

export function OwnerName({ owner }: { owner: OrderSummary["production"]["owner"] }) {
  const { t } = useI18n();
  return owner ? <span data-owner={owner.id}>{owner.displayName}</span> : <span className="muted" data-owner="">{t.orders.noOwner}</span>;
}

/** Time in the current stage, measured like the production overview; only meaningful while production is active. */
export function TimeInStage({ order, referenceTime }: { order: Pick<OrderSummary, "production">; referenceTime: number }) {
  const { duration } = useI18n();
  if (order.production.state !== "active") return <span className="muted">—</span>;
  return <span>{duration(referenceTime - Date.parse(order.production.stageEnteredAt))}</span>;
}
