export const MAX_XML_ELEMENTS = 100_000;
export const MAX_XML_DEPTH = 256;
export const MAX_XML_NODES_AND_ATTRIBUTES = 100_000;
export const MAX_XML_ATTRIBUTES_PER_ELEMENT = 64;
export const MAX_XML_TAG_LENGTH = 16_384;
export const MAX_XML_TEXT_LENGTH = 8_192;

/**
 * Performs a linear, allocation-bounded structural scan before DOMParser is
 * allowed to construct a tree. This is not schema validation; it is the first
 * resource and external-reference boundary for untrusted XML.
 */
export function assertSafeXmlText(text: string): void {
  let elements = 0;
  let nodesAndAttributes = 0;
  let depth = 0;
  let index = 0;
  let sawDeclaration = false;
  const openElements: string[] = [];

  while (index < text.length) {
    const opening = text.indexOf("<", index);
    if (opening === -1) {
      countTextNode(text.slice(index), () => { nodesAndAttributes = addAllocation(nodesAndAttributes); });
      break;
    }
    countTextNode(text.slice(index, opening), () => { nodesAndAttributes = addAllocation(nodesAndAttributes); });

    if (text.startsWith("<!--", opening)) {
      const end = requiredTerminator(text, "-->", opening + 4, "XML comment");
      if (end - opening - 4 > MAX_XML_TEXT_LENGTH) throw new Error("XML comment exceeds 8,192 characters.");
      const comment = text.slice(opening + 4, end);
      if (comment.includes("--") || comment.endsWith("-")) throw new Error("XML comment contains an invalid hyphen sequence.");
      nodesAndAttributes = addAllocation(nodesAndAttributes);
      index = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", opening)) {
      const end = requiredTerminator(text, "]]>", opening + 9, "CDATA section");
      if (end - opening - 9 > MAX_XML_TEXT_LENGTH) throw new Error("XML CDATA section exceeds 8,192 characters.");
      nodesAndAttributes = addAllocation(nodesAndAttributes);
      index = end + 3;
      continue;
    }
    if (text.startsWith("<?", opening)) {
      const end = requiredTerminator(text, "?>", opening + 2, "processing instruction");
      const instruction = text.slice(opening + 2, end).trim();
      if (!sawDeclaration && /^xml(?:\s|$)/i.test(instruction) && !text.slice(0, opening).trim()) {
        if (instruction.length > 1_024) throw new Error("XML declaration exceeds 1,024 characters.");
        if (!/^xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])UTF-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*$/i.test(instruction)) {
          throw new Error("XML declaration must describe XML 1.0 encoded as UTF-8.");
        }
        sawDeclaration = true;
        nodesAndAttributes = addAllocation(nodesAndAttributes);
        index = end + 2;
        continue;
      }
      throw new Error("XML processing instructions are not accepted.");
    }
    if (text.startsWith("<!", opening)) {
      throw new Error("XML declarations, DTDs, and entities are not accepted.");
    }

    const end = tagEnd(text, opening + 1);
    if (end - opening - 1 > MAX_XML_TAG_LENGTH) throw new Error("XML tag exceeds 16,384 characters.");
    const tag = text.slice(opening + 1, end).trim();
    if (!tag) throw new Error("XML contains an empty tag.");
    if (tag.includes("<")) throw new Error("XML contains a malformed tag.");

    if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      if (!xmlName(name)) throw new Error("XML closing tag is malformed.");
      const expected = openElements.pop();
      if (expected !== name) throw new Error("XML closing tags are unbalanced.");
      depth -= 1;
      if (depth < 0) throw new Error("XML closing tags are unbalanced.");
    } else {
      const selfClosing = tag.endsWith("/");
      const content = selfClosing ? tag.slice(0, -1).trimEnd() : tag;
      const name = content.match(/^([^\s/>]+)/)?.[1] ?? "";
      if (!xmlName(name)) throw new Error("XML opening tag is malformed.");
      const attributes = countAttributes(content, name.length);
      elements += 1;
      if (elements > MAX_XML_ELEMENTS) throw new Error("XML element limit exceeded.");
      nodesAndAttributes = addAllocation(nodesAndAttributes, 1 + attributes);
      if (!selfClosing) {
        depth += 1;
        if (depth > MAX_XML_DEPTH) throw new Error("XML nesting exceeds 256 levels.");
        openElements.push(name);
      }
    }
    index = end + 1;
  }

  if (depth !== 0 || openElements.length) throw new Error("XML elements are not fully closed.");
}

