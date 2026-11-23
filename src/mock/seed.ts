import { addDays, eachDate, weekdayIndex, zonedUnix } from "../core/dates";
import type { RlBooking, RlCustomerFlag, RlPayment, RlProduct, RlRevenueEntry } from "../upstream/booking";
import type {
  CtActivityShift,
  CtJob,
  CtManualBreak,
  CtPayRateByUser,
  CtScheduler,
  CtShift,
  CtTimeActivitiesByUser,
  CtTimeClock,
  CtUser,
} from "../upstream/workforce";

/**
 * Four weeks of deterministic, fictional data for one venue. Every value is
 * invented; contact-style values use reserved ranges (example.com addresses
 * and the fictitious 0491 570 xxx mobile range) so the redaction layer has
 * something realistic to remove.
 */

export const VENUE_NAME = "Lakeside Play Centre (fictional)";
export const VENUE_TIMEZONE = "Australia/Brisbane";
export const SEED_START = "2026-10-26";
export const SEED_END = "2026-11-22";

export interface Fixtures {
  jobs: CtJob[];
  users: CtUser[];
  schedulers: CtScheduler[];
  shifts: CtShift[];
  timeClocks: CtTimeClock[];
  timeActivities: CtTimeActivitiesByUser[];
  payRates: CtPayRateByUser[];
  products: RlProduct[];
  bookingsByDate: Map<string, RlBooking[]>;
  paymentsByDate: Map<string, RlPayment[]>;
  revenueByDate: Map<string, RlRevenueEntry[]>;
}

class Random {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  hex(length: number): string {
    let out = "";
    for (let i = 0; i < length; i += 1) out += Math.floor(this.next() * 16).toString(16);
    return out;
  }
}

type JobKey = "duty" | "desk" | "attr" | "party" | "cafe";

const JOBS: Record<JobKey, CtJob> = {
  duty: { jobId: "job-duty-manager", title: "Duty manager", code: "DM", color: "#4338ca", description: "Runs the floor, opens and closes", isDeleted: false, parentId: null },
  desk: { jobId: "job-front-desk", title: "Front desk", code: "FD", color: "#0e7490", description: "Admissions, waivers and bookings", isDeleted: false, parentId: null },
  attr: { jobId: "job-attractions", title: "Attractions", code: "AT", color: "#15803d", description: "Play frame, laser tag and mini golf", isDeleted: false, parentId: null },
  party: { jobId: "job-party-hosts", title: "Party hosts", code: "PH", color: "#be185d", description: "Party rooms and games", isDeleted: false, parentId: null },
  cafe: { jobId: "job-cafe", title: "Café", code: "CF", color: "#b45309", description: "Coffee, kids meals and snacks", isDeleted: false, parentId: null },
};

interface StaffSeed {
  first: string;
  last: string;
  job: JobKey;
  type: "Full-time" | "Part-time" | "Casual";
  rate: number;
  manager?: boolean;
  second?: { job: JobKey; rate?: number };
  archived?: boolean;
  junior?: boolean;
}

const STAFF: StaffSeed[] = [
  { first: "Priya", last: "Raman", job: "duty", type: "Full-time", rate: 38.9, manager: true },
  { first: "Tom", last: "Gallagher", job: "duty", type: "Part-time", rate: 37.4, manager: true },
  { first: "Mia", last: "Chen", job: "desk", type: "Casual", rate: 33.8, second: { job: "cafe" } },
  { first: "Lachlan", last: "Brooks", job: "desk", type: "Casual", rate: 33.1 },
  { first: "Ava", last: "Nguyen", job: "desk", type: "Part-time", rate: 29.8 },
  { first: "Zara", last: "Ahmed", job: "desk", type: "Casual", rate: 33.1, second: { job: "party", rate: 34.6 } },
  { first: "Ethan", last: "Kowalski", job: "attr", type: "Casual", rate: 32.4 },
  { first: "Ruby", last: "Thompson", job: "attr", type: "Casual", rate: 32.4 },
  { first: "Isla", last: "Martin", job: "attr", type: "Casual", rate: 28.4, junior: true },
  { first: "Noah", last: "Williams", job: "attr", type: "Casual", rate: 24.6, junior: true },
  { first: "Kai", last: "Tanaka", job: "attr", type: "Casual", rate: 20.9, junior: true },
  { first: "Chloe", last: "Evans", job: "party", type: "Casual", rate: 32.4 },
  { first: "Jack", last: "O'Connor", job: "party", type: "Casual", rate: 32.4 },
  { first: "Sienna", last: "Rossi", job: "party", type: "Casual", rate: 31.7 },
  { first: "Leo", last: "Fernandes", job: "party", type: "Casual", rate: 28.4, junior: true },
  { first: "Grace", last: "Kim", job: "cafe", type: "Part-time", rate: 30.6 },
  { first: "Oliver", last: "Hughes", job: "cafe", type: "Casual", rate: 33.1, second: { job: "desk" } },
  { first: "Matilda", last: "Scott", job: "cafe", type: "Casual", rate: 32.4 },
  { first: "Harvey", last: "Lim", job: "attr", type: "Casual", rate: 32.4, archived: true },
];

