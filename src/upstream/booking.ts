import { addDays } from "../core/dates";
import { pathRules, type ReadOnlyClient } from "./http";

/**
 * Booking and ticketing API (shaped like ROLLER's public REST and Reporting
 * APIs). Date-filtered reporting endpoints accept at most one day per call,
 * so range queries are made one day at a time.
 */

// #region booking-allowlist
export const BOOKING_RULES = pathRules([
  ["search bookings", "/bookings"],
  ["list products", "/data/products"],
  ["list booking payments", "/data/bookingpayments"],
  ["list revenue entries", "/reporting/revenue-entries"],
]);
// #endregion booking-allowlist

export type RlBookingStatus = "PendingPayment" | "NoPaymentRequired" | "PaidPart" | "PaidFull";

export interface RlBookingItem {
  productId: number;
  quantity: number;
  bookingDate: string;
  startTime?: string;
}

export interface RlCustomerFlag {
  type: "Ban" | "VIP" | "Medical" | "Alert" | "Competency";
  comment?: string;
  expiryDate?: string | null;
}

export interface RlBooking {
  bookingReference: string;
  uniqueId: string;
  createdDate: string;
  status: RlBookingStatus;
  name: string;
  customerId: number;
  total: number;
  items: RlBookingItem[];
  customerFlags: RlCustomerFlag[];
}

export interface RlProduct {
  productId: string;
  parentProductId: string;
  name: string;
  price: number | null;
  costOfGoods: number | null;
  productType: string;
  productSubType?: string;
  reportingCategoryName: string;
  productStatus: "Draft" | "Published" | "Closed" | "Archived";
}

export interface RlPayment {
  bookingPaymentId: string;
  bookingReference: string;
  receiptNumber: string;
  staffId: string;
  total: number;
  tip: number;
  transactionFeeAmount: number;
  transactionId: string;
  creditCardLast4Digits?: string;
  createdDate: string;
  deviceId: string;
  paymentMethod: string;
}

export interface RlRevenueEntry {
  recordDate: string;
  entryType: "Transaction" | "Recognition" | "Adjustment";
  bookingReference: string;
  bookingLocation: string;
  productId: string;
  productType: string;
  unitCost: number;
  discount: number;
  ticketQuantity: number;
  bookingItemId: string;
  transactionDate: string;
  transactionLocation: string;
  transactionValue: number;
  fundsReceived: number;
  taxPercent: number;
  taxOnFundsReceived: number;
  feeRevenue: number;
  taxPayable: number;
  netRevenue: number;
  deferredRevenue: number;
  paymentType: string;
  bookingPaymentId: string;
  customerId: string;
  externalPaymentReference?: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export class BookingApi {
  constructor(private readonly client: ReadOnlyClient) {}

  /** REST search: returns up to 100 bookings with items on the given date. */
  async searchBookings(date: string): Promise<RlBooking[]> {
    const res = await this.client.get<{ bookings: RlBooking[] }>("/bookings", { date });
    return res.bookings;
  }

  private async pagedArray<T>(path: string, query: Record<string, string>, sendPageSize: boolean): Promise<T[]> {
    const out: T[] = [];
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
      const page = await this.client.get<T[]>(path, {
        ...query,
        pageNumber,
        ...(sendPageSize ? { pageSize: PAGE_SIZE } : {}),
      });
      out.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return out;
  }

  listProducts(): Promise<RlProduct[]> {
    return this.pagedArray<RlProduct>("/data/products", {}, true);
  }

  /** Payments taken on one venue-local date. */
  listPayments(date: string): Promise<RlPayment[]> {
    return this.pagedArray<RlPayment>("/data/bookingpayments", { startDate: date, endDate: addDays(date, 1) }, true);
  }

  /** Revenue entries recorded on one venue-local date. */
  listRevenueEntries(date: string): Promise<RlRevenueEntry[]> {
    return this.pagedArray<RlRevenueEntry>(
      "/reporting/revenue-entries",
      { startDate: date, endDate: addDays(date, 1) },
      false,
    );
  }
}