function countAttributes(content: string, start: number): number {
  let index = start;
  let count = 0;
  const names = new Set<string>();
  while (index < content.length) {
    if (!/\s/.test(content[index])) throw new Error("XML attributes must be separated by whitespace.");
    while (index < content.length && /\s/.test(content[index])) index += 1;
    if (index >= content.length) break;
    const nameStart = index;
    while (index < content.length && /[A-Za-z0-9_.:-]/.test(content[index])) index += 1;
    const name = content.slice(nameStart, index);
    if (!xmlName(name)) throw new Error("XML attribute name is malformed.");
    if (names.has(name)) throw new Error("XML attributes must be unique on an element.");
    names.add(name);
    while (index < content.length && /\s/.test(content[index])) index += 1;
    if (content[index] !== "=") throw new Error("XML attribute requires =.");
    index += 1;
    while (index < content.length && /\s/.test(content[index])) index += 1;
    const quote = content[index];
    if (quote !== '"' && quote !== "'") throw new Error("XML attribute values must be quoted.");
    index += 1;
    const valueStart = index;
    while (index < content.length && content[index] !== quote) {
      if (content[index] === "<") throw new Error("XML attribute values cannot contain <.");
      index += 1;
    }
    if (index >= content.length) throw new Error("XML attribute value is not terminated.");
    if (index - valueStart > MAX_XML_TEXT_LENGTH) throw new Error("XML attribute value exceeds 8,192 characters.");
    index += 1;
    count += 1;
    if (count > MAX_XML_ATTRIBUTES_PER_ELEMENT) throw new Error("XML element exceeds 64 attributes.");
  }
  return count;
}

function countTextNode(value: string, count: () => void): void {
  if (!value) return;
  if (value.length > MAX_XML_TEXT_LENGTH) throw new Error("XML text node exceeds 8,192 characters.");
  count();
}

function addAllocation(current: number, amount = 1): number {
  const next = current + amount;
  if (next > MAX_XML_NODES_AND_ATTRIBUTES) throw new Error("XML node and attribute limit exceeded.");
  return next;
}

/**
 * Enforces the format-specific namespace allowlist after parsing. Namespace
 * extensions are rejected instead of being ignored, so foreign lookalikes can
 * never accompany an otherwise valid record and disappear during mapping.
 */
export function assertXmlElementNamespaces(document: Document, allowedNamespaces: readonly string[]): void {
  const allowed = new Set(allowedNamespaces);
  for (const element of Array.from(document.getElementsByTagName("*"))) {
    if (!allowed.has(element.namespaceURI ?? "")) {
      throw new Error("XML contains an element from a namespace that is not accepted for this format.");
    }
    for (const attribute of Array.from(element.attributes)) {
      const namespace = attribute.namespaceURI ?? "";
      if (namespace && namespace !== "http://www.w3.org/2000/xmlns/" && namespace !== "http://www.w3.org/XML/1998/namespace" && !allowed.has(namespace)) {
        throw new Error("XML contains an attribute from a namespace that is not accepted for this format.");
      }
    }
  }
}

function requiredTerminator(text: string, token: string, start: number, label: string): number {
  const end = text.indexOf(token, start);
  if (end === -1) throw new Error(`${label} is not terminated.`);
  return end;
}

function tagEnd(text: string, start: number): number {
  let quote = "";
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  throw new Error("XML tag is not terminated.");
}

function xmlName(value: string): boolean {
  // Every accepted interchange vocabulary uses ASCII XML names. Rejecting
  // anything else keeps this pre-parser deliberately small and fail-closed.
  return value.length <= 256 && /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value);
}
