// Tiny spreadsheet formula engine for CellSheet.
// Supports numbers (incl. 15% and 1,000), cell refs (B2), ranges inside
// functions (B2:D5), + - * / ^, parentheses, unary minus and a handful of
// functions: SUM AVERAGE MIN MAX ROUND ABS SLN.

export type Cells = Record<string, string>;
export type CellValue = number | string;

export class FormulaError extends Error {}

const REF = /^([A-Z])([1-9][0-9]?)$/;

export function parseLiteral(raw: string): number | null {
  const s = raw.trim().replace(/[$,]/g, "");
  if (!s) return null;
  const pct = s.endsWith("%");
  const n = Number(pct ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "ref"; value: string }
  | { kind: "id"; value: string }
  | { kind: "op"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)%?/.exec(src.slice(i));
      if (!m) throw new FormulaError("#ERR!");
      tokens.push({ kind: "num", value: parseLiteral(m[0]) ?? NaN });
      i += m[0].length;
    } else if (/[A-Za-z]/.test(ch)) {
      const m = /^[A-Za-z]+[0-9]*/.exec(src.slice(i))!;
      const word = m[0].toUpperCase();
      tokens.push(REF.test(word) ? { kind: "ref", value: word } : { kind: "id", value: word });
      i += m[0].length;
    } else if ("+-*/^(),:".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
    } else {
      throw new FormulaError("#ERR!");
    }
  }
  return tokens;
}

function expandRange(a: string, b: string): string[] {
  const [, c1, r1] = REF.exec(a)!;
  const [, c2, r2] = REF.exec(b)!;
  const cols = [c1.charCodeAt(0), c2.charCodeAt(0)].sort((x, y) => x - y);
  const rows = [Number(r1), Number(r2)].sort((x, y) => x - y);
  const refs: string[] = [];
  for (let c = cols[0]; c <= cols[1]; c++)
    for (let r = rows[0]; r <= rows[1]; r++) refs.push(String.fromCharCode(c) + r);
  return refs;
}

export function evaluateCell(cells: Cells, ref: string, stack: Set<string> = new Set()): CellValue {
  const raw = cells[ref] ?? "";
  if (!raw.startsWith("=")) return parseLiteral(raw) ?? raw;
  if (stack.has(ref)) throw new FormulaError("#CIRC!");
  stack.add(ref);
  try {
    return evaluateFormula(cells, raw.slice(1), stack);
  } finally {
    stack.delete(ref);
  }
}

function evaluateFormula(cells: Cells, src: string, stack: Set<string>): number {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.kind === "op" && peek().value === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError("#ERR!");
    pos++;
  };

  const numberAt = (ref: string, strict: boolean): number | null => {
    const v = evaluateCell(cells, ref, stack);
    if (typeof v === "number") return v;
    if (v === "") return strict ? 0 : null;
    if (strict) throw new FormulaError("#VALUE!");
    return null; // text inside ranges is skipped, like real spreadsheets
  };

  const expr = (): number => {
    let v = term();
    while (isOp("+") || isOp("-")) v = tokens[pos++].value === "+" ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = power();
    while (isOp("*") || isOp("/")) {
      const op = tokens[pos++].value;
      const rhs = power();
      if (op === "/" && rhs === 0) throw new FormulaError("#DIV/0!");
      v = op === "*" ? v * rhs : v / rhs;
    }
    return v;
  };
  const power = (): number => {
    const base = unary();
    if (isOp("^")) {
      pos++;
      return base ** power();
    }
    return base;
  };
  const unary = (): number => {
    if (isOp("-")) {
      pos++;
      return -unary();
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return primary();
  };
  const args = (): number[] => {
    expect("(");
    const values: number[] = [];
    if (!isOp(")")) {
      for (;;) {
        const t = peek();
        const next = tokens[pos + 1];
        if (t?.kind === "ref" && next?.kind === "op" && next.value === ":") {
          const end = tokens[pos + 2];
          if (end?.kind !== "ref") throw new FormulaError("#REF!");
          pos += 3;
          for (const r of expandRange(t.value, end.value)) {
            const n = numberAt(r, false);
            if (n !== null) values.push(n);
          }
        } else values.push(expr());
        if (!isOp(",")) break;
        pos++;
      }
    }
    expect(")");
    return values;
  };
  const primary = (): number => {
    const t = tokens[pos++];
    if (!t) throw new FormulaError("#ERR!");
    if (t.kind === "num") {
      if (Number.isNaN(t.value)) throw new FormulaError("#ERR!");
      return t.value;
    }
    if (t.kind === "ref") return numberAt(t.value, true)!;
    if (t.kind === "op" && t.value === "(") {
      const v = expr();
      expect(")");
      return v;
    }
    if (t.kind === "id") {
      const a = args();
      switch (t.value) {
        case "SUM":
          return a.reduce((s, n) => s + n, 0);
        case "AVERAGE":
          if (!a.length) throw new FormulaError("#DIV/0!");
          return a.reduce((s, n) => s + n, 0) / a.length;
        case "MIN":
          return a.length ? Math.min(...a) : 0;
        case "MAX":
          return a.length ? Math.max(...a) : 0;
        case "ABS":
          return Math.abs(a[0] ?? 0);
        case "ROUND": {
          const f = 10 ** (a[1] ?? 0);
          return Math.round((a[0] ?? 0) * f) / f;
        }
        case "SLN":
          if (a.length !== 3) throw new FormulaError("#ERR!");
          if (a[2] === 0) throw new FormulaError("#DIV/0!");
          return (a[0] - a[1]) / a[2];
      }
      throw new FormulaError("#NAME?");
    }
    throw new FormulaError("#ERR!");
  };

  const result = expr();
  if (pos !== tokens.length) throw new FormulaError("#ERR!");
  return result;
}

/** Evaluated display value for a cell; errors become their error code. */
export function displayCell(cells: Cells, ref: string): { text: string; numeric: boolean; error: boolean } {
  try {
    const v = evaluateCell(cells, ref);
    if (typeof v === "number") {
      const raw = cells[ref]?.trim() ?? "";
      const text = raw.endsWith("%")
        ? `${+(v * 100).toFixed(4)}%`
        : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
      return { text, numeric: true, error: false };
    }
    return { text: v, numeric: false, error: false };
  } catch (e) {
    return { text: e instanceof FormulaError ? e.message : "#ERR!", numeric: false, error: true };
  }
}
