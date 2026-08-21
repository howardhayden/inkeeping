import { CATALOG_PACKET_SCHEMA, type CatalogRecord, type RecordFormat } from "./lab-core.ts";

export type ExchangeFormat = "laclab-json" | "dublin-core" | "mods" | "csl-json" | "schema-jsonld" | "ris" | "bibtex" | "csv" | "tsv" | "marc-text";

export const EXCHANGE_FORMATS: { value: ExchangeFormat; label: string; extension: string; mime: string }[] = [
  { value: "laclab-json", label: "IN KEEPING JSON", extension: "in-keeping.json", mime: "application/json" },
  { value: "dublin-core", label: "OAI Dublin Core XML batch", extension: "dc.xml", mime: "application/xml" },
  { value: "mods", label: "MODS XML", extension: "mods.xml", mime: "application/xml" },
  { value: "csl-json", label: "CSL-JSON", extension: "csl.json", mime: "application/json" },
  { value: "schema-jsonld", label: "Schema.org JSON-LD", extension: "jsonld", mime: "application/ld+json" },
  { value: "ris", label: "RIS", extension: "ris", mime: "application/x-research-info-systems" },
  { value: "bibtex", label: "BibTeX", extension: "bib", mime: "application/x-bibtex" },
  { value: "csv", label: "CSV", extension: "csv", mime: "text/csv" },
  { value: "tsv", label: "TSV", extension: "tsv", mime: "text/tab-separated-values" },
  { value: "marc-text", label: "MARC mnemonic", extension: "mrk", mime: "text/plain" },
];

export const RECORD_FORMATS: RecordFormat[] = ["Article", "Book", "Online book", "Book chapter", "Conference paper", "Serial", "Newspaper", "Video", "Audio", "Image", "Map", "Score", "Dataset", "Software", "Website", "Report", "Thesis", "Manuscript", "Archival collection", "Other"];

export const DATA_FORMAT_RULES = [
  { type: "identifier", rule: "Preserve display value; normalize DOI, ISBN, and ISSN only for matching." },
  { type: "date", rule: "Use EDTF-compatible text when known; retain uncertain, open, and ranged dates." },
  { type: "name", rule: "Keep supplied display form, order, and responsibility; do not infer personal-name structure from punctuation." },
  { type: "language", rule: "Prefer BCP 47 or ISO 639 codes; preserve supplied labels." },
  { type: "controlled term", rule: "Repeat subjects and genres instead of joining them into one semantic value." },
  { type: "URL", rule: "Export only validated public HTTPS URLs without credentials or secret-like query keys." },
  { type: "rights", rule: "Keep rights statements and machine-actionable license URIs distinct." },
  { type: "boolean", rule: "Serialize as true/false in JSON and explicit yes/no text in human-readable formats." },
  { type: "list", rule: "Repeat native elements; versioned CSV and TSV store lists as JSON arrays inside cells." },
  { type: "text", rule: "Normalize Unicode to NFC and preserve meaning without injecting markup." },
] as const;

export function formatRecords(records: CatalogRecord[], format: ExchangeFormat): string {
  if (format === "laclab-json") return JSON.stringify({ schema: CATALOG_PACKET_SCHEMA, version: 1, kind: "catalog-batch", provenance: { label: "Formatted export", exportedAt: new Date().toISOString() }, records: records.map(packetRecord) }, null, 2);
  if (format === "dublin-core") return `<?xml version="1.0" encoding="UTF-8"?>\n<ik:collection xmlns:ik="https://hah.dev/ns/in-keeping/1" xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n${records.map(dcRecord).join("\n")}\n</ik:collection>\n`;
  if (format === "mods") return `<?xml version="1.0" encoding="UTF-8"?>\n<modsCollection xmlns="http://www.loc.gov/mods/v3">\n${records.map(modsRecord).join("\n")}\n</modsCollection>\n`;
  if (format === "csl-json") return JSON.stringify(records.map(cslRecord), null, 2);
  if (format === "schema-jsonld") return JSON.stringify({ "@context": "https://schema.org", "@graph": records.map(schemaRecord) }, null, 2);
  if (format === "ris") return records.map(risRecord).join("\n");
  if (format === "bibtex") return records.map(bibRecord).join("\n\n") + "\n";
  if (format === "marc-text") return records.map(marcTextRecord).join("\n");
  return delimited(records, format === "tsv" ? "\t" : ",");
}

