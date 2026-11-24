/**
 * src/yaml.ts — the YAML subset .jhon/studio.yaml is written in, with no dependency.
 *
 * Read: mappings by indentation (spaces only), `key: value` with keys of letters, digits, `_`
 * and `-`; lists as block items (`- en`, or `- key: value` for a mapping whose other keys line
 * up under the first) or flow lists of scalars (`[en, es]`); scalars double-quoted
 * (with \" \\ \n \t \uXXXX), single-quoted ('' for a quote) or plain (true, false, null, ~,
 * numbers, else a string); `#` comments at a line's start or after a space. Anything else
 * (anchors, tags, block scalars, flow mappings, a list item that is itself a list, documents
 * after the first) is refused with its line number, so a file never means something it does not
 * say.
 */

export type Scalar = string | number | boolean | null;
export type Value = Scalar | Value[] | { [k: string]: Value };

class YamlError extends Error {}
const fail = (line: number, msg: string): never => { throw new YamlError(`line ${line}: ${msg}`); };

/** The part of a line before its comment (a `#` at the start or after whitespace, outside quotes). */
function stripComment(s: string, line: number): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (q === '"' && c === "\\") i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[,:]/.test(s[i - 1]!)) q = c;
    } else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i).trimEnd();
  }
  if (q) fail(line, `unterminated ${q === '"' ? "double" : "single"}-quoted string`);
  return s.trimEnd();
}

function scalar(raw: string, line: number): Scalar {
  const s = raw.trim();
  if (s === "" || s === "~" || s === "null") return null;
  if (s[0] === '"') {
    if (s.length < 2 || s.at(-1) !== '"') fail(line, "unterminated double-quoted string");
    return s.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e: string) => {
      if (e[0] === "u") return String.fromCharCode(parseInt(e.slice(1), 16));
      const map: Record<string, string> = { n: "\n", t: "\t", '"': '"', "\\": "\\", "/": "/", "0": "\0" };
      if (!(e in map)) fail(line, `unknown escape \\${e}`);
      return map[e]!;
    });
  }
  if (s[0] === "'") {
    if (s.length < 2 || s.at(-1) !== "'") fail(line, "unterminated single-quoted string");
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s[0] === "&" || s[0] === "*") fail(line, "anchors and aliases are not supported");
  if (s[0] === "!") fail(line, "tags are not supported");
  if (s[0] === "|" || s[0] === ">") fail(line, "block scalars (| and >) are not supported; write the text on one line, quoted");
  if (s[0] === "{") fail(line, "flow mappings ({...}) are not supported; write the mapping as indented lines");
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/** A flow list of scalars: `[a, "b, c", 3]`. */
function flowList(s: string, line: number): Scalar[] {
  const body = s.trim();
  if (body.at(-1) !== "]") fail(line, "unterminated flow list");
  const inner = body.slice(1, -1).trim();
  if (inner === "") return [];
  const items: string[] = [];
  let q: string | null = null, cur = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (q) {
      cur += c;
      if (q === '"' && c === "\\") cur += inner[++i] ?? "";
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") { q = c; cur += c; }
    else if (c === "[" || c === "{") fail(line, "nested flow collections are not supported");
    else if (c === ",") { items.push(cur); cur = ""; }
    else cur += c;
  }
  items.push(cur);
  return items.map((x) => scalar(x, line));
}

interface Line { n: number; indent: number; text: string }

