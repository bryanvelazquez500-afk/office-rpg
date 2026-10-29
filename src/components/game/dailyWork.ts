// Routine assignments that arrive every workday, so there's always real work to
// do: the day-to-day bookkeeping a staff accountant handles for Tidewater
// (sales, collections, vendor bills, accruals, deferrals, depreciation, payroll).
//
// Each day's work is generated from templates with fresh customers and amounts,
// seeded by the day number so the same day always produces the same work. The
// generated emails and tasks are added to EMAILS and TASKS, so the workstation
// treats them like any other assignment (highlight, post, calculator, sign off).

import { EMAILS, TASKS, type Email, type Task } from "./gaap";

/** A day never holds more than this many assignments, counting work carried over. */
export const DAILY_LIMIT = 5;
/** When routine work can land, in minutes after clock-in (lunch is 12:00–1:00). */
const ARRIVALS = [10, 90, 150, 270, 360]; // 9:10, 10:30, 11:30, 1:30, 3:00
const REWARD = 15;

const CUSTOMERS = [
  "Bayside Hardware",
  "Coastal Builders",
  "Harbor Marine Supply",
  "Pine Ridge Contractors",
  "Seaview Hotels",
  "Northgate Farms",
];
const PRODUCTS = ["packing tape", "pallet wrap", "safety gloves", "shop towels", "cable ties", "work boots"];
const VENDORS = ["Atlantic Paper Co.", "Keystone Office Supply", "Bluewater Packaging"];

/** Small seeded random generator (mulberry32), so a given day is always the same. */
function seeded(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** A whole number from lo to hi in steps of `step`. */
    int: (lo: number, hi: number, step = 1) => lo + step * Math.floor(next() * (Math.floor((hi - lo) / step) + 1)),
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)],
  };
}
type Rng = ReturnType<typeof seeded>;

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

interface Draft {
  from: string;
  subject: string;
  body: string[];
  title: string;
  steps: Task["steps"];
  evidence: string[];
  keyAmount: number;
  keyLabel: string;
  hints: string[];
}

const sign = (from: string) => `— ${from[0].toUpperCase()}${from.slice(1)}`;

