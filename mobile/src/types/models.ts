export type Category = { id: string; name: string; slug: string };

export type ItemImage = {
  id: string;
  url: string;
  storageSizeBytes: number | null;
  mimeType: string | null;
};

export type Item = {
  id: string;
  title: string;
  description: string;
  condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
  status: 'AVAILABLE' | 'REQUESTED' | 'EXCHANGED' | 'SOLD' | 'DONATED' | 'REMOVED';
  activeExchangeRequestId?: string | null;
  exchangeType: 'EXCHANGE' | 'DONATION' | 'SALE';
  exchangePreferredCategories?: string[] | null;
  estimatedWeightKg: string | number | null;
  price: string | number | null;
  priceNegotiable: boolean;
  createdAt: string;
  owner: { id: string; name: string };
  category: Category;
  images: ItemImage[];
  sustainabilityScore?: { score: number; label: string; measured: false };
};

export type CampusImpact = {
  label: string;
  estimatedWasteAvoidedKg: number;
  estimatedCo2eAvoidedKg: number;
  exchangesCompleted: number;
  itemsDonated: number;
  itemsSold?: number;
  itemsReused?: number;
  co2eCalculationsAvailable?: number;
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reusedItems: number;
  methodology: string;
};