interface ProductSeed {
  id: string;
  name: string;
  type: string;
  subType?: string;
  category: string;
  price: number;
  cost?: number;
  status?: RlProduct["productStatus"];
}

const P = {
  child: { id: "410101", name: "Play pass, child (all day)", type: "pass", category: "Admissions", price: 26 },
  toddler: { id: "410102", name: "Play pass, toddler (under 3)", type: "pass", category: "Admissions", price: 15 },
  adult: { id: "410103", name: "Adult entry", type: "pass", category: "Admissions", price: 6 },
  group: { id: "410104", name: "School or kindy group pass", type: "pass", category: "Admissions", price: 18 },
  laser: { id: "410201", name: "Laser tag, one game", type: "sessionpass", category: "Attractions", price: 12 },
  golf: { id: "410202", name: "Mini golf, 18 holes", type: "sessionpass", category: "Attractions", price: 14 },
  partyClassic: { id: "410301", name: "Party package, Classic (10 children)", type: "partypackage", category: "Parties", price: 420 },
  partyLaser: { id: "410302", name: "Party package, Laser (10 children)", type: "partypackage", category: "Parties", price: 540 },
  partyGuest: { id: "410303", name: "Extra party guest", type: "addon", category: "Parties", price: 32 },
  flatWhite: { id: "410401", name: "Flat white", type: "addon", subType: "stock", category: "Café", price: 5.5, cost: 1.4 },
  babyccino: { id: "410402", name: "Babyccino", type: "addon", subType: "stock", category: "Café", price: 3, cost: 0.6 },
  lunchBox: { id: "410403", name: "Kids lunch box", type: "addon", subType: "stock", category: "Café", price: 12.5, cost: 4.2 },
  chips: { id: "410404", name: "Hot chips", type: "addon", subType: "stock", category: "Café", price: 7.5, cost: 1.9 },
  fruit: { id: "410405", name: "Fruit cup", type: "addon", subType: "stock", category: "Café", price: 5, cost: 1.6 },
  arcade20: { id: "410501", name: "Arcade card, $20", type: "cashlesscard", category: "Arcade", price: 20 },
  arcade50: { id: "410502", name: "Arcade card, $50", type: "cashlesscard", category: "Arcade", price: 50 },
  membership: { id: "410601", name: "Monthly play membership", type: "membership", category: "Memberships", price: 49, status: "Closed" },
  winterPass: { id: "410602", name: "Winter holiday pass", type: "pass", category: "Admissions", price: 22, status: "Archived" },
} satisfies Record<string, ProductSeed>;

const CAFE_ITEMS: ProductSeed[] = [P.flatWhite, P.babyccino, P.lunchBox, P.chips, P.fruit];

const SURNAMES = [
  "Hartley", "Patel", "Okafor", "Lindqvist", "Moreau", "Delaney", "Sato", "Brennan", "Castillo", "Fitzroy",
  "Nakamura", "Abernathy", "Kowal", "Haddad", "Whitlock", "Ferreira", "Galloway", "Iyer", "Marchetti", "Quinlan",
];

const POS_STAFF_IDS = ["3101", "3102", "3103", "3104"];

const round2 = (n: number) => Math.round(n * 100) / 100;
const gstOf = (gross: number) => round2(gross / 11);

function iso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");
}