const TEMPLATES: ((r: Rng) => Draft)[] = [
  (r): Draft => {
    const units = r.int(40, 160, 10);
    const price = r.int(25, 90);
    const cost = Math.round(price * 0.6);
    const customer = r.pick(CUSTOMERS);
    return {
      from: "marcus",
      subject: `Sale on account: ${customer}`,
      body: [
        `${customer} took delivery of ${units} cases of ${r.pick(PRODUCTS)} today at ${usd(price)} per case, on account (net 30).`,
        `Tidewater's cost is ${usd(cost)} per case. They use a perpetual inventory system, so please record the sale and the cost of goods sold.`,
        sign("marcus"),
      ],
      title: `Record the sale to ${customer}`,
      steps: [
        { label: "Record the sale", expected: { "Accounts Receivable": units * price, Revenue: -units * price } },
        { label: "Relieve inventory", expected: { "Cost of Goods Sold": units * cost, Inventory: -units * cost } },
      ],
      evidence: [String(units), usd(price), usd(cost)],
      keyAmount: units * price,
      keyLabel: "Sale total",
      hints: ["sales-cogs", "double-entry"],
    };
  },
  (r): Draft => {
    const amounts = [r.int(800, 9000, 10), r.int(800, 9000, 10), r.int(800, 9000, 10)];
    const total = amounts.reduce((a, b) => a + b, 0);
    const customer = r.pick(CUSTOMERS);
    return {
      from: "dana",
      subject: `Customer payment from ${customer}`,
      body: [
        `${customer} wired payment for three open invoices this morning: ${amounts.map(usd).join(", ")}.`,
        "Please apply the cash against their receivable.",
        sign("dana"),
      ],
      title: `Apply ${possessive(customer)} payment`,
      steps: [{ label: "Record the collection", expected: { Cash: total, "Accounts Receivable": -total } }],
      evidence: amounts.map(usd),
      keyAmount: total,
      keyLabel: "Total collected",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const qty = r.int(20, 80, 5);
    const each = r.int(12, 60);
    const vendor = r.pick(VENDORS);
    return {
      from: "gwen",
      subject: `Vendor invoice: ${vendor}`,
      body: [
        `We received an invoice from ${vendor} for ${qty} boxes of shipping supplies at ${usd(each)} a box, due in 30 days.`,
        "The supplies are in the stockroom. Please record the invoice.",
        sign("gwen"),
      ],
      title: `Record the ${vendor} invoice`,
      steps: [{ label: "Record the purchase", expected: { Supplies: qty * each, "Accounts Payable": -qty * each } }],
      evidence: [String(qty), usd(each)],
      keyAmount: qty * each,
      keyLabel: "Invoice total",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const start = r.int(2000, 6000, 50);
    const used = r.int(600, 1800, 25);
    return {
      from: "marcus",
      subject: "Supplies count",
      body: [
        `The Supplies account shows ${usd(start)}, but the stockroom count this morning came to ${usd(start - used)} on hand.`,
        "Please expense what was used so the account matches the count.",
        sign("marcus"),
      ],
      title: "Expense the supplies used",
      steps: [{ label: "Supplies used", expected: { "Supplies Expense": used, Supplies: -used } }],
      evidence: [usd(start), usd(start - used)],
      keyAmount: used,
      keyLabel: "Supplies used",
      hints: ["prepaid", "double-entry"],
    };
  },
  (r): Draft => {
    const kwh = r.int(3000, 9000, 250);
    const cents = r.pick([12, 14, 16]);
    const amount = (kwh * cents) / 100;
    return {
      from: "eleanor",
      subject: "Utilities accrual",
      body: [
        `The warehouse electric bill won't arrive until next month, but the meter shows ${kwh.toLocaleString("en-US")} kWh used at $0.${cents} per kWh.`,
        "Please accrue the estimated expense now so it lands in the right period.",
        sign("eleanor"),
      ],
      title: "Accrue the electric bill",
      steps: [
        { label: "Utilities accrual", expected: { "Utilities Expense": amount, "Accrued Liabilities": -amount } },
      ],
      evidence: [kwh.toLocaleString("en-US"), `$0.${cents}`],
      keyAmount: amount,
      keyLabel: "Accrued utilities",
      hints: ["accruals", "double-entry"],
    };
  },
  (r): Draft => {
    const premium = r.int(6000, 24000, 1200);
    return {
      from: "dana",
      subject: "Monthly insurance",
      body: [
        `Tidewater's new liability policy cost ${usd(premium)} for 12 months of coverage and was booked to Prepaid Insurance.`,
        "Please record one month of expense.",
        sign("dana"),
      ],
      title: "Expire one month of insurance",
      steps: [
        {
          label: "Insurance expense",
          expected: { "Insurance Expense": premium / 12, "Prepaid Insurance": -premium / 12 },
        },
      ],
      evidence: [usd(premium), "12"],
      keyAmount: premium / 12,
      keyLabel: "One month of coverage",
      hints: ["prepaid", "double-entry"],
    };
  },
  (r): Draft => {
    const monthly = r.int(100, 900, 10);
    const life = r.pick([3, 5]);
    const salvage = r.int(1000, 5000, 500);
    const cost = salvage + monthly * 12 * life;
    return {
      from: "marcus",
      subject: "Monthly depreciation: new forklift",
      body: [
        `The new forklift cost ${usd(cost)}, has a salvage value of ${usd(salvage)} and a useful life of ${life} years, straight-line.`,
        "Please book this month's depreciation.",
        sign("marcus"),
      ],
      title: "Depreciate the forklift for the month",
      steps: [
        {
          label: "Depreciation entry",
          expected: { "Depreciation Expense": monthly, "Accumulated Depreciation": -monthly },
        },
      ],
      evidence: [usd(cost), usd(salvage), String(life)],
      keyAmount: monthly,
      keyLabel: "Monthly depreciation",
      hints: ["straight-line", "double-entry"],
    };
  },
  (r): Draft => {
    const staff = r.int(3, 8);
    const rate = r.int(18, 32);
    const total = staff * 40 * rate;
    return {
      from: "sofia",
      subject: "Weekly wages",
      body: [
        `${staff} warehouse employees worked 40 hours each this week at ${usd(rate)} an hour. Payday is next Friday.`,
        "Please record the wages Tidewater owes for the week.",
        sign("sofia"),
      ],
      title: "Record the week's wages",
      steps: [{ label: "Wages owed", expected: { "Salaries Expense": total, "Salaries Payable": -total } }],
      evidence: [String(staff), "40", usd(rate)],
      keyAmount: total,
      keyLabel: "Wages owed",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const deliveries = r.pick([4, 6, 8]);
    const each = r.int(300, 1500, 50);
    const customer = r.pick(CUSTOMERS);
    return {
      from: "gwen",
      subject: `Prepaid deliveries: ${customer}`,
      body: [
        `${customer} prepaid ${usd(each * deliveries)} for ${deliveries} equal monthly deliveries, and it was booked to Unearned Revenue.`,
        "The first delivery went out today. Please recognize the revenue we've earned.",
        sign("gwen"),
      ],
      title: `Recognize ${possessive(customer)} first delivery`,
      steps: [{ label: "Revenue earned", expected: { "Unearned Revenue": each, Revenue: -each } }],
      evidence: [usd(each * deliveries), String(deliveries)],
      keyAmount: each,
      keyLabel: "Revenue earned",
      hints: ["deferred-revenue", "double-entry"],
    };
  },
  (r): Draft => {
    const sales = [r.int(400, 3000, 5), r.int(400, 3000, 5), r.int(400, 3000, 5)];
    const total = sales.reduce((a, b) => a + b, 0);
    return {
      from: "dana",
      subject: "Today's counter sales",
      body: [
        `The will-call counter rang up three cash sales today: ${sales.map(usd).join(", ")}.`,
        "Please record the sales. (Inventory for counter sales is relieved in the nightly batch.)",
        sign("dana"),
      ],
      title: "Record the counter sales",
      steps: [{ label: "Cash sales", expected: { Cash: total, Revenue: -total } }],
      evidence: sales.map(usd),
      keyAmount: total,
      keyLabel: "Total cash sales",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const a = r.int(600, 6000, 25);
    const b = r.int(600, 6000, 25);
    const vendor = r.pick(VENDORS);
    return {
      from: "dana",
      subject: `Check run: ${vendor}`,
      body: [
        `Two ${vendor} invoices are due this week: ${usd(a)} and ${usd(b)}. Both are already in Accounts Payable.`,
        "The checks went out today. Please record the payment.",
        sign("dana"),
      ],
      title: `Pay the ${vendor} invoices`,
      steps: [{ label: "Vendor payment", expected: { "Accounts Payable": a + b, Cash: -(a + b) } }],
      evidence: [usd(a), usd(b)],
      keyAmount: a + b,
      keyLabel: "Total paid",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const pay = [r.int(400, 1400, 5), r.int(400, 1400, 5), r.int(400, 1400, 5)];
    const total = pay.reduce((x, y) => x + y, 0);
    return {
      from: "sofia",
      subject: "Payday for the drivers",
      body: [
        `Direct deposits went out today to three delivery drivers for wages already accrued last week: ${pay.map(usd).join(", ")}.`,
        "Please record the payment against Salaries Payable.",
        sign("sofia"),
      ],
      title: "Record the drivers' payday",
      steps: [{ label: "Wages paid", expected: { "Salaries Payable": total, Cash: -total } }],
      evidence: pay.map(usd),
      keyAmount: total,
      keyLabel: "Total paid",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const units = r.int(100, 400, 20);
    const each = r.int(8, 40);
    const vendor = r.pick(VENDORS);
    const product = r.pick(PRODUCTS);
    return {
      from: "marcus",
      subject: `Inventory received: ${product}`,
      body: [
        `${units} cases of ${product} arrived from ${vendor} at ${usd(each)} a case, on account.`,
        "Receiving checked them in against the purchase order. Please record the purchase (perpetual system).",
        sign("marcus"),
      ],
      title: `Record the ${product} purchase`,
      steps: [
        { label: "Inventory purchase", expected: { Inventory: units * each, "Accounts Payable": -units * each } },
      ],
      evidence: [String(units), usd(each)],
      keyAmount: units * each,
      keyLabel: "Purchase total",
      hints: ["sales-cogs", "double-entry"],
    };
  },
  (r): Draft => {
    const check = r.int(500, 4000, 5);
    const fee = r.pick([20, 25, 30]);
    const customer = r.pick(CUSTOMERS);
    return {
      from: "gwen",
      subject: `Bounced check: ${customer}`,
      body: [
        `${possessive(customer)} ${usd(check)} check came back NSF (insufficient funds), and the bank charged a ${usd(fee)} fee.`,
        "We're billing the fee to the customer along with the check. Please reverse the deposit and put it all back on their receivable.",
        sign("gwen"),
      ],
      title: `Reinstate ${possessive(customer)} NSF check`,
      steps: [{ label: "NSF check", expected: { "Accounts Receivable": check + fee, Cash: -(check + fee) } }],
      evidence: [usd(check), usd(fee)],
      keyAmount: check + fee,
      keyLabel: "Back on the receivable",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const sqft = r.int(4000, 16000, 400);
    const rate = r.pick([1.25, 1.5, 1.75]);
    const rent = sqft * rate;
    return {
      from: "eleanor",
      subject: "Warehouse rent",
      body: [
        `This month's warehouse rent was paid today: ${sqft.toLocaleString("en-US")} square feet at ${usd(rate)} per square foot.`,
        "Please record it.",
        sign("eleanor"),
      ],
      title: "Record the warehouse rent",
      steps: [{ label: "Rent paid", expected: { "Rent Expense": rent, Cash: -rent } }],
      evidence: [sqft.toLocaleString("en-US"), usd(rate)],
      keyAmount: rent,
      keyLabel: "Rent for the month",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const price = r.int(1000, 9000, 50);
    const tax = (price * 6) / 100;
    return {
      from: "dana",
      subject: "Cash sale with sales tax",
      body: [
        `A walk-in contractor bought ${usd(price)} of goods for cash today, plus 6% state sales tax.`,
        "Remember the tax isn't our revenue: we collect it for the state. Please record the sale.",
        sign("dana"),
      ],
      title: "Record the cash sale with sales tax",
      steps: [{ label: "Sale with tax", expected: { Cash: price + tax, Revenue: -price, "Sales Tax Payable": -tax } }],
      evidence: [usd(price), "6%"],
      keyAmount: price + tax,
      keyLabel: "Cash collected",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const cost = r.int(8000, 30000, 500);
    const down = r.int(1000, 5000, 500);
    return {
      from: "marcus",
      subject: "New packing station",
      body: [
        `Tidewater bought a packing station for ${usd(cost)}. They paid ${usd(down)} down and signed a note payable for the rest.`,
        "Please record the purchase in one entry.",
        sign("marcus"),
      ],
      title: "Record the packing station purchase",
      steps: [
        { label: "Equipment purchase", expected: { Equipment: cost, Cash: -down, "Notes Payable": -(cost - down) } },
      ],
      evidence: [usd(cost), usd(down)],
      keyAmount: cost - down,
      keyLabel: "Note payable",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const spots = r.int(10, 40, 2);
    const each = r.int(40, 150, 5);
    return {
      from: "gwen",
      subject: "Radio ad invoice",
      body: [
        `The radio station billed us for ${spots} ad spots that ran this month at ${usd(each)} a spot, due in 30 days.`,
        "Please record the expense.",
        sign("gwen"),
      ],
      title: "Record the radio advertising",
      steps: [
        { label: "Advertising", expected: { "Advertising Expense": spots * each, "Accounts Payable": -spots * each } },
      ],
      evidence: [String(spots), usd(each)],
      keyAmount: spots * each,
      keyLabel: "Advertising total",
      hints: ["double-entry"],
    };
  },
  (r): Draft => {
    const balance = r.int(300, 3000, 10);
    const customer = r.pick(CUSTOMERS);
    return {
      from: "eleanor",
      subject: `Write-off: ${customer}`,
      body: [
        `${customer} closed its doors and the lawyers say there's nothing left to collect on its ${usd(balance)} balance.`,
        "We use the allowance method. Please write the account off.",
        sign("eleanor"),
      ],
      title: `Write off ${possessive(customer)} balance`,
      steps: [
        {
          label: "Write-off",
          expected: { "Allowance for Credit Losses": balance, "Accounts Receivable": -balance },
        },
      ],
      evidence: [usd(balance)],
      keyAmount: balance,
      keyLabel: "Amount written off",
      hints: ["cecl", "double-entry"],
    };
  },
  (r): Draft => {
    const deliveries = r.pick([3, 4, 6]);
    const each = r.int(400, 2000, 50);
    const customer = r.pick(CUSTOMERS);
    return {
      from: "gwen",
      subject: `Advance payment: ${customer}`,
      body: [
        `${customer} paid up front today for ${deliveries} deliveries at ${usd(each)} each. None have shipped yet.`,
        "Please record the cash we received.",
        sign("gwen"),
      ],
      title: `Record ${possessive(customer)} advance payment`,
      steps: [
        { label: "Customer advance", expected: { Cash: each * deliveries, "Unearned Revenue": -each * deliveries } },
      ],
      evidence: [String(deliveries), usd(each)],
      keyAmount: each * deliveries,
      keyLabel: "Cash received",
      hints: ["deferred-revenue", "double-entry"],
    };
  },
];

export interface DailyItem {
  taskId: string;
  title: string;
  arrivesAt: number; // office clock minute
}

const registered = new Map<number, DailyItem[]>();

/** Removes all generated work, so a new or reloaded game rebuilds it from day 1. */
export function resetDailyWork() {
  for (const items of registered.values())
    for (const { taskId } of items) {
      delete TASKS[taskId];
      const at = EMAILS.findIndex((e) => e.taskId === taskId);
      if (at >= 0) EMAILS.splice(at, 1);
    }
  registered.clear();
}

/**
 * Which template the n-th routine assignment of the game uses. Each run of
 * TEMPLATES.length assignments uses every template once, in a shuffled order,
 * so no kind of work repeats until all the others have come up.
 */
function templateFor(n: number) {
  const cycle = Math.floor(n / TEMPLATES.length);
  const r = seeded(cycle * 104_729 + 3);
  const order = TEMPLATES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[n % order.length];
}

/** Arrival times for `count` assignments, spread across the day and ending well before clock-out. */
function arrivalsFor(count: number, clockOut: number) {
  const times = ARRIVALS.filter((m) => 9 * 60 + m <= clockOut - 30);
  if (count >= times.length) return times;
  if (count <= 1) return times.slice(0, count);
  return Array.from({ length: count }, (_, i) => times[Math.round((i * (times.length - 1)) / (count - 1))]);
}

/**
 * Adds a workday's routine assignments to EMAILS and TASKS (once per day) and
 * returns them. `slots` is how many to add (the game fills each day up to
 * DAILY_LIMIT, counting carried-over work); `firstIndex` is how many routine
 * assignments earlier days added, which keeps the template rotation going.
 * `clockIn` is that day's 9:00 AM on the office clock and `clockOut` the
 * season's clock-out (minutes after midnight).
 */
export function registerDailyWork(
  day: number,
  clockIn: number,
  clockOut: number,
  slots: number,
  firstIndex: number,
): DailyItem[] {
  const existing = registered.get(day);
  if (existing) return existing;
  const r = seeded(day * 7919 + 17);
  const items = arrivalsFor(slots, clockOut).map((offset, k) => {
    const d = TEMPLATES[templateFor(firstIndex + k)](r);
    const taskId = `day${day + 1}-${k + 1}`;
    const task: Task = {
      id: taskId,
      tier: 1,
      title: d.title,
      book: "tidewater",
      steps: d.steps,
      evidence: d.evidence,
      keyAmount: d.keyAmount,
      keyLabel: d.keyLabel,
      hints: d.hints,
      reward: REWARD,
    };
    const email: Email = {
      id: `${taskId}-email`,
      from: d.from,
      subject: d.subject,
      arrivesAt: clockIn + offset,
      tier: 1,
      taskId,
      body: d.body,
    };
    TASKS[taskId] = task;
    EMAILS.push(email);
    return { taskId, title: d.title, arrivesAt: email.arrivesAt };
  });
  registered.set(day, items);
  return items;
}
