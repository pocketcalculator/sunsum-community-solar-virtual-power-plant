export interface DashboardLocation {
  readonly id: string;
  readonly address: string;
  readonly shortLabel: string;
  readonly locality: string;
  readonly propertyType: string;
  readonly areaSquareFeet: number | null;
  readonly individualReturnDollars: number | null;
  readonly communityReturnDollars: number | null;
  readonly selectedByDefault: boolean;
  readonly mapPosition:
    | {
        readonly xPercent: number;
        readonly yPercent: number;
      }
    | null;
  /*
   * Everything below describes a real submission and is therefore optional:
   * the illustrative locations in this file have no pipeline position, and a
   * required field would force them to invent one. `undefined` means "this is
   * a sample row"; `null` means "a real row that has not reached this stage".
   */
  readonly submissionStatus?: string | null;
  readonly projectStage?: string | null;
  readonly journeyStageId?: string | null;
  readonly nextAction?: string | null;
  readonly viabilityStatus?: string | null;
  readonly documentCount?: number;
  readonly outstandingCount?: number;
}

export interface ReturnPoint {
  readonly year: number;
  readonly individualDollars: number;
  readonly communityDollars: number;
}

export const MAX_SELECTED_LOCATIONS = 5;

export const DASHBOARD_LOCATIONS: readonly DashboardLocation[] = [
  {
    id: "oak-street",
    address: "123 Oak Street",
    shortLabel: "Oak St",
    locality: "Sweet Auburn",
    propertyType: "Single family",
    areaSquareFeet: 1800,
    individualReturnDollars: 20000,
    communityReturnDollars: 30000,
    selectedByDefault: true,
    mapPosition: { xPercent: 26, yPercent: 34 },
  },
  {
    id: "maple-avenue",
    address: "456 Maple Avenue",
    shortLabel: "Maple Ave",
    locality: "West End",
    propertyType: "Townhouse",
    areaSquareFeet: 1200,
    individualReturnDollars: 14000,
    communityReturnDollars: 22000,
    selectedByDefault: true,
    mapPosition: { xPercent: 69, yPercent: 49 },
  },
  {
    id: "pine-lane",
    address: "789 Pine Lane",
    shortLabel: "Pine Ln",
    locality: "Mechanicsville",
    propertyType: "Single family",
    areaSquareFeet: 2200,
    individualReturnDollars: 18000,
    communityReturnDollars: 28000,
    selectedByDefault: false,
    mapPosition: { xPercent: 46, yPercent: 72 },
  },
  {
    id: "cedar-drive",
    address: "321 Cedar Drive",
    shortLabel: "Cedar Dr",
    locality: "Grant Park",
    propertyType: "Multi-family",
    areaSquareFeet: 3500,
    individualReturnDollars: 36000,
    communityReturnDollars: 56000,
    selectedByDefault: true,
    mapPosition: { xPercent: 84, yPercent: 27 },
  },
  {
    id: "birch-court",
    address: "654 Birch Court",
    shortLabel: "Birch Ct",
    locality: "Grove Park",
    propertyType: "Single family",
    areaSquareFeet: 1600,
    individualReturnDollars: 16000,
    communityReturnDollars: 25000,
    selectedByDefault: false,
    mapPosition: { xPercent: 61, yPercent: 20 },
  },
  {
    id: "willow-boulevard",
    address: "901 Willow Boulevard",
    shortLabel: "Willow Blvd",
    locality: "East Point",
    propertyType: "Commercial",
    areaSquareFeet: 2800,
    individualReturnDollars: 25000,
    communityReturnDollars: 39000,
    selectedByDefault: false,
    mapPosition: { xPercent: 18, yPercent: 66 },
  },
  {
    id: "peachtree-road",
    address: "112 Peachtree Road",
    shortLabel: "Peachtree Rd",
    locality: "Midtown",
    propertyType: "Mixed use",
    areaSquareFeet: 4100,
    individualReturnDollars: 42000,
    communityReturnDollars: 64000,
    selectedByDefault: false,
    mapPosition: { xPercent: 37, yPercent: 18 },
  },
  {
    id: "magnolia-place",
    address: "73 Magnolia Place",
    shortLabel: "Magnolia Pl",
    locality: "Kirkwood",
    propertyType: "Townhouse",
    areaSquareFeet: 1500,
    individualReturnDollars: 15000,
    communityReturnDollars: 23000,
    selectedByDefault: false,
    mapPosition: { xPercent: 76, yPercent: 73 },
  },
  {
    id: "auburn-avenue",
    address: "808 Auburn Avenue",
    shortLabel: "Auburn Ave",
    locality: "Old Fourth Ward",
    propertyType: "Multi-family",
    areaSquareFeet: 3000,
    individualReturnDollars: 29000,
    communityReturnDollars: 45000,
    selectedByDefault: false,
    mapPosition: { xPercent: 52, yPercent: 42 },
  },
  {
    id: "decatur-street",
    address: "240 Decatur Street",
    shortLabel: "Decatur St",
    locality: "Downtown Atlanta",
    propertyType: "Commercial",
    areaSquareFeet: 5200,
    individualReturnDollars: 48000,
    communityReturnDollars: 74000,
    selectedByDefault: false,
    mapPosition: { xPercent: 90, yPercent: 58 },
  },
];

export const RETURN_POINTS: readonly ReturnPoint[] = [
  { year: 1, individualDollars: 2500, communityDollars: 3200 },
  { year: 2, individualDollars: 4600, communityDollars: 6200 },
  { year: 3, individualDollars: 7200, communityDollars: 9800 },
  { year: 4, individualDollars: 9800, communityDollars: 13600 },
  { year: 5, individualDollars: 12500, communityDollars: 18000 },
  { year: 7, individualDollars: 21000, communityDollars: 31000 },
  { year: 10, individualDollars: 31000, communityDollars: 49000 },
  { year: 15, individualDollars: 50000, communityDollars: 77000 },
  { year: 20, individualDollars: 70000, communityDollars: 108000 },
];