export function exchangeFilename(base: string, format: ExchangeFormat): string {
  const safe = base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "records";
  return `${safe}.${EXCHANGE_FORMATS.find((item) => item.value === format)?.extension ?? "txt"}`;
}

export function exchangeMime(format: ExchangeFormat): string {
  return EXCHANGE_FORMATS.find((item) => item.value === format)?.mime ?? "text/plain";
}

function contributors(record: CatalogRecord): string[] { return record.contributors ?? []; }
function metadata(record: CatalogRecord) {
  return {
    issued: "", created: "", modified: "", publisher: "", place: "", language: "", subjects: [] as string[], genres: [] as string[], abstract: "", rights: "", license: "", series: "", containerTitle: "", volume: "", issue: "", pages: "", extent: "", audience: "", coverage: "", relations: [] as string[], notes: [] as string[],
    ...(record.metadata ?? {}),
  };
}

function packetRecord(record: CatalogRecord) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== "source"));
}

function dcRecord(record: CatalogRecord): string {
  const m = metadata(record);
  const fields = [
    x("dc:identifier", `urn:in-keeping:${record.id}`), x("dc:title", record.title), ...record.creators.map((value) => x("dc:creator", value)),
    ...contributors(record).map((value) => x("dc:contributor", value)), x("dc:type", record.format), x("dc:date", m.issued || record.year),
    x("dc:publisher", m.publisher), ...m.subjects.map((value) => x("dc:subject", value)), x("dc:description", m.abstract),
    x("dc:language", m.language), ...record.identifiers.map((item) => x("dc:identifier", `${item.scheme}:${item.value}`)),
    ...record.links.map((value) => x("dc:identifier", value)), x("dc:rights", m.rights), x("dc:rights", m.license),
    ...m.relations.map((value) => x("dc:relation", value)), x("dc:coverage", m.coverage),
  ].filter(Boolean);
  return `  <oai_dc:dc>\n${fields.map((value) => `    ${value}`).join("\n")}\n  </oai_dc:dc>`;
}

function modsRecord(record: CatalogRecord): string {
  const m = metadata(record);
  const names = [...record.creators.map((name) => ({ name, role: "creator" })), ...contributors(record).map((name) => ({ name, role: "contributor" }))];
  return `  <mods>\n    <recordInfo><recordIdentifier>${xml(record.id)}</recordIdentifier>${m.modified ? `<recordChangeDate>${xml(m.modified)}</recordChangeDate>` : ""}</recordInfo>\n    <titleInfo><title>${xml(record.title)}</title></titleInfo>\n${names.map(({ name, role }) => `    <name><namePart>${xml(name)}</namePart><role><roleTerm type="text">${role}</roleTerm></role></name>`).join("\n")}\n    <typeOfResource>${xml(modsType(record.format))}</typeOfResource>\n    <genre authority="in-keeping">${xml(record.format)}</genre>\n${m.genres.map((value) => `    <genre>${xml(value)}</genre>`).join("\n")}\n    <originInfo>${m.place ? `<place><placeTerm>${xml(m.place)}</placeTerm></place>` : ""}${m.publisher ? `<publisher>${xml(m.publisher)}</publisher>` : ""}${(m.issued || record.year) ? `<dateIssued>${xml(m.issued || record.year)}</dateIssued>` : ""}${m.created ? `<dateCreated>${xml(m.created)}</dateCreated>` : ""}${record.edition ? `<edition>${xml(record.edition)}</edition>` : ""}</originInfo>\n${m.language ? `    <language><languageTerm>${xml(m.language)}</languageTerm></language>\n` : ""}${m.subjects.map((value) => `    <subject><topic>${xml(value)}</topic></subject>`).join("\n")}\n${record.identifiers.map((item) => `    <identifier type="${xml(item.scheme)}">${xml(item.value)}</identifier>`).join("\n")}\n${record.links.map((value) => `    <location><url>${xml(value)}</url></location>`).join("\n")}\n${record.location ? `    <location><shelfLocator>${xml(record.location)}</shelfLocator></location>\n` : ""}${m.abstract ? `    <abstract>${xml(m.abstract)}</abstract>\n` : ""}${m.rights ? `    <accessCondition>${xml(m.rights)}</accessCondition>\n` : ""}${m.license ? `    <accessCondition type="license">${xml(m.license)}</accessCondition>\n` : ""}${m.extent ? `    <physicalDescription><extent>${xml(m.extent)}</extent></physicalDescription>\n` : ""}${m.series ? `    <relatedItem type="series"><titleInfo><title>${xml(m.series)}</title></titleInfo></relatedItem>\n` : ""}${m.audience ? `    <targetAudience>${xml(m.audience)}</targetAudience>\n` : ""}${m.notes.map((value) => `    <note>${xml(value)}</note>`).join("\n")}\n  </mods>`;
}