function generate(): Fixtures {
  const rnd = new Random(20261123);
  const tz = VENUE_TIMEZONE;
  const midnight = new Map<string, number>();
  const at = (date: string, minutes: number, seconds = 0) => {
    let base = midnight.get(date);
    if (base === undefined) {
      base = zonedUnix(date, "00:00", tz);
      midnight.set(date, base);
    }
    return base + minutes * 60 + seconds;
  };
  const hm = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  // ---------------------------------------------------------------- workforce
  const users: CtUser[] = STAFF.map((s, i) => {
    const year = s.junior ? rnd.int(2008, 2010) : rnd.int(1984, 2004);
    const dob = `${year}-${String(rnd.int(1, 12)).padStart(2, "0")}-${String(rnd.int(1, 28)).padStart(2, "0")}`;
    return {
      userId: 1001 + i,
      firstName: s.first,
      lastName: s.last,
      userType: s.manager ? "manager" : "user",
      isArchived: Boolean(s.archived),
      phoneNumber: `+61491570${String(110 + i).padStart(3, "0")}`,
      email: `${s.first.toLowerCase()}.${s.last[0].toLowerCase()}@example.com`,
      kioskCode: String(4000 + ((i * 7919) % 6000)),
      createdAt: 1767225600 + i * 7 * 86400,
      customFields: [
        { customFieldId: 201, name: "Department", type: "str", value: JOBS[s.job].title },
        { customFieldId: 202, name: "Employment type", type: "str", value: s.type },
        { customFieldId: 203, name: "Date of birth", type: "birthday", value: dob },
        { customFieldId: 204, name: "Home address", type: "location", value: { address: `${10 + i} Example Street, Lakeside QLD 4000` } },
        { customFieldId: 205, name: "Bank account", type: "str", value: "BSB 000-000 Acc 00000000" },
        { customFieldId: 206, name: "Emergency contact", type: "phone", value: "+61491570150" },
        { customFieldId: 207, name: "Uniform size", type: "str", value: rnd.pick(["S", "M", "L"]) },
      ],
    };
  });

  const payRates: CtPayRateByUser[] = STAFF.map((s, i) => ({
    userId: 1001 + i,
    payRate: {
      effectiveDate: "2026-07-01",
      rateType: "hourly",
      isDefaultRateEnabled: true,
      defaultRate: s.rate,
      isResourceRateEnabled: Boolean(s.second),
      resourcesRates: [
        { resourceId: JOBS[s.job].jobId, isUsingDefaultRate: true },
        ...(s.second
          ? [
              s.second.rate
                ? { resourceId: JOBS[s.second.job].jobId, rate: s.second.rate, isUsingDefaultRate: false }
                : { resourceId: JOBS[s.second.job].jobId, isUsingDefaultRate: true },
            ]
          : []),
      ],
    },
  }));

  const userIdOf = (first: string) => 1001 + STAFF.findIndex((s) => s.first === first);
  const pools: Record<JobKey, number[]> = { duty: [], desk: [], attr: [], party: [], cafe: [] };
  STAFF.forEach((s, i) => {
    if (!s.archived && s.job !== "duty") pools[s.job].push(1001 + i);
  });
  const pointer: Record<JobKey, number> = { duty: 0, desk: 0, attr: 0, party: 0, cafe: 0 };
  const assign = (job: JobKey, used: Set<number>): number => {
    const pool = pools[job];
    for (let k = 0; k < pool.length; k += 1) {
      const id = pool[(pointer[job] + k) % pool.length];
      if (!used.has(id)) {
        pointer[job] = (pointer[job] + k + 1) % pool.length;
        return id;
      }
    }
    throw new Error(`No free staff for ${job}`);
  };

  const shifts: CtShift[] = [];
  const activities = new Map<number, { shifts: CtActivityShift[]; manualBreaks: CtManualBreak[] }>();
  const activityFor = (userId: number) => {
    let a = activities.get(userId);
    if (!a) {
      a = { shifts: [], manualBreaks: [] };
      activities.set(userId, a);
    }
    return a;
  };
  const partiesByDate = new Map<string, number>();

  for (const date of eachDate(SEED_START, SEED_END)) {
    const wd = weekdayIndex(date);
    const weekend = wd >= 5;
    const parties = weekend ? rnd.int(4, 6) : wd === 4 && rnd.chance(0.75) ? 1 : 0;
    partiesByDate.set(date, parties);

    const used = new Set<number>();
    const slots: Array<{ job: JobKey; start: string; end: string; userId: number }> = [];
    const add = (job: JobKey, start: string, end: string, userId?: number) => {
      const id = userId ?? assign(job, used);
      used.add(id);
      slots.push({ job, start, end, userId: id });
    };

    // Duty managers: Priya Mon, Tue, Thu, Fri; Tom Wed and weekends.
    add("duty", "08:30", weekend ? "18:30" : "17:30", userIdOf(wd === 2 || weekend ? "Tom" : "Priya"));
    if (weekend) {
      add("desk", "08:45", "14:45");
      add("desk", "12:30", "18:15");
      add("attr", "08:45", "16:45");
      add("attr", "10:00", "18:15");
      add("attr", "11:00", "16:00");
      add("cafe", "08:30", "15:30");
      add("cafe", "10:30", "15:00");
      const hosts = Math.ceil(parties / 2);
      for (let h = 0; h < hosts; h += 1) add("party", h % 2 === 0 ? "09:30" : "12:00", h % 2 === 0 ? "15:00" : "17:30");
    } else {
      add("desk", "09:15", "17:15");
      add("attr", "09:15", "17:45");
      // Wednesdays the café is covered by a front-desk casual (paid at their café rate).
      if (wd === 2) add("cafe", "09:30", "14:30", userIdOf("Mia"));
      else add("cafe", "09:30", "14:30");
      // Friday party covered by a front-desk casual at her party-host rate.
      if (parties > 0) add("party", "15:30", "18:30", userIdOf("Zara"));
    }

    slots.forEach((slot, n) => {
      const startMin = hm(slot.start);
      const endMin = hm(slot.end);
      const long = endMin - startMin > 300;
      const breakStart = startMin + Math.round((endMin - startMin) / 2 / 15) * 15;
      const shift: CtShift = {
        id: `shf-${date.replace(/-/g, "")}-${String(n + 1).padStart(2, "0")}`,
        title: JOBS[slot.job].title,
        color: JOBS[slot.job].color,
        startTime: at(date, startMin),
        endTime: at(date, endMin),
        timezone: tz,
        assignedUserIds: [slot.userId],
        jobId: JOBS[slot.job].jobId,
        isOpenShift: false,
        isPublished: true,
        breaks: long ? [{ id: `${date}-${n}-meal`, name: "Meal break", type: "unpaid", startTime: at(date, breakStart), duration: 30 }] : [],
      };
      shifts.push(shift);

      // One no-show so schedules and timesheets disagree somewhere.
      if (date === "2026-11-10" && slot.job === "cafe") return;

      const inMin = startMin + rnd.int(-7, 4);
      const outMin = endMin + rnd.int(-3, 12);
      const activity: CtActivityShift = {
        id: `ta-${date.replace(/-/g, "")}-${String(n + 1).padStart(2, "0")}`,
        start: { timestamp: at(date, inMin, rnd.int(0, 59)), timezone: tz },
        end: { timestamp: at(date, outMin, rnd.int(0, 59)), timezone: tz },
        jobId: shift.jobId,
        schedulerShiftId: shift.id,
        managerNote: "",
        employeeNote: date === "2026-11-05" && slot.job === "desk" ? "Swapped with Lachlan, confirmed by email to rosters@example.com" : "",
        isAutoClockOut: false,
      };
      const record = activityFor(slot.userId);
      record.shifts.push(activity);
      if (long) {
        const bStart = breakStart + rnd.int(-10, 10);
        record.manualBreaks.push({
          id: `mb-${date.replace(/-/g, "")}-${String(n + 1).padStart(2, "0")}`,
          start: { timestamp: at(date, bStart), timezone: tz },
          end: { timestamp: at(date, bStart + 30 + rnd.int(-2, 4)), timezone: tz },
          manualBreakId: "meal-break",
        });
      }
    });

    // One unscheduled call-in, clocked without a rostered shift.
    if (date === "2026-11-14") {
      const extra = assign("attr", used);
      activityFor(extra).shifts.push({
        id: "ta-20261114-extra",
        start: { timestamp: at(date, hm("11:02"), 14), timezone: tz },
        end: { timestamp: at(date, hm("15:06"), 40), timezone: tz },
        jobId: JOBS.attr.jobId,
        schedulerShiftId: null,
        managerNote: "Called in for a school group. Text me on 0491 570 156 if this needs approving.",
        employeeNote: "",
        isAutoClockOut: false,
      });
    }
  }

  const timeActivities: CtTimeActivitiesByUser[] = [...activities.entries()]
    .sort(([a], [b]) => a - b)
    .map(([userId, a]) => ({ userId, shifts: a.shifts, manualBreaks: a.manualBreaks, timeOffs: [] }));

  // ----------------------------------------------------------------- bookings
  const allProducts: ProductSeed[] = Object.values(P);
  const products: RlProduct[] = allProducts.map((p) => ({
    productId: p.id,
    parentProductId: p.id,
    name: p.name,
    price: p.price,
    costOfGoods: p.cost ?? null,
    productType: p.type,
    productSubType: p.subType,
    reportingCategoryName: p.category,
    productStatus: p.status ?? "Published",
  }));

  const bookingsByDate = new Map<string, RlBooking[]>();
  const paymentsByDate = new Map<string, RlPayment[]>();
  const revenueByDate = new Map<string, RlRevenueEntry[]>();
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  let bookingRef = 5_020_001;
  let customerId = 7_700_101;
  let itemId = 91_000_001;
  let paymentId = 66_000_001;
  let receipt = 240_001;

  interface Line {
    product: ProductSeed;
    qty: number;
    startTime?: string;
    itemId: string;
  }
  interface Payment {
    date: string;
    minutes: number;
    amount: number;
    method: "EFTPOS" | "Cash" | "Credit card";
    online: boolean;
    tip?: number;
  }

  const uuid = () => `${rnd.hex(8)}-${rnd.hex(4)}-4${rnd.hex(3)}-${rnd.pick(["8", "9", "a", "b"])}${rnd.hex(3)}-${rnd.hex(12)}`;

  const record = (opts: {
    visitDate: string;
    visitMinutes: number;
    created: { date: string; minutes: number };
    name: string;
    location: string;
    lines: Line[];
    payments: Payment[];
    flags?: RlCustomerFlag[];
  }) => {
    const ref = String(bookingRef++);
    const cust = customerId++;
    const total = round2(opts.lines.reduce((sum, l) => sum + l.product.price * l.qty, 0));
    const firstPayUnix = at(opts.payments[0].date, opts.payments[0].minutes);
    push(bookingsByDate, opts.visitDate, {
      bookingReference: ref,
      uniqueId: uuid(),
      createdDate: iso(at(opts.created.date, opts.created.minutes, rnd.int(0, 59))),
      status: "PaidFull",
      name: opts.name,
      customerId: cust,
      total,
      items: opts.lines.map((l) => ({
        productId: Number(l.product.id),
        quantity: l.qty,
        bookingDate: opts.visitDate,
        ...(l.startTime ? { startTime: l.startTime } : {}),
      })),
      customerFlags: opts.flags ?? [],
    });

    // Allocate each payment across lines in order (a deposit lands on the first line).
    const remaining = opts.lines.map((l) => round2(l.product.price * l.qty));
    for (const pay of opts.payments) {
      const unix = at(pay.date, pay.minutes, rnd.int(0, 59));
      const id = String(paymentId++);
      const gatewayRef = pay.method === "Cash" ? "" : `pi_${rnd.hex(18)}`;
      push(paymentsByDate, pay.date, {
        bookingPaymentId: id,
        bookingReference: ref,
        receiptNumber: String(receipt++),
        staffId: pay.online ? "" : rnd.pick(POS_STAFF_IDS),
        total: pay.amount,
        tip: pay.tip ?? 0,
        transactionFeeAmount: 0,
        transactionId: gatewayRef,
        ...(pay.method === "Cash" ? {} : { creditCardLast4Digits: String(rnd.int(1000, 9999)) }),
        createdDate: iso(unix),
        deviceId: pay.online ? "" : rnd.pick(["POS-1", "POS-2"]),
        paymentMethod: pay.method,
      });
      let left = pay.amount;
      opts.lines.forEach((line, i) => {
        if (left <= 0 || remaining[i] <= 0) return;
        const amount = round2(Math.min(left, remaining[i]));
        remaining[i] = round2(remaining[i] - amount);
        left = round2(left - amount);
        push(revenueByDate, pay.date, {
          recordDate: iso(unix),
          entryType: "Transaction",
          bookingReference: ref,
          bookingLocation: opts.location,
          productId: line.product.id,
          productType: line.product.type,
          unitCost: line.product.price,
          discount: 0,
          ticketQuantity: line.qty,
          bookingItemId: line.itemId,
          transactionDate: iso(firstPayUnix),
          transactionLocation: pay.online ? "Online Checkout" : "POS",
          transactionValue: amount,
          fundsReceived: amount,
          taxPercent: 10,
          taxOnFundsReceived: gstOf(amount),
          feeRevenue: 0,
          taxPayable: 0,
          netRevenue: 0,
          deferredRevenue: round2(amount - gstOf(amount)),
          paymentType: pay.method,
          bookingPaymentId: id,
          customerId: String(cust),
          ...(gatewayRef ? { externalPaymentReference: gatewayRef } : {}),
        });
      });
    }

    // Revenue is recognised on the visit.
    const visitUnix = at(opts.visitDate, opts.visitMinutes, rnd.int(0, 59));
    for (const line of opts.lines) {
      const gross = round2(line.product.price * line.qty);
      const net = round2(gross - gstOf(gross));
      push(revenueByDate, opts.visitDate, {
        recordDate: iso(visitUnix),
        entryType: "Recognition",
        bookingReference: ref,
        bookingLocation: opts.location,
        productId: line.product.id,
        productType: line.product.type,
        unitCost: line.product.price,
        discount: 0,
        ticketQuantity: 0,
        bookingItemId: line.itemId,
        transactionDate: iso(firstPayUnix),
        transactionLocation: opts.payments[0].online ? "Online Checkout" : "POS",
        transactionValue: 0,
        fundsReceived: 0,
        taxPercent: 10,
        taxOnFundsReceived: 0,
        feeRevenue: 0,
        taxPayable: gstOf(gross),
        netRevenue: net,
        deferredRevenue: -net,
        paymentType: "",
        bookingPaymentId: "",
        customerId: String(cust),
      });
    }
  };

  const line = (product: ProductSeed, qty: number, startTime?: string): Line => ({
    product,
    qty,
    startTime,
    itemId: String(itemId++),
  });
  const lineTotal = (lines: Line[]) => round2(lines.reduce((sum, l) => sum + l.product.price * l.qty, 0));
  const cafeLines = (count: number) => {
    const lines: Line[] = [];
    for (let i = 0; i < count; i += 1) lines.push(line(rnd.pick(CAFE_ITEMS), rnd.int(1, 2)));
    return lines;
  };

  const WEEKDAY_ADMISSIONS = [28, 26, 31, 27, 35];

  for (const date of eachDate(SEED_START, SEED_END)) {
    const wd = weekdayIndex(date);
    const weekend = wd >= 5;
    const open = weekend ? hm("09:00") : hm("09:30");
    const lastEntry = weekend ? hm("16:30") : hm("15:30");

    // Family admissions, walk-in or booked online.
    const admissions = weekend ? rnd.int(52, 60) : WEEKDAY_ADMISSIONS[wd] + rnd.int(-3, 3);
    for (let b = 0; b < admissions; b += 1) {
      const arrive = rnd.int(open, lastEntry);
      const kids = rnd.pick([1, 1, 1, 2, 2, 2, 2, 3, 3]);
      const lines: Line[] = [line(P.child, kids)];
      if (rnd.chance(0.3)) lines.push(line(P.toddler, 1));
      lines.push(line(P.adult, rnd.chance(0.55) ? 1 : 2));
      const slot = clock(Math.ceil((arrive + 20) / 30) * 30);
      if (rnd.chance(0.35)) lines.push(line(P.laser, kids, slot));
      if (rnd.chance(0.15)) lines.push(line(P.golf, kids + 1, slot));
      if (rnd.chance(0.45)) lines.push(...cafeLines(rnd.int(1, 3)));
      if (rnd.chance(0.25)) lines.push(line(rnd.chance(0.9) ? P.arcade20 : P.arcade50, 1));
      const online = rnd.chance(0.3);
      const total = lineTotal(lines);
      if (online) {
        const daysBefore = rnd.int(0, 6);
        const createdDate = addDays(date, -daysBefore);
        const createdMin = daysBefore === 0 ? rnd.int(hm("07:00"), Math.max(hm("07:01"), arrive - 30)) : rnd.int(hm("07:00"), hm("21:30"));
        record({
          visitDate: date,
          visitMinutes: arrive,
          created: { date: createdDate, minutes: createdMin },
          name: `${rnd.pick(SURNAMES)} family`,
          location: "Online Checkout",
          lines,
          payments: [{ date: createdDate, minutes: createdMin, amount: total, method: "Credit card", online: true }],
        });
      } else {
        record({
          visitDate: date,
          visitMinutes: arrive,
          created: { date, minutes: arrive },
          name: "Walk-in",
          location: "POS",
          lines,
          payments: [{ date, minutes: arrive, amount: total, method: rnd.chance(0.82) ? "EFTPOS" : "Cash", online: false }],
        });
      }
    }

    // Café sales at the counter.
    const cafeSales = weekend ? rnd.int(18, 25) : rnd.int(8, 13);
    for (let c = 0; c < cafeSales; c += 1) {
      const minutes = rnd.int(open, hm("15:00"));
      const lines = cafeLines(rnd.int(1, 3));
      record({
        visitDate: date,
        visitMinutes: minutes,
        created: { date, minutes },
        name: "Café sale",
        location: "POS",
        lines,
        payments: [
          {
            date,
            minutes,
            amount: lineTotal(lines),
            method: rnd.chance(0.85) ? "EFTPOS" : "Cash",
            online: false,
            tip: rnd.chance(0.12) ? rnd.pick([1, 2, 2.5]) : 0,
          },
        ],
      });
    }

    // Birthday parties: deposit online weeks ahead, balance on the day.
    const parties = partiesByDate.get(date) ?? 0;
    const partySlots = weekend ? ["10:00", "12:30", "10:00", "15:00", "12:30", "15:00"] : ["16:00"];
    for (let p = 0; p < parties; p += 1) {
      const start = partySlots[p % partySlots.length];
      const pkg = rnd.chance(0.6) ? P.partyClassic : P.partyLaser;
      const lines: Line[] = [line(pkg, 1, start)];
      const extras = rnd.int(0, 6);
      if (extras > 0) lines.push(line(P.partyGuest, extras, start));
      const daysBefore = rnd.int(7, 30);
      const createdDate = addDays(date, -daysBefore);
      const createdMin = rnd.int(hm("08:00"), hm("20:30"));
      const flags: RlCustomerFlag[] = rnd.chance(0.25)
        ? [{ type: "Medical", comment: "Nut allergy. Parent contact 0491 570 156.", expiryDate: null }]
        : rnd.chance(0.1)
          ? [{ type: "VIP", comment: "Returning family, third party this year", expiryDate: null }]
          : [];
      const total = lineTotal(lines);
      record({
        visitDate: date,
        visitMinutes: hm(start),
        created: { date: createdDate, minutes: createdMin },
        name: `${rnd.pick(SURNAMES)} birthday party`,
        location: "Venue manager",
        lines,
        flags,
        payments: [
          { date: createdDate, minutes: createdMin, amount: 100, method: "Credit card", online: true },
          { date, minutes: hm(start) + 120, amount: round2(total - 100), method: "EFTPOS", online: false },
        ],
      });
    }

    // Occasional school or kindy group on Tuesdays and Thursdays.
    if ((wd === 1 || wd === 3) && rnd.chance(0.5)) {
      const lines = [line(P.group, rnd.int(15, 25), "10:00")];
      const createdDate = addDays(date, -rnd.int(10, 20));
      const createdMin = rnd.int(hm("09:00"), hm("16:00"));
      record({
        visitDate: date,
        visitMinutes: hm("10:00"),
        created: { date: createdDate, minutes: createdMin },
        name: "Kindy group excursion",
        location: "Venue manager",
        lines,
        payments: [{ date: createdDate, minutes: createdMin, amount: lineTotal(lines), method: "Credit card", online: true }],
      });
    }
  }

  return {
    jobs: Object.values(JOBS),
    users,
    schedulers: [{ schedulerId: 7001, name: "Lakeside roster", isArchived: false, timezone: tz }],
    shifts,
    timeClocks: [{ id: 9001, name: "Lakeside time clock", isArchived: false }],
    timeActivities,
    payRates,
    products,
    bookingsByDate,
    paymentsByDate,
    revenueByDate,
  };
}

let cached: Fixtures | undefined;

/** Fixtures are generated once per process and never mutated. */
export function getFixtures(): Fixtures {
  cached ??= generate();
  return cached;
}
