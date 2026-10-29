// Accounting content for the workstation: chart of accounts, opening trial
// balances per ledger book, tiered email assignments (with the entries each
// one expects) and the GAAP hint library those assignments point to.

export type AccountType =
  "asset" | "contra-asset" | "liability" | "contra-liability" | "equity" | "revenue" | "expense";

export interface Account {
  name: string;
  type: AccountType;
}

export const ACCOUNTS: Account[] = [
  { name: "Cash", type: "asset" },
  { name: "Accounts Receivable", type: "asset" },
  { name: "Allowance for Credit Losses", type: "contra-asset" },
  { name: "Inventory", type: "asset" },
  { name: "Supplies", type: "asset" },
  { name: "Prepaid Insurance", type: "asset" },
  { name: "Investment in Harbor Logistics", type: "asset" },
  { name: "Vehicles", type: "asset" },
  { name: "Equipment", type: "asset" },
  { name: "Accumulated Depreciation", type: "contra-asset" },
  { name: "Goodwill", type: "asset" },
  { name: "Accounts Payable", type: "liability" },
  { name: "Accrued Liabilities", type: "liability" },
  { name: "Sales Tax Payable", type: "liability" },
  { name: "Unearned Revenue", type: "liability" },
  { name: "Interest Payable", type: "liability" },
  { name: "Salaries Payable", type: "liability" },
  { name: "Federal Income Tax Payable", type: "liability" },
  { name: "FICA Taxes Payable", type: "liability" },
  { name: "Notes Payable", type: "liability" },
  { name: "Bonds Payable", type: "liability" },
  { name: "Discount on Bonds Payable", type: "contra-liability" },
  { name: "Common Stock", type: "equity" },
  { name: "Retained Earnings", type: "equity" },
  { name: "Common Stock — Harbor", type: "equity" },
  { name: "Retained Earnings — Harbor", type: "equity" },
  { name: "Revenue", type: "revenue" },
  { name: "Cost of Goods Sold", type: "expense" },
  { name: "Salaries Expense", type: "expense" },
  { name: "Depreciation Expense", type: "expense" },
  { name: "Interest Expense", type: "expense" },
  { name: "Insurance Expense", type: "expense" },
  { name: "Supplies Expense", type: "expense" },
  { name: "Utilities Expense", type: "expense" },
  { name: "Rent Expense", type: "expense" },
  { name: "Advertising Expense", type: "expense" },
  { name: "Credit Loss Expense", type: "expense" },
];

export const NORMAL_DEBIT = new Set<AccountType>(["asset", "expense", "contra-liability"]);

// ---------------------------------------------------------------------------
// Ledger books
// ---------------------------------------------------------------------------
export type BookId = "tidewater" | "consolidation";

export const BOOKS: Record<BookId, { name: string; tier: number }> = {
  tidewater: { name: "Tidewater Supply Co.", tier: 1 },
  consolidation: { name: "Consolidation worksheet: Tidewater + Harbor Logistics", tier: 4 },
};

/** Unadjusted balances at Dec 31 (positive = debit, negative = credit). Each book balances. */
export const OPENING_BALANCES: Record<BookId, Record<string, number>> = {
  tidewater: {
    Cash: 319_029,
    "Accounts Receivable": 128_000,
    "Allowance for Credit Losses": -2_000,
    Inventory: 52_000,
    "Prepaid Insurance": 18_000,
    Vehicles: 48_000,
    "Accounts Payable": -41_000,
    "Notes Payable": -120_000,
    "Bonds Payable": -200_000,
    "Discount on Bonds Payable": 15_971,
    "Common Stock": -50_000,
    Revenue: -410_000,
    "Cost of Goods Sold": 190_000,
    "Salaries Expense": 52_000,
  },
  // Combined parent + subsidiary trial balances, before eliminations.
  consolidation: {
    Cash: 195_000,
    "Accounts Receivable": 168_000,
    Inventory: 82_000,
    "Investment in Harbor Logistics": 200_000,
    Vehicles: 143_000,
    "Accounts Payable": -66_000,
    "Notes Payable": -120_000,
    "Common Stock": -50_000,
    "Retained Earnings": -184_000,
    "Common Stock — Harbor": -100_000,
    "Retained Earnings — Harbor": -60_000,
    Revenue: -530_000,
    "Cost of Goods Sold": 270_000,
    "Salaries Expense": 52_000,
  },
};