function cslRecord(record: CatalogRecord) {
  const m = metadata(record);
  return { id: record.id, type: cslType(record.format), genre: record.format, title: record.title, author: record.creators.map(cslName), editor: contributors(record).map(cslName), issued: cslDateValue(m.issued || record.year), publisher: m.publisher || undefined, "publisher-place": m.place || undefined, language: m.language || undefined, abstract: m.abstract || undefined, DOI: id(record, "doi") || undefined, ISBN: id(record, "isbn") || undefined, ISSN: id(record, "issn") || undefined, URL: record.links[0], volume: m.volume || undefined, issue: m.issue || undefined, page: m.pages || undefined, "container-title": m.containerTitle || undefined, keyword: m.subjects.join("; ") || undefined };
}

function schemaRecord(record: CatalogRecord) {
  const m = metadata(record);
  return { "@type": schemaType(record.format), additionalType: record.format, "@id": `urn:in-keeping:${record.id}`, identifier: record.identifiers.map((item) => ({ "@type": "PropertyValue", propertyID: item.scheme, value: item.value })), name: record.title, author: record.creators.map((name) => ({ "@type": "Person", name })), contributor: contributors(record).map((name) => ({ "@type": "Person", name })), datePublished: m.issued || record.year || undefined, publisher: m.publisher ? { "@type": "Organization", name: m.publisher } : undefined, inLanguage: m.language || undefined, about: m.subjects, description: m.abstract || undefined, license: m.license || undefined, url: record.links };
}

function risRecord(record: CatalogRecord): string {
  const m = metadata(record);
  const lines = [`TY  - ${risType(record.format)}`, `M3  - ${plain(record.format)}`, `ID  - ${plain(record.id)}`, `TI  - ${plain(record.title)}`, ...record.creators.map((value) => `AU  - ${plain(value)}`), ...contributors(record).map((value) => `A2  - ${plain(value)}`), m.issued || record.year ? `PY  - ${plain(m.issued || record.year)}` : "", m.publisher ? `PB  - ${plain(m.publisher)}` : "", m.place ? `CY  - ${plain(m.place)}` : "", m.language ? `LA  - ${plain(m.language)}` : "", record.edition ? `ET  - ${plain(record.edition)}` : "", m.containerTitle ? `T2  - ${plain(m.containerTitle)}` : "", m.series ? `T3  - ${plain(m.series)}` : "", m.volume ? `VL  - ${plain(m.volume)}` : "", m.issue ? `IS  - ${plain(m.issue)}` : "", m.pages ? `SP  - ${plain(m.pages)}` : "", m.abstract ? `AB  - ${plain(m.abstract)}` : "", m.rights ? `C1  - ${plain(m.rights)}` : "", ...m.notes.map((value) => `N1  - ${plain(value)}`), ...m.subjects.map((value) => `KW  - ${plain(value)}`), ...record.links.map((value) => `UR  - ${plain(value)}`), ...record.identifiers.filter((item) => item.scheme === "doi").map((item) => `DO  - ${plain(item.value)}`), ...record.identifiers.filter((item) => item.scheme === "isbn" || item.scheme === "issn").map((item) => `SN  - ${plain(item.value)}`), "ER  - "];
  return lines.filter(Boolean).join("\n") + "\n";
}