/** Parses the subset; returns the top-level mapping ({} for an empty document). */
export function parseYaml(src: string): { [k: string]: Value } {
  const lines: Line[] = [];
  src.replace(/\r\n?/g, "\n").split("\n").forEach((raw, i) => {
    const n = i + 1;
    const lead = raw.match(/^[ \t]*/)![0];
    if (lead.includes("\t") && raw.trim() !== "") fail(n, "tabs are not allowed for indentation; use spaces");
    const text = stripComment(raw.slice(lead.length), n);
    if (text === "") return;
    if (text === "---" && lead === "" && lines.length === 0) return;
    if (text === "---" || text === "...") fail(n, "only one document is supported");
    lines.push({ n, indent: lead.length, text });
  });
  let pos = 0;

  function block(indent: number): Value {
    const first = lines[pos]!;
    if (first.text.startsWith("- ") || first.text === "-") return list(indent);
    return mapping(indent);
  }

  function list(indent: number): Value[] {
    const out: Value[] = [];
    while (pos < lines.length && lines[pos]!.indent === indent && (lines[pos]!.text.startsWith("- ") || lines[pos]!.text === "-")) {
      const l = lines[pos]!;
      const item = l.text.slice(1).trim();
      if (item === "") fail(l.n, "an empty list item is not supported");
      if (item.startsWith("- ") || item === "-") fail(l.n, "nested lists are not supported");
      if (/^[A-Za-z0-9_-]+:(\s|$)/.test(item)) {
        // A mapping: its first key sits after the dash; the rest line up under it.
        const at = indent + l.text.length - l.text.slice(1).trimStart().length;
        lines[pos] = { n: l.n, indent: at, text: item };
        out.push(mapping(at));
        continue;
      }
      pos++;
      out.push(item.startsWith("[") ? flowList(item, l.n) : scalar(item, l.n));
    }
    if (pos < lines.length && lines[pos]!.indent > indent) fail(lines[pos]!.n, "unexpected indent after a list");
    return out;
  }

  function mapping(indent: number): { [k: string]: Value } {
    const out: { [k: string]: Value } = {};
    while (pos < lines.length) {
      const l = lines[pos]!;
      if (l.indent < indent) break;
      if (l.indent > indent) fail(l.n, `unexpected indent (expected ${indent} spaces)`);
      if (l.text.startsWith("- ")) fail(l.n, "a list item where a key was expected");
      const m = l.text.match(/^([A-Za-z0-9_-]+):(?:\s+(.*))?$/);
      if (!m) fail(l.n, `expected "key: value", got ${JSON.stringify(l.text)}`);
      const [, k, rest = ""] = m!;
      if (Object.prototype.hasOwnProperty.call(out, k!)) fail(l.n, `duplicate key "${k}"`);
      pos++;
      if (rest.trim() !== "") {
        out[k!] = rest.trim().startsWith("[") ? flowList(rest, l.n) : scalar(rest, l.n);
        continue;
      }
      const next = lines[pos];
      if (next && next.indent > indent) out[k!] = block(next.indent);
      else if (next && next.indent === indent && next.text.startsWith("- ")) out[k!] = list(indent);
      else out[k!] = null;
    }
    return out;
  }

  if (lines.length === 0) return {};
  if (lines[0]!.indent !== 0) fail(lines[0]!.n, "unexpected indent at the top level");
  const doc = mapping(0);
  if (pos < lines.length) fail(lines[pos]!.n, "unexpected indent");
  return doc;
}

/** Whether a string must be quoted to be read back as the same string. */
function needsQuotes(s: string): boolean {
  if (s === "" || s !== s.trim()) return true;
  if (/^(true|false|null|~)$/.test(s) || /^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
  return /: |\s#|[\n\t\\"]|:$/.test(s);
}
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
function writeScalar(v: Scalar): string {
  if (v === null) return "null";
  if (typeof v === "string") return needsQuotes(v) ? quote(v) : v;
  return String(v);
}

/** Writes a mapping in the subset: nested mappings indented by two spaces, lists of scalars in flow form. */
export function stringifyYaml(value: { [k: string]: Value }, indent = 0): string {
  const pad = " ".repeat(indent);
  let out = "";
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) out += `${pad}${k}:\n${stringifyYaml(v, indent + 2)}`;
    else if (Array.isArray(v)) {
      if (v.some((x) => x !== null && typeof x === "object")) throw new Error(`stringifyYaml: ${k}: only lists of scalars`);
      out += `${pad}${k}: [${(v as Scalar[]).map((x) => (typeof x === "string" && /[,[\]]/.test(x) ? quote(x) : writeScalar(x))).join(", ")}]\n`;
    } else out += `${pad}${k}: ${writeScalar(v)}\n`;
  }
  return out;
}