// ---------------------------------------------------------------------------
// GAAP hints
// ---------------------------------------------------------------------------
export interface GaapHint {
  id: string;
  title: string;
  source: string;
  rule: string;
  formula: string[];
  notes?: string[];
}

export const HINTS: Record<string, GaapHint> = {
  "sales-cogs": {
    id: "sales-cogs",
    title: "Sales on account & cost of goods sold",
    source: "ASC 606 (Revenue) · ASC 330 (Inventory), perpetual system",
    rule: "Revenue is recognized when control of the goods passes to the customer. Under a perpetual inventory system, the same sale also moves the goods' cost out of Inventory and into Cost of Goods Sold.",
    formula: [
      "Sale = Units × Selling price; Cost = Units × Unit cost",
      "Entry 1: Dr Accounts Receivable / Cr Revenue",
      "Entry 2: Dr Cost of Goods Sold / Cr Inventory",
    ],
    notes: ["The sale is recorded at selling price; COGS and Inventory at cost. The difference is gross profit."],
  },
  accruals: {
    id: "accruals",
    title: "Accrued expenses",
    source: "Accrual basis · FASB Concepts Statement 6 (expenses)",
    rule: "Expenses are recorded in the period they're incurred, even if the bill hasn't arrived or the cash hasn't been paid. Estimate the amount and record a liability.",
    formula: ["Estimate = Usage × Rate", "Entry: Dr Expense / Cr Accrued Liabilities"],
    notes: ["When the bill is later paid, the payment clears the accrued liability instead of hitting expense again."],
  },
  "deferred-revenue": {
    id: "deferred-revenue",
    title: "Unearned (deferred) revenue",
    source: "ASC 606-10-45 (contract liabilities)",
    rule: "Cash collected before goods or services are delivered is a liability. Revenue is recognized as each part of the obligation is satisfied.",
    formula: [
      "Earned = Total prepaid × (Units delivered ÷ Units promised)",
      "Entry: Dr Unearned Revenue / Cr Revenue",
    ],
  },
  "double-entry": {
    id: "double-entry",
    title: "Double-entry & normal balances",
    source: "Accounting equation · FASB Conceptual Framework",
    rule: "Every journal entry must have total debits equal to total credits. Each account's normal balance is the side that increases it.",
    formula: ["Assets = Liabilities + Equity", "Σ Debits = Σ Credits"],
    notes: [
      "Debit to increase: assets, expenses (and dividends).",
      "Credit to increase: liabilities, equity, revenue, and contra-assets such as Accumulated Depreciation or the Allowance for Credit Losses.",
      "Contra-liabilities such as Discount on Bonds Payable carry a debit balance.",
    ],
  },
  "straight-line": {
    id: "straight-line",
    title: "Straight-line depreciation",
    source: "ASC 360-10-35 (Property, Plant & Equipment: subsequent measurement)",
    rule: "Depreciation allocates an asset's depreciable base (cost less salvage value) over its useful life in a systematic and rational way. Straight-line spreads it evenly.",
    formula: [
      "Annual depreciation = (Cost − Salvage value) ÷ Useful life",
      "Spreadsheet: =SLN(cost, salvage, life)",
      "Entry: Dr Depreciation Expense / Cr Accumulated Depreciation",
    ],
    notes: [
      "Accumulated Depreciation is a contra-asset, so it's credited and the asset account itself stays at cost.",
      "Double-declining balance: rate = 2 ÷ life, applied to beginning book value. Ignore salvage until book value would drop below it.",
      "Partial years: multiply by months in service ÷ 12.",
    ],
  },
  "interest-accrual": {
    id: "interest-accrual",
    title: "Accruing interest",
    source: "Accrual basis of accounting · ASC 835 (Interest)",
    rule: "Interest expense is recognized as time passes, whether or not cash has been paid. At year-end, accrue interest for the months since the last payment.",
    formula: [
      "Interest = Principal × Annual rate × (Months outstanding ÷ 12)",
      "Entry: Dr Interest Expense / Cr Interest Payable",
    ],
    notes: [
      "Count months from the issue date (or the last payment) through the balance-sheet date.",
      "Rates are quoted annually, so always scale by the fraction of the year.",
    ],
  },
  prepaid: {
    id: "prepaid",
    title: "Prepaid expenses (deferrals)",
    source: "ASC 340-10 (Other Assets & Deferred Costs) · matching / accrual basis",
    rule: "Cash paid in advance is recorded as an asset, then expensed as the benefit is used up. At period-end, move the expired portion to expense.",
    formula: [
      "Expired = Total prepaid × (Months elapsed ÷ Months of coverage)",
      "Entry: Dr Insurance Expense / Cr Prepaid Insurance",
    ],
    notes: [
      "Count whole months from the start of coverage through the balance-sheet date (Sept 1 → Dec 31 is 4 months).",
    ],
  },
  cecl: {
    id: "cecl",
    title: "Allowance for credit losses (CECL)",
    source: "ASC 326-20 (Financial Instruments: Credit Losses, amortized cost)",
    rule: "Receivables are reported net of an allowance for the credit losses expected over their remaining life. Pooling receivables by age and applying loss rates (an aging schedule) is an acceptable method.",
    formula: [
      "Required allowance = Σ (Bucket balance × Expected loss rate)",
      "Adjustment = Required allowance − Existing credit balance",
      "Entry: Dr Credit Loss Expense / Cr Allowance for Credit Losses",
    ],
    notes: [
      "If the allowance already has a debit balance (write-offs exceeded it), add that balance to the adjustment instead of subtracting it.",
      "Loss rates should reflect historical experience adjusted for current conditions and reasonable, supportable forecasts.",
    ],
  },
  lcnrv: {
    id: "lcnrv",
    title: "Inventory: lower of cost and net realizable value",
    source: "ASC 330-10-35-1B (as amended by ASU 2015-11)",
    rule: "Inventory measured using FIFO or average cost is carried at the lower of cost and net realizable value. When NRV falls below cost, write the inventory down and recognize a loss.",
    formula: [
      "NRV = Estimated selling price − Costs of completion, disposal & transportation",
      "Write-down = Cost − NRV  (only if positive)",
      "Entry: Dr Cost of Goods Sold / Cr Inventory",
    ],
    notes: [
      "LIFO and the retail method still use lower of cost or market (LCM).",
      "Under US GAAP, inventory write-downs are not reversed if prices recover later (ASC 330-10-35-14).",
    ],
  },
  "effective-interest": {
    id: "effective-interest",
    title: "Bond discount: effective interest method",
    source: "ASC 835-30-35 (Interest: imputation of interest, subsequent measurement)",
    rule: "Bonds issued at a discount are carried net of the discount. Interest expense each period is the carrying value times the market (effective) rate. The cash paid is face value times the stated rate, and the difference amortizes the discount.",
    formula: [
      "Interest expense = Carrying value × Market rate",
      "Cash interest = Face value × Stated rate",
      "Discount amortized = Interest expense − Cash interest",
      "Entry: Dr Interest Expense / Cr Discount on Bonds Payable / Cr Cash",
    ],
    notes: [
      "Carrying value grows each period by the discount amortized, so it reaches face value at maturity.",
      "Straight-line amortization is only allowed when the result isn't materially different.",
    ],
  },
  payroll: {
    id: "payroll",
    title: "Payroll accruals & withholdings",
    source: "Accrual basis · IRS Circular E (employer withholding)",
    rule: "Accrue the full gross wages employees earned. Amounts withheld from their pay are liabilities owed to the government. Only the net pay is owed to employees.",
    formula: [
      "Employee FICA = Gross wages × 7.65%  (6.2% Social Security + 1.45% Medicare)",
      "Net pay = Gross wages − Income tax withheld − Employee FICA",
      "Entry: Dr Salaries Expense (gross) / Cr each withholding payable / Cr Salaries Payable (net)",
    ],
    notes: [
      "Social Security stops once an employee passes the annual wage base. Medicare has no cap.",
      "Employer payroll taxes (the employer's matching FICA, FUTA, SUTA) are a separate expense entry.",
    ],
  },
  consolidation: {
    id: "consolidation",
    title: "Consolidation eliminations",
    source: "ASC 810-10 (Consolidation) · ASC 805-30 (Goodwill)",
    rule: "A parent consolidates a subsidiary it controls. On the worksheet, eliminate the parent's investment against the subsidiary's equity at acquisition, and remove intercompany transactions so the group only reports dealings with outsiders.",
    formula: [
      "Goodwill = Consideration paid + FV of NCI − FV of identifiable net assets",
      "① Dr Sub common stock & retained earnings, Dr Goodwill / Cr Investment in Sub",
      "② Intercompany sales: Dr Revenue / Cr Cost of Goods Sold",
      "③ Intercompany balances: Dr Accounts Payable / Cr Accounts Receivable",
    ],
    notes: [
      "With 100% ownership and fair value equal to book value, net assets = the sub's common stock + retained earnings at acquisition.",
      "If intercompany inventory is still on hand at year-end, also defer the unrealized profit (Dr COGS / Cr Inventory).",
      "Eliminations live only on the consolidation worksheet. They're never posted to either company's own books.",
    ],
  },
  "sheet-formulas": {
    id: "sheet-formulas",
    title: "CellSheet formulas",
    source: "CellSheet 97 help",
    rule: "Start a cell with = to calculate. Reference other cells by column letter and row number.",
    formula: [
      "=B2*C2   =B6-D8   =(B2-C2)/D2",
      "=SUM(D2:D5)   =AVERAGE(B2:B5)   =MIN(…)   =MAX(…)",
      "=ROUND(x, 2)   =ABS(x)   =SLN(cost, salvage, life)",
    ],
    notes: [
      "Percentages like 15% are read as 0.15.",
      "Errors: #DIV/0! (divide by zero), #REF! (bad cell), #CIRC! (circular reference).",
    ],
  },
  workpapers: {
    id: "workpapers",
    title: "Workpaper sign-off",
    source: "AICPA AU-C 230 (Audit Documentation)",
    rule: "Documentation should let an experienced reviewer see what was done, the evidence obtained and the conclusion reached. Tie every figure back to its source before signing off.",
    formula: [
      "Highlighter → tick each source figure you relied on",
      "Calculator tape → shows your computation ties to the entry",
      "Binder → sign off as preparer once everything ties",
    ],
  },
};

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------
export interface Task {
  id: string;
  tier: number; // 1 = basic adjusting entries … 4 = consolidations
  title: string;
  book: BookId;
  steps: { label: string; expected: Record<string, number> }[]; // net debit (+) / credit (−) per account
  evidence: string[]; // source figures that must be highlighted in the email
  keyAmount: number; // what the calculator tape must show
  keyLabel: string;
  hints: string[];
  reward: number;
}