function bibRecord(record: CatalogRecord): string {
  const m = metadata(record);
  const containerField = ["Book chapter", "Conference paper"].includes(record.format) ? "booktitle" : "journal";
  const fields: [string, string, boolean?][] = [["title", record.title], ["type", record.format], ["author", bibNames(record.creators), true], ["editor", bibNames(contributors(record)), true], ["year", (m.issued || record.year).slice(0, 4)], ["publisher", m.publisher], ["address", m.place], ["edition", record.edition], [containerField, m.containerTitle], ["series", m.series], ["volume", m.volume], ["number", m.issue], ["pages", m.pages], ["doi", id(record, "doi")], ["isbn", id(record, "isbn")], ["issn", id(record, "issn")], ["url", record.links[0] || ""], ["keywords", m.subjects.join("; ")], ["abstract", m.abstract], ["language", m.language], ["copyright", m.rights], ["note", m.notes.join("; ")]];
  return `@${bibType(record.format)}{${bibKey(record)},\n${fields.filter(([, value]) => value).map(([key, value, encoded]) => `  ${key} = {${encoded ? value : bib(value)}},`).join("\n")}\n}`;
}

function delimited(records: CatalogRecord[], delimiter: string): string {
  const headers = ["in_keeping_tabular_version", "id", "title", "creators", "contributors", "year", "issued", "created", "modified", "format", "identifiers", "links", "publisher", "place", "language", "subjects", "genres", "abstract", "rights", "license", "series", "container_title", "volume", "issue", "pages", "extent", "audience", "coverage", "relations", "notes", "availability", "edition", "location", "suppressed", "public_visible", "requestable"];
  const list = (values: readonly string[]) => JSON.stringify(values);
  const identifiers = (values: CatalogRecord["identifiers"]) => JSON.stringify(values);
  const rows = records.map((r) => { const m = metadata(r); return ["1", r.id, r.title, list(r.creators), list(contributors(r)), r.year, m.issued, m.created, m.modified, r.format, identifiers(r.identifiers), list(r.links), m.publisher, m.place, m.language, list(m.subjects), list(m.genres), m.abstract, m.rights, m.license, m.series, m.containerTitle, m.volume, m.issue, m.pages, m.extent, m.audience, m.coverage, list(m.relations), list(m.notes), r.availability, r.edition, r.location, String(r.suppressed), String(r.publicVisible), String(r.requestable)]; });
  return [headers, ...rows].map((row, rowIndex) => row.map((value) => cell(rowIndex === 0 ? String(value ?? "") : encodeTabularCell(String(value ?? ""), delimiter), delimiter)).join(delimiter)).join("\n") + "\n";
}

function marcTextRecord(record: CatalogRecord): string {
  const m = metadata(record);
  const marc = (value: string) => plain(value).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
  const profile = marcProfile(record.format);
  const leader = `00000n${profile.recordType}${profile.bibliographicLevel}${profile.typeOfControl ?? " "}a2200000 i 4500`;
  const blank = "\\";
  const blanks = "\\\\";
  const lines = [`=LDR  ${leader}`, `=001  ${marc(record.id)}`, `=245  00$a${marc(record.title)}`, ...record.creators.map((v) => `=720  ${blanks}$a${marc(v)}$ecreator`), ...contributors(record).map((v) => `=720  ${blanks}$a${marc(v)}$econtributor`), ...record.identifiers.map((i) => i.scheme === "isbn" ? `=020  ${blanks}$a${marc(i.value)}` : i.scheme === "issn" ? `=022  ${blanks}$a${marc(i.value)}` : `=024  7${blank}$a${marc(i.value)}$2${i.scheme}`), record.edition ? `=250  ${blanks}$a${marc(record.edition)}` : "", m.publisher || m.place || m.issued || record.year ? `=264  ${blank}1${m.place ? `$a${marc(m.place)}` : ""}${m.publisher ? `$b${marc(m.publisher)}` : ""}${m.issued || record.year ? `$c${marc(m.issued || record.year)}` : ""}` : "", m.language ? `=041  ${blanks}$a${marc(m.language)}` : "", m.extent ? `=300  ${blanks}$a${marc(m.extent)}` : "", `=336  ${blanks}$a${profile.contentLabel}$b${profile.contentCode}$2rdacontent`, `=337  ${blanks}$a${profile.mediaLabel}$b${profile.mediaCode}$2rdamedia`, `=338  ${blanks}$a${profile.carrierLabel}$b${profile.carrierCode}$2rdacarrier`, `=655  ${blank}7$a${marc(record.format)}$2in-keeping`, ...m.genres.map((v) => `=655  ${blank}7$a${marc(v)}`), ...m.subjects.map((v) => `=650  ${blank}0$a${marc(v)}`), m.abstract ? `=520  ${blanks}$a${marc(m.abstract)}` : "", ...m.notes.map((v) => `=500  ${blanks}$a${marc(v)}`), record.location ? `=852  ${blanks}$b${marc(record.location)}` : "", ...record.links.map((v) => `=856  40$u${marc(v)}`)];
  return lines.filter(Boolean).join("\n") + "\n";
}

