import { pathRules, type ReadOnlyClient } from "./http";

/**
 * Workforce API (shaped like Connecteam's public REST API, AU region).
 * Response types cover the documented fields this server reads.
 */

// #region workforce-allowlist
export const WORKFORCE_RULES = pathRules([
  ["list users", "/users/v1/users"],
  ["list jobs", "/jobs/v1/jobs"],
  ["list schedulers", "/scheduler/v1/schedulers"],
  ["list scheduler shifts", "/scheduler/v2/schedulers/{schedulerId}/shifts"],
  ["list time clocks", "/time-clock/v1/time-clocks"],
  ["list time activities", "/time-clock/v1/time-clocks/{timeClockId}/time-activities"],
  ["get pay rates", "/pay-rates/v1/pay-rates"],
]);
// #endregion workforce-allowlist

export interface CtCustomField {
  customFieldId: number;
  name: string;
  type: string;
  value: unknown;
}

export interface CtUser {
  userId: number;
  firstName: string;
  lastName: string;
  userType: "user" | "manager" | "owner";
  isArchived: boolean;
  phoneNumber?: string;
  email?: string;
  kioskCode?: string;
  customFields: CtCustomField[];
  createdAt?: number;
}

export interface CtJob {
  jobId: string;
  title: string;
  code: string;
  color: string;
  description?: string;
  isDeleted: boolean;
  parentId: string | null;
}

export interface CtScheduler {
  schedulerId: number;
  name: string;
  isArchived: boolean;
  timezone: string;
}

export interface CtShiftBreak {
  id: string;
  name: string;
  type: "paid" | "unpaid";
  startTime: number;
  /** Minutes. */
  duration: number;
}

export interface CtShift {
  id: string;
  title: string;
  color?: string;
  startTime: number;
  endTime: number;
  timezone: string;
  assignedUserIds: number[];
  jobId: string | null;
  isOpenShift: boolean;
  isPublished: boolean;
  breaks: CtShiftBreak[];
}

export interface CtTimeClock {
  id: number;
  name: string;
  isArchived: boolean;
}

export interface CtTimePoint {
  timestamp: number;
  timezone: string;
}

export interface CtActivityShift {
  id: string;
  start: CtTimePoint;
  end: CtTimePoint | null;
  jobId: string | null;
  schedulerShiftId: string | null;
  managerNote?: string;
  employeeNote?: string;
  isAutoClockOut?: boolean;
}

export interface CtManualBreak {
  id: string;
  start: CtTimePoint;
  end: CtTimePoint | null;
  manualBreakId: string;
}

export interface CtTimeActivitiesByUser {
  userId: number;
  shifts: CtActivityShift[];
  manualBreaks: CtManualBreak[];
  timeOffs: unknown[];
}

export interface CtResourceRate {
  resourceId: string;
  rate?: number;
  isUsingDefaultRate: boolean;
}

export interface CtPayRate {
  effectiveDate: string;
  rateType: "hourly" | "monthly" | "yearly";
  isDefaultRateEnabled: boolean;
  defaultRate?: number;
  isResourceRateEnabled: boolean;
  resourcesRates: CtResourceRate[];
}

export interface CtPayRateByUser {
  userId: number;
  payRate: CtPayRate;
}

interface Envelope<T> {
  requestId: string;
  data: T;
  paging?: { offset: number; total?: number | null };
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

export class WorkforceApi {
  constructor(private readonly client: ReadOnlyClient) {}

  private async paged<T>(path: string, key: string, query: Record<string, string | number | boolean>): Promise<T[]> {
    const out: T[] = [];
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await this.client.get<Envelope<Record<string, T[]>>>(path, { ...query, limit: PAGE_SIZE, offset });
      const items = res.data[key] ?? [];
      out.push(...items);
      if (items.length < PAGE_SIZE) break;
      offset = res.paging?.offset ?? offset + items.length;
    }
    return out;
  }

  listUsers(includeArchived = true): Promise<CtUser[]> {
    return this.paged<CtUser>("/users/v1/users", "users", { userStatus: includeArchived ? "all" : "active" });
  }

  listJobs(): Promise<CtJob[]> {
    return this.paged<CtJob>("/jobs/v1/jobs", "jobs", { includeDeleted: false });
  }

  async listSchedulers(): Promise<CtScheduler[]> {
    const res = await this.client.get<Envelope<{ schedulers: CtScheduler[] }>>("/scheduler/v1/schedulers");
    return res.data.schedulers;
  }

  listShifts(schedulerId: number, startTime: number, endTime: number): Promise<CtShift[]> {
    return this.paged<CtShift>(`/scheduler/v2/schedulers/${schedulerId}/shifts`, "shifts", { startTime, endTime });
  }

  async listTimeClocks(): Promise<CtTimeClock[]> {
    const res = await this.client.get<Envelope<{ timeClocks: CtTimeClock[] }>>("/time-clock/v1/time-clocks");
    return res.data.timeClocks;
  }

  async listTimeActivities(timeClockId: number, startDate: string, endDate: string): Promise<CtTimeActivitiesByUser[]> {
    const res = await this.client.get<Envelope<{ timeActivitiesByUsers: CtTimeActivitiesByUser[] }>>(
      `/time-clock/v1/time-clocks/${timeClockId}/time-activities`,
      { startDate, endDate },
    );
    return res.data.timeActivitiesByUsers;
  }

  getPayRates(startDate: string, endDate: string): Promise<CtPayRateByUser[]> {
    return this.paged<CtPayRateByUser>("/pay-rates/v1/pay-rates", "payRatesByUsers", { startDate, endDate });
  }
}