export const TASKS: Record<string, Task> = {
  van: {
    id: "van",
    tier: 1,
    title: "Depreciate the delivery van",
    book: "tidewater",
    steps: [
      { label: "Depreciation entry", expected: { "Depreciation Expense": 8_400, "Accumulated Depreciation": -8_400 } },
    ],
    evidence: ["$48,000", "$6,000", "5"],
    keyAmount: 8_400,
    keyLabel: "Annual depreciation",
    hints: ["straight-line", "double-entry"],
    reward: 20,
  },
  interest: {
    id: "interest",
    tier: 1,
    title: "Accrue interest on the note",
    book: "tidewater",
    steps: [{ label: "Interest accrual", expected: { "Interest Expense": 1_800, "Interest Payable": -1_800 } }],
    evidence: ["$120,000", "6%"],
    keyAmount: 1_800,
    keyLabel: "Accrued interest (Oct–Dec)",
    hints: ["interest-accrual", "double-entry"],
    reward: 20,
  },
  prepaid: {
    id: "prepaid",
    tier: 1,
    title: "Expire prepaid insurance",
    book: "tidewater",
    steps: [{ label: "Insurance expense", expected: { "Insurance Expense": 6_000, "Prepaid Insurance": -6_000 } }],
    evidence: ["$18,000", "12"],
    keyAmount: 6_000,
    keyLabel: "Expired insurance (Sept–Dec)",
    hints: ["prepaid", "double-entry"],
    reward: 20,
  },
  cecl: {
    id: "cecl",
    tier: 2,
    title: "True up the credit loss allowance",
    book: "tidewater",
    steps: [
      {
        label: "Allowance adjustment",
        expected: { "Credit Loss Expense": 5_500, "Allowance for Credit Losses": -5_500 },
      },
    ],
    evidence: ["$2,000"],
    keyAmount: 5_500,
    keyLabel: "Adjustment to the allowance",
    hints: ["cecl", "sheet-formulas"],
    reward: 35,
  },
  lcnrv: {
    id: "lcnrv",
    tier: 2,
    title: "Write inventory down to NRV",
    book: "tidewater",
    steps: [{ label: "Inventory write-down", expected: { "Cost of Goods Sold": 4_500, Inventory: -4_500 } }],
    evidence: ["$52,000", "$50,000", "$2,500"],
    keyAmount: 4_500,
    keyLabel: "Write-down (cost − NRV)",
    hints: ["lcnrv", "double-entry"],
    reward: 35,
  },
  bond: {
    id: "bond",
    tier: 3,
    title: "Record bond interest (effective interest)",
    book: "tidewater",
    steps: [
      {
        label: "Interest & discount amortization",
        expected: { "Interest Expense": 14_722.32, "Discount on Bonds Payable": -2_722.32, Cash: -12_000 },
      },
    ],
    evidence: ["$200,000", "6%", "8%", "$184,029"],
    keyAmount: 14_722.32,
    keyLabel: "Interest expense (carrying value × market rate)",
    hints: ["effective-interest", "double-entry"],
    reward: 55,
  },
  payroll: {
    id: "payroll",
    tier: 3,
    title: "Accrue December payroll",
    book: "tidewater",
    steps: [
      {
        label: "Payroll accrual",
        expected: {
          "Salaries Expense": 40_000,
          "Federal Income Tax Payable": -6_000,
          "FICA Taxes Payable": -3_060,
          "Salaries Payable": -30_940,
        },
      },
    ],
    evidence: ["$40,000", "$6,000", "7.65%"],
    keyAmount: 30_940,
    keyLabel: "Net pay owed to employees",
    hints: ["payroll", "double-entry"],
    reward: 55,
  },
  consolidation: {
    id: "consolidation",
    tier: 4,
    title: "Consolidate Harbor Logistics",
    book: "consolidation",
    steps: [
      {
        label: "① Eliminate investment / record goodwill",
        expected: {
          "Common Stock — Harbor": 100_000,
          "Retained Earnings — Harbor": 60_000,
          Goodwill: 40_000,
          "Investment in Harbor Logistics": -200_000,
        },
      },
      { label: "② Eliminate intercompany sales", expected: { Revenue: 50_000, "Cost of Goods Sold": -50_000 } },
      {
        label: "③ Eliminate intercompany balances",
        expected: { "Accounts Payable": 15_000, "Accounts Receivable": -15_000 },
      },
    ],
    evidence: ["$200,000", "$100,000", "$60,000", "$50,000", "$15,000"],
    keyAmount: 40_000,
    keyLabel: "Goodwill",
    hints: ["consolidation", "double-entry"],
    reward: 150,
  },
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
export interface Email {
  id: string;
  from: string; // NPC id
  subject: string;
  /** Tier 1: office minutes since midnight. Higher tiers: minutes after that tier unlocks. */
  arrivesAt: number;
  tier: number;
  body: string[];
  taskId?: string;
  sheet?: string; // CellSheet tab that supports this task
}

const at = (h: number, m: number) => h * 60 + m;

export const EMAILS: Email[] = [
  {
    id: "welcome",
    from: "eleanor",
    subject: "Welcome aboard!",
    arrivesAt: 0,
    tier: 1,
    body: [
      "Welcome to the firm! We're closing the books for our client, Tidewater Supply Co., for the year ended December 31.",
      "Your seniors will email you assignments. Post entries in LedgerLite. Then use the tools on your desk: highlight the source figures, run the math on the calculator, and sign off the workpaper in your binder. Every assignment needs all of that before it counts.",
      "Strong work gets you promoted, and promotions bring harder engagements. Don't be shy with the GAAP Hint button.",
      "— Eleanor",
    ],
  },
  {
    id: "van-email",
    from: "marcus",
    subject: "Adjusting entry: delivery van depreciation",
    arrivesAt: 0,
    tier: 1,
    taskId: "van",
    sheet: "Fixed Assets",
    body: [
      "Hey! Tidewater bought a delivery van on January 1 for $48,000. Estimated salvage value is $6,000 and useful life is 5 years. They use straight-line.",
      "No depreciation has been booked yet this year. Can you post the full-year entry? Details are on the Fixed Assets tab in CellSheet too.",
      "— Marcus",
    ],
  },
  {
    id: "interest-email",
    from: "dana",
    subject: "Interest accrual on the bank note",
    arrivesAt: 0,
    tier: 1,
    taskId: "interest",
    body: [
      "Tidewater signed a $120,000 note payable on October 1 at 6% annual interest. Principal and interest are both due next September.",
      "Please accrue the interest through December 31. Nothing's been recorded yet.",
      "— Dana",
    ],
  },
  {
    id: "prepaid-email",
    from: "eleanor",
    subject: "Prepaid insurance",
    arrivesAt: at(11, 0),
    tier: 1,
    taskId: "prepaid",
    body: [
      "On September 1, Tidewater paid $18,000 for a 12-month insurance policy and booked all of it to Prepaid Insurance.",
      "Please record the expired portion as of December 31.",
      "— Eleanor",
    ],
  },
  {
    id: "it-email",
    from: "theo",
    subject: "VPN maintenance tonight",
    arrivesAt: at(11, 30),
    tier: 1,
    body: [
      "The VPN goes down from 9 to 10 PM for patching. Save your work. If anything breaks, it was the patch, not me.",
      "— Theo",
    ],
  },
  {
    id: "cecl-email",
    from: "gwen",
    subject: "AR aging: allowance true-up needed",
    arrivesAt: 0,
    tier: 2,
    taskId: "cecl",
    sheet: "AR Aging",
    body: [
      "Congrats on the promotion! Now that you're on estimates: I dropped Tidewater's receivables aging into CellSheet (AR Aging tab) with our expected loss rate for each bucket.",
      "The allowance currently has a $2,000 credit balance. Work out the required allowance and post whatever adjustment gets us there.",
      "— Gwen",
    ],
  },
  {
    id: "lcnrv-email",
    from: "marcus",
    subject: "Inventory valuation (FIFO)",
    arrivesAt: 10,
    tier: 2,
    taskId: "lcnrv",
    body: [
      "Tidewater's ending inventory (FIFO) cost $52,000. It's expected to sell for $50,000, and it'll cost about $2,500 to ship and sell it.",
      "If it needs a write-down, book it to Cost of Goods Sold.",
      "— Marcus",
    ],
  },
  {
    id: "bond-email",
    from: "gwen",
    subject: "Bond interest: effective interest method",
    arrivesAt: 0,
    tier: 3,
    taskId: "bond",
    body: [
      "Senior-level one for you. On January 1, Tidewater had $200,000 face value of bonds outstanding with a 6% stated rate. Interest is paid annually every December 31. They were issued to yield 8%, and the carrying value at January 1 was $184,029.",
      "The December 31 interest payment and discount amortization haven't been booked. One entry, three lines.",
      "— Gwen",
    ],
  },
  {
    id: "payroll-email",
    from: "sofia",
    subject: "December payroll accrual",
    arrivesAt: 15,
    tier: 3,
    taskId: "payroll",
    body: [
      "December wages were earned but won't be paid until January 5. Gross wages were $40,000. We'll withhold $6,000 of federal income tax, plus employee FICA at 7.65%.",
      "Please accrue it all as of December 31. We'll book the employer-side taxes separately.",
      "— Sofia",
    ],
  },
  {
    id: "consolidation-email",
    from: "eleanor",
    subject: "Consolidation: Harbor Logistics",
    arrivesAt: 0,
    tier: 4,
    taskId: "consolidation",
    body: [
      "Time to run a consolidation. On January 1, Tidewater acquired 100% of Harbor Logistics for $200,000 cash. At that date Harbor's common stock was $100,000 and its retained earnings were $60,000. Fair values equaled book values.",
      "During the year Tidewater sold $50,000 of inventory to Harbor, which resold all of it to outside customers. At year-end Harbor still owes Tidewater $15,000 for those purchases.",
      "The combined trial balance is in LedgerLite's consolidation worksheet. Post the three elimination entries there and document the goodwill in your binder.",
      "— Eleanor",
    ],
  },
];

/** Starting CellSheet workbook (raw cell contents). */
export const STARTING_SHEETS: Record<string, Record<string, string>> = {
  Scratch: {},
  "AR Aging": {
    A1: "Aging bucket",
    B1: "Balance",
    C1: "Loss rate",
    D1: "Expected loss",
    A2: "Current",
    B2: "80000",
    C2: "1%",
    A3: "31–60 days",
    B3: "25000",
    C3: "5%",
    A4: "61–90 days",
    B4: "15000",
    C4: "15%",
    A5: "Over 90 days",
    B5: "8000",
    C5: "40%",
    A6: "Total",
    B6: "=SUM(B2:B5)",
    A8: "Allowance balance (Cr)",
    D8: "2000",
    A9: "Adjustment needed",
  },
  "Fixed Assets": {
    A1: "Delivery van",
    A2: "Cost",
    B2: "48000",
    A3: "Salvage value",
    B3: "6000",
    A4: "Useful life (yrs)",
    B4: "5",
    A6: "Annual depreciation",
  },
};

export const SHEET_HINTS: Record<string, string[]> = {
  "AR Aging": ["cecl"],
  "Fixed Assets": ["straight-line"],
};

// ---------------------------------------------------------------------------
// Entry checking
// ---------------------------------------------------------------------------
export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

export function netByAccount(lines: JournalLine[]) {
  const net: Record<string, number> = {};
  for (const l of lines) net[l.account] = (net[l.account] ?? 0) + l.debit - l.credit;
  for (const k of Object.keys(net)) if (Math.abs(net[k]) < 0.005) delete net[k];
  return net;
}

export type EntryCheck = "match" | "wrong-amount" | "wrong-accounts" | "unrelated";

export function checkEntry(lines: JournalLine[], expected: Record<string, number>): EntryCheck {
  const net = netByAccount(lines);
  const got = Object.keys(net).sort();
  const want = Object.keys(expected).sort();
  const sameAccounts = got.length === want.length && got.every((k, i) => k === want[i]);
  if (sameAccounts) return want.every((k) => Math.abs(net[k] - expected[k]) < 0.5) ? "match" : "wrong-amount";
  return got.some((k) => k in expected) ? "wrong-accounts" : "unrelated";
}

/** Office minute an email shows up, or null while its tier is still locked. */
export function emailArrival(email: Email, tierUnlockedAt: number[]): number | null {
  if (email.tier === 1) return email.arrivesAt;
  const unlocked = tierUnlockedAt[email.tier - 1];
  return unlocked === undefined ? null : unlocked + email.arrivesAt;
}