type MarcProfile = {
  recordType: string;
  bibliographicLevel: string;
  typeOfControl?: string;
  contentLabel: string;
  contentCode: string;
  mediaLabel: string;
  mediaCode: string;
  carrierLabel: string;
  carrierCode: string;
};

function marcProfile(format: RecordFormat): MarcProfile {
  const textVolume = { recordType: "a", bibliographicLevel: "m", contentLabel: "text", contentCode: "txt", mediaLabel: "unmediated", mediaCode: "n", carrierLabel: "volume", carrierCode: "nc" };
  const textOnline = { ...textVolume, mediaLabel: "computer", mediaCode: "c", carrierLabel: "online resource", carrierCode: "cr" };
  const profiles: Record<RecordFormat, MarcProfile> = {
    Article: { ...textVolume, bibliographicLevel: "b" },
    Book: textVolume,
    "Online book": textOnline,
    "Book chapter": { ...textVolume, bibliographicLevel: "a" },
    "Conference paper": { ...textVolume, bibliographicLevel: "a" },
    Serial: { ...textVolume, bibliographicLevel: "s" },
    Newspaper: { ...textVolume, bibliographicLevel: "s" },
    Video: { recordType: "g", bibliographicLevel: "m", contentLabel: "two-dimensional moving image", contentCode: "tdi", mediaLabel: "video", mediaCode: "v", carrierLabel: "videodisc", carrierCode: "vd" },
    Audio: { recordType: "i", bibliographicLevel: "m", contentLabel: "spoken word", contentCode: "spw", mediaLabel: "audio", mediaCode: "s", carrierLabel: "audio disc", carrierCode: "sd" },
    Image: { recordType: "k", bibliographicLevel: "m", contentLabel: "still image", contentCode: "sti", mediaLabel: "unmediated", mediaCode: "n", carrierLabel: "sheet", carrierCode: "nb" },
    Map: { recordType: "e", bibliographicLevel: "m", contentLabel: "cartographic image", contentCode: "cri", mediaLabel: "unmediated", mediaCode: "n", carrierLabel: "sheet", carrierCode: "nb" },
    Score: { recordType: "c", bibliographicLevel: "m", contentLabel: "notated music", contentCode: "ntm", mediaLabel: "unmediated", mediaCode: "n", carrierLabel: "volume", carrierCode: "nc" },
    Dataset: { recordType: "m", bibliographicLevel: "m", contentLabel: "computer dataset", contentCode: "cod", mediaLabel: "computer", mediaCode: "c", carrierLabel: "online resource", carrierCode: "cr" },
    Software: { recordType: "m", bibliographicLevel: "m", contentLabel: "computer program", contentCode: "cop", mediaLabel: "computer", mediaCode: "c", carrierLabel: "online resource", carrierCode: "cr" },
    Website: { ...textOnline, recordType: "m", bibliographicLevel: "i" },
    Report: textVolume,
    Thesis: textVolume,
    Manuscript: { ...textVolume, recordType: "t" },
    "Archival collection": { recordType: "p", bibliographicLevel: "c", typeOfControl: "a", contentLabel: "text", contentCode: "txt", mediaLabel: "unmediated", mediaCode: "n", carrierLabel: "other unmediated carrier", carrierCode: "nz" },
    Other: { recordType: "p", bibliographicLevel: "m", contentLabel: "other", contentCode: "xxx", mediaLabel: "other", mediaCode: "x", carrierLabel: "unspecified", carrierCode: "zu" },
  };
  return profiles[format];
}

