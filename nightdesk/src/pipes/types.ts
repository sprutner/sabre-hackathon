// One interface, two pipes (SABRE_PIPE=mcp|rest). Tomorrow's repo keeps the contract, not the code.

export interface FlightSegment {
  marketingAirlineCode: string;
  marketingFlightNumber: number;
  departureAirportCode: string;
  arrivalAirportCode: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  bookingClassCode?: string;
}

export interface SpeakableOffer {
  offerId: string;
  price: string;
  currency: string;
  speakable: string; // one-liner Avi can read aloud
  segments: FlightSegment[];
  validUntil?: string;
}

export interface SearchResult {
  offers: SpeakableOffer[];
  totalOffers: number;
  ms: number;
  live: boolean;
  raw?: unknown;
}

export interface BookResult {
  confirmationId?: string;
  status: string;
  ms: number;
  live: boolean;
  raw?: unknown;
}

export interface SabrePipe {
  name: "mcp" | "rest";
  searchFlights(origin: string, dest: string, date: string, pax: number): Promise<SearchResult>;
  bookOrExchange(offer: SpeakableOffer, traveler: { firstName: string; lastName: string; phone: string }): Promise<BookResult>;
}
