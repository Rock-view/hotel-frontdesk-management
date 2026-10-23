export type PolicyKey =
  | "guarantee"
  | "cancellation"
  | "photo_id"
  | "arrival_departure"
  | "receipt_footer";

export type PolicyTarget = "estimate" | "bill";

export type PolicyVisibility = {
  guarantee: { estimate: boolean; bill: boolean };
  cancellation: { estimate: boolean; bill: boolean };
  photo_id: { estimate: boolean; bill: boolean };
  arrival_departure: { estimate: boolean; bill: boolean };
  receipt_footer: { estimate: boolean; bill: boolean };
};

export const DEFAULT_POLICY_VISIBILITY: PolicyVisibility = {
  guarantee: { estimate: true, bill: true },
  cancellation: { estimate: true, bill: true },
  photo_id: { estimate: true, bill: false },
  arrival_departure: { estimate: true, bill: true },
  receipt_footer: { estimate: false, bill: true },
};

export function getPolicyVisibility(raw: unknown): PolicyVisibility {
  if (!raw || typeof raw !== "object") return DEFAULT_POLICY_VISIBILITY;
  const r = raw as Record<string, any>;
  return {
    guarantee: {
      estimate: r["guarantee"]?.["estimate"] ?? DEFAULT_POLICY_VISIBILITY.guarantee.estimate,
      bill: r["guarantee"]?.["bill"] ?? DEFAULT_POLICY_VISIBILITY.guarantee.bill,
    },
    cancellation: {
      estimate: r["cancellation"]?.["estimate"] ?? DEFAULT_POLICY_VISIBILITY.cancellation.estimate,
      bill: r["cancellation"]?.["bill"] ?? DEFAULT_POLICY_VISIBILITY.cancellation.bill,
    },
    photo_id: {
      estimate: r["photo_id"]?.["estimate"] ?? DEFAULT_POLICY_VISIBILITY.photo_id.estimate,
      bill: r["photo_id"]?.["bill"] ?? DEFAULT_POLICY_VISIBILITY.photo_id.bill,
    },
    arrival_departure: {
      estimate: r["arrival_departure"]?.["estimate"] ?? DEFAULT_POLICY_VISIBILITY.arrival_departure.estimate,
      bill: r["arrival_departure"]?.["bill"] ?? DEFAULT_POLICY_VISIBILITY.arrival_departure.bill,
    },
    receipt_footer: {
      estimate: r["receipt_footer"]?.["estimate"] ?? DEFAULT_POLICY_VISIBILITY.receipt_footer.estimate,
      bill: r["receipt_footer"]?.["bill"] ?? DEFAULT_POLICY_VISIBILITY.receipt_footer.bill,
    },
  };
}