function x(name: string, value: string): string { return value ? `<${name}>${xml(value)}</${name}>` : ""; }
function xml(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!); }
function bib(value: string): string {
  return [...value.replace(/\r\n?/g, "\n")].map((character) => {
    if (character === "\\") return "\\textbackslash{}";
    if ("{}%#$&_".includes(character)) return `\\${character}`;
    if (character === "~") return "\\textasciitilde{}";
    if (character === "^") return "\\textasciicircum{}";
    return character;
  }).join("");
}
function bibNames(values: string[]): string { return values.map((value) => `{${bib(value)}}`).join(" and "); }
function cell(value: string, delimiter: string): string { return value.includes(delimiter) || /["\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }
function encodeTabularCell(value: string, delimiter: string): string {
  const escaped = delimiter === "\t" ? value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\r/g, "\\r").replace(/\n/g, "\\n") : value;
  return /^'*(?:[=+@-])/.test(escaped.trimStart()) ? `'${escaped}` : escaped;
}
function plain(value: string): string { return value.replace(/[\r\n\t]+/g, " ").trim(); }
function id(record: CatalogRecord, scheme: string): string { return record.identifiers.find((item) => item.scheme === scheme)?.value ?? ""; }
function bibKey(record: CatalogRecord): string { return record.id.replace(/[^A-Za-z0-9.:_-]/g, "") || "record"; }
function cslName(name: string) { return { literal: name }; }
function cslDateValue(value: string): { "date-parts": number[][] } | { literal: string } | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!match) return { literal: value };
  const parts = match.slice(1).filter((part): part is string => part !== undefined).map(Number);
  const [, month, day] = parts;
  if (month !== undefined && (month < 1 || month > 12)) return { literal: value };
  if (day !== undefined) {
    const candidate = new Date(0);
    candidate.setUTCHours(0, 0, 0, 0);
    candidate.setUTCFullYear(parts[0], month - 1, day);
    if (day < 1 || candidate.getUTCFullYear() !== parts[0] || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return { literal: value };
  }
  return { "date-parts": [parts] };
}
function cslType(f: RecordFormat): string { return ({ Article: "article-journal", "Book chapter": "chapter", "Conference paper": "paper-conference", Book: "book", "Online book": "book", Serial: "article", Newspaper: "article-newspaper", Video: "motion_picture", Audio: "song", Dataset: "dataset", Software: "software", Website: "webpage", Report: "report", Thesis: "thesis", Manuscript: "manuscript", Map: "map", Score: "musical_score" } as Partial<Record<RecordFormat, string>>)[f] ?? "document"; }
function schemaType(f: RecordFormat): string { return ({ Article: "ScholarlyArticle", "Book chapter": "Chapter", "Conference paper": "ScholarlyArticle", Book: "Book", "Online book": "Book", Serial: "Periodical", Newspaper: "Newspaper", Video: "VideoObject", Audio: "AudioObject", Image: "ImageObject", Map: "Map", Score: "MusicComposition", Dataset: "Dataset", Software: "SoftwareSourceCode", Website: "WebSite", Report: "Report", Thesis: "Thesis", Manuscript: "Manuscript", "Archival collection": "ArchiveComponent" } as Partial<Record<RecordFormat, string>>)[f] ?? "CreativeWork"; }
function risType(f: RecordFormat): string { return ({ Article: "JOUR", "Book chapter": "CHAP", "Conference paper": "CPAPER", Book: "BOOK", "Online book": "EBOOK", Serial: "SER", Newspaper: "NEWS", Video: "VIDEO", Audio: "SOUND", Image: "ART", Map: "MAP", Score: "MUSIC", Dataset: "DATA", Software: "COMP", Website: "ELEC", Report: "RPRT", Thesis: "THES", Manuscript: "MANSCPT" } as Partial<Record<RecordFormat, string>>)[f] ?? "GEN"; }
function bibType(f: RecordFormat): string { return ({ Article: "article", "Book chapter": "incollection", "Conference paper": "inproceedings", Book: "book", "Online book": "book", Newspaper: "article", Report: "techreport", Thesis: "phdthesis", Manuscript: "unpublished" } as Partial<Record<RecordFormat, string>>)[f] ?? "misc"; }
function modsType(f: RecordFormat): string { if (["Article", "Book", "Online book", "Book chapter", "Conference paper", "Serial", "Newspaper", "Report", "Thesis", "Manuscript"].includes(f)) return "text"; if (f === "Video") return "moving image"; if (f === "Audio") return "sound recording"; if (f === "Image") return "still image"; if (f === "Map") return "cartographic"; if (f === "Score") return "notated music"; if (f === "Software") return "software, multimedia"; return "mixed material"; }
