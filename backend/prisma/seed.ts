import "dotenv/config";
import { prisma } from "../src/database.ts";

const categories = [
  { name: "Books & Study", slug: "books" },
  { name: "Electronics", slug: "electronics" },
  { name: "Furniture", slug: "furniture" },
  { name: "Stationery", slug: "stationery" },
  { name: "Clothing", slug: "clothing" },
  { name: "Bags & Accessories", slug: "bags" },
  { name: "Sports", slug: "sports" },
  { name: "Hostel Essentials", slug: "hostel-essentials" },
  { name: "Lab & Academic", slug: "lab-academic" },
  { name: "Art & Craft", slug: "art-craft" },
  { name: "Games", slug: "games" },
  { name: "Others", slug: "other" },
];

const emissionFactors = [
  { category: "books", subcategory: "paperback-book", factorKgCO2e: 2.46, unit: "book", lifecycleBoundary: "Cradle-to-grave; reference paperback scenario", sourceName: "Wells et al., Carbon Footprint Assessment of a Paperback Book, Journal of Industrial Ecology", sourceUrl: "https://doi.org/10.1111/j.1530-9290.2011.00414.x", sourceYear: 2012, confidenceLevel: "HIGH" as const, notes: "One studied North American paperback scenario. Actual books vary by size, paper, printing, distribution, and end-of-life." },
  { category: "electronics", subcategory: "laptop", factorKgCO2e: 169, unit: "laptop", lifecycleBoundary: "Cradle-to-grave", sourceName: "ADEME Base Empreinte, Modélisation et évaluation ACV des produits de consommation et biens d’équipement", sourceUrl: "https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/ordinateurs_et_equuipements_pe_2.htm", sourceYear: 2018, confidenceLevel: "HIGH" as const, notes: "ADEME reference for a 2 kg laptop. Do not interpret as avoided emissions for every reuse." },
  { category: "clothing", subcategory: "cotton-t-shirt", factorKgCO2e: 7, unit: "item", lifecycleBoundary: "Cradle-to-grave", sourceName: "ADEME Base Empreinte, textiles and clothing LCA factors", sourceUrl: "https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm", sourceYear: 2018, confidenceLevel: "HIGH" as const, notes: "Cotton everyday T-shirt reference." },
  { category: "clothing", subcategory: "cotton-shirt", factorKgCO2e: 13, unit: "item", lifecycleBoundary: "Cradle-to-grave", sourceName: "ADEME Base Empreinte, textiles and clothing LCA factors", sourceUrl: "https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm", sourceYear: 2018, confidenceLevel: "HIGH" as const, notes: "Cotton shirt reference." },
  { category: "clothing", subcategory: "cotton-jeans", factorKgCO2e: 25, unit: "item", lifecycleBoundary: "Cradle-to-grave", sourceName: "ADEME Base Empreinte, textiles and clothing LCA factors", sourceUrl: "https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm", sourceYear: 2018, confidenceLevel: "HIGH" as const, notes: "Cotton jeans reference." },
  { category: "clothing", subcategory: "cotton-sweatshirt", factorKgCO2e: 31, unit: "item", lifecycleBoundary: "Cradle-to-grave", sourceName: "ADEME Base Empreinte, textiles and clothing LCA factors", sourceUrl: "https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm", sourceYear: 2018, confidenceLevel: "HIGH" as const, notes: "Cotton sweatshirt reference." },
  { category: "clothing", subcategory: "wool-sweater", factorKgCO2e: 56, unit: "item", lifecycleBoundary: "Cradle-to-grave", sourceName: "ADEME Base Empreinte, textiles and clothing LCA factors", sourceUrl: "https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm", sourceYear: 2018, confidenceLevel: "HIGH" as const, notes: "Wool sweater reference." },
  { category: "clothing", subcategory: "coat", factorKgCO2e: 89, unit: "item", lifecycleBoundary: "Cradle-to-grave", sourceName: "ADEME Base Empreinte, textiles and clothing LCA factors", sourceUrl: "https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm", sourceYear: 2018, confidenceLevel: "HIGH" as const, notes: "Average-composition coat reference; individual materials vary." },
  { category: "bags", subcategory: "backpack", factorKgCO2e: 17.5, unit: "item", lifecycleBoundary: "Illustrative product lifecycle estimate; exact boundary not independently audited", sourceName: "Arbor backpack carbon footprint estimate", sourceUrl: "https://www.arbor.eco/carbon-footprint/backpack", sourceYear: 2026, confidenceLevel: "MEDIUM" as const, notes: "Secondary illustrative estimate only; the publisher says this is not a formal product carbon footprint or LCA." },
  { category: "furniture", subcategory: "chair", factorKgCO2e: 30, unit: "item", lifecycleBoundary: "A1-C4 product lifecycle stages; product-specific chair", sourceName: "BCI Furniture, Quiet Timber Base Environmental Product Summary", sourceUrl: "https://bcifurniture.com/wp-content/uploads/Modus-Quiet-Product-Card.pdf", sourceYear: 2023, confidenceLevel: "MEDIUM" as const, notes: "Reference is for one specified chair product; not a universal chair factor." },
  { category: "stationery", subcategory: "calculator", factorKgCO2e: null, unit: "item", lifecycleBoundary: "Unavailable", sourceName: "ADEME Base Empreinte lookup; no verified calculator-specific factor", sourceUrl: "https://base-empreinte.ademe.fr/", sourceYear: 2026, confidenceLevel: "LOW" as const, notes: "No product-specific factor supplied; impact must display as unavailable." },
];

try {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
  }
  for (const factor of emissionFactors) {
    await prisma.emissionFactor.upsert({
      where: { category_subcategory: { category: factor.category, subcategory: factor.subcategory } },
      update: factor,
      create: factor,
    });
  }
  console.log(`Seeded ${categories.length} item categories.`);
} finally {
  await prisma.$disconnect();
}
