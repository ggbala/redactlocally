import type { TextSpanReplacement } from '../../core/placeholder';

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

function isWordElement(node: Node, localName: string): node is Element {
  if (node.nodeType !== 1) {
    return false;
  }
  const el = node as Element;
  return el.localName === localName || el.nodeName === `w:${localName}`;
}

/**
 * Collects ordered <w:t> elements belonging directly to a <w:p> paragraph
 * without bleeding into nested <w:p> (e.g. text boxes) or deleted track-changes (<w:del>).
 */
function collectParagraphTextNodes(paragraph: Element): Element[] {
  const textNodes: Element[] = [];

  const walk = (node: Node) => {
    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
      if (child.nodeType !== 1) {
        continue;
      }
      const el = child as Element;
      // Stop descending at nested paragraphs or deleted tracked text
      if (isWordElement(el, 'p') || isWordElement(el, 'del')) {
        continue;
      }
      if (isWordElement(el, 't')) {
        textNodes.push(el);
        continue;
      }
      walk(el);
    }
  };

  walk(paragraph);
  return textNodes;
}

/**
 * Finds all <w:p> elements across the XML document (body, tables, headers, footers, text boxes).
 */
export function getParagraphElements(doc: Document): Element[] {
  const paragraphs: Element[] = [];
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (isWordElement(el, 'p')) {
      paragraphs.push(el);
    }
  }
  return paragraphs;
}

export interface ParsedXmlPart {
  path: string;
  doc: Document;
  paragraphs: Array<{
    element: Element;
    textNodes: Element[];
    fullText: string;
  }>;
}

export function parseDocxXmlPart(path: string, xmlText: string): ParsedXmlPart {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parseError = doc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new Error(`Invalid XML in DOCX part "${path}".`);
  }

  const paragraphs = getParagraphElements(doc).map((element) => {
    const textNodes = collectParagraphTextNodes(element);
    const fullText = textNodes.map((n) => n.textContent ?? '').join('');
    return { element, textNodes, fullText };
  });

  return { path, doc, paragraphs };
}

function ensureXmlSpacePreserve(node: Element, value: string): void {
  if (/^\s|\s$/.test(value)) {
    node.setAttributeNS(XML_NAMESPACE, 'xml:space', 'preserve');
  }
}

/**
 * Applies span replacements across merged <w:r><w:t> runs in reverse offset order
 * so split formatted entities (e.g. bold "alice" + regular "@acme.com") are caught
 * and replaced cleanly without breaking XML structure or run styling.
 */
export function applySpansToParagraphNodes(
  textNodes: readonly Element[],
  spans: readonly TextSpanReplacement[],
): boolean {
  if (textNodes.length === 0 || spans.length === 0) {
    return false;
  }

  const segments: Array<{ node: Element; start: number; end: number }> = [];
  let offset = 0;

  for (const node of textNodes) {
    const len = (node.textContent ?? '').length;
    segments.push({ node, start: offset, end: offset + len });
    offset += len;
  }

  for (let s = spans.length - 1; s >= 0; s--) {
    const { start: repStart, end: repEnd, replacement } = spans[s];
    const overlapping = segments.filter(
      (seg) => seg.start < repEnd && repStart < seg.end,
    );
    if (overlapping.length === 0) {
      continue;
    }

    const first = overlapping[0];
    const last = overlapping[overlapping.length - 1];

    if (first.node === last.node) {
      const current = first.node.textContent ?? '';
      const localStart = repStart - first.start;
      const localEnd = repEnd - first.start;
      const updated =
        current.slice(0, localStart) + replacement + current.slice(localEnd);
      first.node.textContent = updated;
      ensureXmlSpacePreserve(first.node, updated);
    } else {
      const firstCurrent = first.node.textContent ?? '';
      const lastCurrent = last.node.textContent ?? '';
      const localStart = repStart - first.start;
      const localEnd = repEnd - last.start;

      const updatedFirst = firstCurrent.slice(0, localStart) + replacement;
      first.node.textContent = updatedFirst;
      ensureXmlSpacePreserve(first.node, updatedFirst);

      for (let k = 1; k < overlapping.length - 1; k++) {
        overlapping[k].node.textContent = '';
      }

      const updatedLast = lastCurrent.slice(localEnd);
      last.node.textContent = updatedLast;
      ensureXmlSpacePreserve(last.node, updatedLast);
    }
  }

  return true;
}

export function serializeDocxXml(doc: Document): string {
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

const CORE_METADATA_TAGS = new Set([
  'creator',
  'lastModifiedBy',
  'title',
  'subject',
  'description',
  'keywords',
  'category',
]);

const APP_METADATA_TAGS = new Set(['Company', 'Manager']);

/**
 * Clears sensitive document author/company metadata fields in docProps/core.xml or docProps/app.xml.
 */
export function stripMetadataXml(
  xmlText: string,
  kind: 'core' | 'app',
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return xmlText;
  }

  const targetTags = kind === 'core' ? CORE_METADATA_TAGS : APP_METADATA_TAGS;
  const all = doc.getElementsByTagName('*');

  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (targetTags.has(el.localName)) {
      el.textContent = '';
    }
  }

  return serializeDocxXml(doc);
}
