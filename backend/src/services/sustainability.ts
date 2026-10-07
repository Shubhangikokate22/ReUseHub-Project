type Confidence = "HIGH" | "MEDIUM" | "LOW";

const CATEGORY_SCORE: Record<string, number> = {
  books: 74,
  electronics: 80,
  furniture: 78,
  clothing: 76,
  bags: 69,
  sports: 68,
  stationery: 62,
  "hostel-essentials": 70,
  other: 50,
};

export const ESTIMATE_LABEL = "Estimated avoided emissions";
export const ESTIMATE_METHODOLOGY =
  "Estimated net avoided emissions = reference lifecycle emissions × the configured displacement assumption − reuse-scenario emissions − transport emissions. Displacement defaults to 0.5 as an explicit assumption. No transport estimate is included without mode and distance data. Missing reference data is shown as unavailable. Figures are estimates, not measured savings or a full product LCA.";

export function getDisplacementFactor(): number {
  const configured = Number(process.env.SUSTAINABILITY_DISPLACEMENT_FACTOR ?? "0.5");
  return Number.isFinite(configured) && configured >= 0 && configured <= 1 ? configured : 0.5;
}

export function resolveEmissionFactor(categorySlug: string, title: string): { category: string; subcategory: string } | null {
  const text = title.toLowerCase();
  if (categorySlug === "books") return { category: categorySlug, subcategory: "paperback-book" };
  if (categorySlug === "electronics" && /\blaptop\b|\bnotebook computer\b/.test(text)) return { category: categorySlug, subcategory: "laptop" };
  if (categorySlug === "clothing") {
    if (/\b(t-?shirt|tee shirt)\b/.test(text)) return { category: categorySlug, subcategory: "cotton-t-shirt" };
    if (/\bjeans?\b/.test(text)) return { category: categorySlug, subcategory: "cotton-jeans" };
    if (/\b(sweatshirt|sweat shirt)\b/.test(text)) return { category: categorySlug, subcategory: "cotton-sweatshirt" };
    if (/\b(wool sweater|wool jumper)\b/.test(text)) return { category: categorySlug, subcategory: "wool-sweater" };
    if (/\bcoat\b/.test(text)) return { category: categorySlug, subcategory: "coat" };
    if (/\bcotton shirt\b/.test(text)) return { category: categorySlug, subcategory: "cotton-shirt" };
  }
  if (categorySlug === "bags" && /\b(backpack|rucksack)\b/.test(text)) return { category: categorySlug, subcategory: "backpack" };
  if (categorySlug === "furniture" && /\bchair\b/.test(text)) return { category: categorySlug, subcategory: "chair" };
  if (categorySlug === "stationery" && /\bcalculator\b/.test(text)) return { category: categorySlug, subcategory: "calculator" };
  return null;
}

function downgradeConfidence(confidence: Confidence): Confidence {
  if (confidence === "HIGH") return "MEDIUM";
  if (confidence === "MEDIUM") return "LOW";
  return "LOW";
}

export function calculateLifecycleImpact(input: {
  estimatedWeightKg: number | null;
  factorKgCO2e: number | null;
  factorConfidence: Confidence | null;
  displacementFactor?: number;
}) {
  const displacementFactor = input.displacementFactor ?? getDisplacementFactor();
  const factor = input.factorKgCO2e;
  const hasFactor = factor !== null && Number.isFinite(factor) && factor >= 0;
  const baselineEmissions = hasFactor ? round3(factor * displacementFactor) : null;
  const reuseScenarioEmissions = 0;
  const transportEmissions = 0;
  const netAvoidedCO2e = baselineEmissions === null
    ? null
    : round3(baselineEmissions - reuseScenarioEmissions - transportEmissions);
  const confidence = hasFactor && input.factorConfidence
    ? downgradeConfidence(input.factorConfidence)
    : "LOW";
  const assumptions = [
    `Displacement factor ${displacementFactor} is a configurable assumption, not measured displacement.`,
    "Reuse-scenario operational/refurbishment emissions are set to zero because no refurbishment data is collected.",
    "Transport emissions are set to zero because no route distance or mode is collected; zero means omitted, not measured zero.",
    "The reference lifecycle value describes a generic source product and does not prove that one reused item displaced a new purchase.",
  ].join(" ");
  return {
    estimatedWasteAvoidedKg: input.estimatedWeightKg && input.estimatedWeightKg > 0 ? round3(input.estimatedWeightKg) : null,
    referenceFactor: hasFactor ? factor : null,
    displacementFactor,
    baselineEmissions,
    reuseScenarioEmissions,
    transportEmissions,
    netAvoidedCO2e,
    confidenceLevel: confidence,
    assumptions,
  };
}

export function calculateItemSustainabilityScore(input: { categorySlug: string; condition: string; exchangeType: string }) {
  const base = CATEGORY_SCORE[input.categorySlug] ?? CATEGORY_SCORE.other;
  const conditionAdjustment = input.condition === "LIKE_NEW" ? 8 : input.condition === "GOOD" ? 4 : input.condition === "FAIR" ? -8 : 0;
  const transactionAdjustment = input.exchangeType === "DONATION" ? 8 : input.exchangeType === "EXCHANGE" ? 5 : 3;
  const score = Math.max(0, Math.min(100, base + conditionAdjustment + transactionAdjustment));
  return { score, label: score >= 80 ? "High reuse potential" : score >= 60 ? "Good reuse potential" : "Reuse potential varies", measured: false };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function summarizeCampusMetrics(metrics: Array<{
  itemId: string;
  eventType: string;
  estimatedWasteAvoidedKg: unknown;
  estimatedCo2eAvoidedKg: unknown;
}>) {
  const uniqueEvents = new Map<string, { waste: number; co2e: number }>();
  for (const metric of metrics) {
    const key = `${metric.itemId}:${metric.eventType}`;
    if (!uniqueEvents.has(key)) {
      uniqueEvents.set(key, {
        waste: metric.estimatedWasteAvoidedKg == null ? 0 : Number(metric.estimatedWasteAvoidedKg),
        co2e: metric.estimatedCo2eAvoidedKg == null ? 0 : Number(metric.estimatedCo2eAvoidedKg),
      });
    }
  }
  const totals = [...uniqueEvents.values()].reduce((sum, value) => ({ waste: sum.waste + value.waste, co2e: sum.co2e + value.co2e }), { waste: 0, co2e: 0 });
  return {
    estimatedWasteAvoidedKg: round3(totals.waste),
    estimatedCo2eAvoidedKg: round3(totals.co2e),
  };
}
