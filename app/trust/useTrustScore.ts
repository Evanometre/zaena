import { supabase } from "@/lib/supabase"; // adjust path to your supabase client
import { useCallback, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrustTier =
  | "unverified"
  | "bronze"
  | "silver"
  | "gold"
  | "zaena_verified";

export type TrajectoryStatus =
  | "improving"
  | "stable"
  | "declining"
  | "insufficient_data";

export interface TrustScoreData {
  overall_score: number;
  tier: TrustTier;
  trajectory: TrajectoryStatus;

  recording_integrity: {
    multiplier: number;
    live_rate_1h: number;
    anomaly_pct_30d: number;
    silent_backdated: number;
    consistency_bonus: boolean;
  };

  dimensions: {
    cash_flow: number;
    payment_behaviour: number;
    financial_discipline: number;
    customer_quality: number;
    longevity: number;
  };

  operating_profile: {
    start_hour: number;
    end_hour: number;
    confidence: number;
    profile_type: string;
  };

  metrics: {
    total_sales: number;
    days_active: number;
    recovery_rate_pct: number;
    avg_recovery_days: number;
    unique_customers: number;
    repeat_customer_pct: number;
    cash_collection_pct: number;
    supplier_payment_pct: number;
    void_rate_pct: number;
    whatsapp_receipt_pct: number;
  };
}

// ─── Raw RPC response shape (what Postgres actually returns) ──────────────────
// The function returns a single jsonb. Supabase wraps it as data[0].calculate_trust_score_v2

interface RawRPCResponse {
  overall_score: number;
  tier: string;
  trajectory: string;

  recording_integrity: {
    multiplier: number;
    live_rate_1h: number;
    anomaly_pct_30d: number;
    silent_backdated: number;
    consistency_bonus: boolean;
  };

  dimensions: {
    cash_flow: number;
    payment_behaviour: number;
    financial_discipline: number;
    customer_quality: number;
    longevity: number;
  };

  operating_profile?: {
    start_hour?: number;
    end_hour?: number;
    confidence?: number;
    profile_type?: string;
  };

  metrics: {
    total_sales: number;
    days_active: number;
    recovery_rate_pct: number;
    avg_recovery_days: number;
    unique_customers: number;
    repeat_customer_pct?: number;
    cash_collection_pct?: number;
    cash_collection_pc?: number; // the RPC currently returns this key name
    supplier_payment_pct?: number;
    void_rate_pct: number;
    whatsapp_receipt_pct?: number;
  };
}

// ─── Mapper ───────────────────────────────────────────────────────────────────
// Normalises the raw response into the clean shape the dashboard expects.
// Guards every field so null / undefined from sparse orgs doesn't crash the UI.

function mapRPCToScore(raw: RawRPCResponse): TrustScoreData {
  const m = raw.metrics ?? {};
  const op = raw.operating_profile ?? {};
  const ri = raw.recording_integrity ?? {};
  const d = raw.dimensions ?? {};

  return {
    overall_score: raw.overall_score ?? 0,
    tier: (raw.tier ?? "unverified") as TrustTier,
    trajectory: (raw.trajectory ?? "insufficient_data") as TrajectoryStatus,

    recording_integrity: {
      multiplier: ri.multiplier ?? 1.0,
      live_rate_1h: ri.live_rate_1h ?? 0,
      anomaly_pct_30d: ri.anomaly_pct_30d ?? 0,
      silent_backdated: ri.silent_backdated ?? 0,
      consistency_bonus: ri.consistency_bonus ?? false,
    },

    dimensions: {
      cash_flow: d.cash_flow ?? 0,
      payment_behaviour: d.payment_behaviour ?? 0,
      financial_discipline: d.financial_discipline ?? 0,
      customer_quality: d.customer_quality ?? 0,
      longevity: d.longevity ?? 0,
    },

    operating_profile: {
      start_hour: op.start_hour ?? 8,
      end_hour: op.end_hour ?? 20,
      // confidence comes as 0–1 from the DB; dashboard expects 0–1 too
      confidence: op.confidence ?? 0,
      profile_type: op.profile_type ?? "insufficient_data",
    },

    metrics: {
      total_sales: m.total_sales ?? 0,
      days_active: m.days_active ?? 0,
      recovery_rate_pct: m.recovery_rate_pct ?? 0,
      avg_recovery_days: m.avg_recovery_days ?? 0,
      unique_customers: m.unique_customers ?? 0,
      repeat_customer_pct: m.repeat_customer_pct ?? 0,
      // RPC currently returns cash_collection_pc (no trailing t) — handle both
      cash_collection_pct: m.cash_collection_pct ?? m.cash_collection_pc ?? 0,
      supplier_payment_pct: m.supplier_payment_pct ?? 0,
      void_rate_pct: m.void_rate_pct ?? 0,
      whatsapp_receipt_pct: m.whatsapp_receipt_pct ?? 0,
    },
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTrustScoreReturn {
  data: TrustScoreData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTrustScore(organizationId: string | null): UseTrustScoreReturn {
  const [data, setData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "calculate_trust_score_v2",
        { p_org_id: organizationId }
      );

      if (rpcError) throw rpcError;

      // Supabase returns the jsonb result directly as the data value
      // (not wrapped in an array) when the function returns a single scalar jsonb.
      // If your Supabase version wraps it, handle both:
      const raw: RawRPCResponse =
        Array.isArray(rpcData) ? rpcData[0]?.calculate_trust_score_v2 ?? rpcData[0]
        : rpcData;

      if (!raw) throw new Error("Empty response from trust score function");

      setData(mapRPCToScore(raw));
    } catch (err: any) {
      console.error("[useTrustScore] error:", err);
      setError(err?.message ?? "Failed to load trust score");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  return { data, loading, error, refresh: fetch };
}