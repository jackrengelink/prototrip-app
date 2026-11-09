/**
 * Tiny, safe Markdown renderer. It builds React elements directly (never HTML
 * strings), so content written by organizers can't inject scripts.
 *
 * Supports: headings, paragraphs, bold, italic, inline code, links, bare URLs,
 * bullet / numbered lists, checklists (- [ ] item), quotes and horizontal rules.
 */
import { Fragment, type ReactNode, useCallback, useState } from 'react';
import { readJson, writeJson } from './storage';

function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^www\./i.test(u)) return `https://${u}`;
  return null;
}

const INLINE_RE =
  /(\*\*([^*]+?)\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))|(`([^`]+)`)|(\*([^*\s](?:[^*]*[^*\s])?)\*)|(\b_([^_\s](?:[^_]*[^_\s])?)_\b)|((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/g;

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  const re = new RegExp(INLINE_RE.source, 'g');
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) out.push(<strong key={key}>{renderInline(m[2], key)}</strong>);
    else if (m[3]) {
      const href = safeHref(m[5]);
      out.push(
        href ? (
          <a key={key} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
            {renderInline(m[4], key)}
          </a>
        ) : (
          <Fragment key={key}>{m[4]}</Fragment>
        ),
      );
    } else if (m[6]) out.push(<code key={key}>{m[7]}</code>);
    else if (m[8]) out.push(<em key={key}>{renderInline(m[9], key)}</em>);
    else if (m[10]) out.push(<em key={key}>{renderInline(m[11], key)}</em>);
    else if (m[12]) {
      const href = safeHref(m[12]);
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {m[12].replace(/^https?:\/\//, '')}
          </a>
        ) : (
          m[12]
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { type: 'h'; level: number; text: string }
  | { type: 'p'; lines: string[] }
  | { type: 'hr' }
  | { type: 'quote'; lines: string[] }
  | { type: 'ul'; items: { text: string; check?: boolean; index?: number }[] }
  | { type: 'ol'; items: string[] };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let checkIndex = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    const h = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ type: 'h', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    if (trimmed.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        q.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: q });
      continue;
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: { text: string; check?: boolean; index?: number }[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
        const c = itemText.match(/^\[([ xX])\]\s*(.*)$/);
        if (c) items.push({ text: c[2], check: c[1].toLowerCase() === 'x', index: checkIndex++ });
        else items.push({ text: itemText });
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    const p: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|>|[-*+]\s|\d+[.)]\s|-{3,}$|\*{3,}$)/.test(lines[i].trim())
    ) {
      p.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'p', lines: p });
  }
  return blocks;
}

export function countChecklistItems(src: string): number {
  return parseBlocks(src).reduce((n, b) => n + (b.type === 'ul' ? b.items.filter((x) => x.check !== undefined).length : 0), 0);
}

interface MarkdownProps {
  source: string | undefined;
  /** When set, checklist items can be ticked and are remembered on this device. */
  checklistKey?: string;
  /** Checklist state owned by the parent (so it can offer a reset button). */
  checklist?: ReturnType<typeof useChecklist>;
  className?: string;
}

export function useChecklist(checklistKey: string | undefined) {
  const storageKey = checklistKey ? `check.${checklistKey}` : '';
  const [state, setState] = useState<Record<string, boolean>>(() => (storageKey ? readJson(storageKey, {}) : {}));
  const toggle = useCallback(
    (index: number, value: boolean) => {
      setState((prev) => {
        const next = { ...prev, [index]: value };
        if (storageKey) writeJson(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );
  const reset = useCallback(() => {
    setState({});
    if (storageKey) writeJson(storageKey, null);
  }, [storageKey]);
  return { state, toggle, reset };
}

export function Markdown({ source, checklistKey, checklist, className }: MarkdownProps) {
  const internal = useChecklist(checklist ? undefined : checklistKey);
  const { state, toggle } = checklist ?? internal;
  const interactive = !!checklist || !!checklistKey;
  if (!source?.trim()) return null;
  const blocks = parseBlocks(source);
  return (
    <div className={`md ${className ?? ''}`}>
      {blocks.map((b, bi) => {
        const key = `b${bi}`;
        switch (b.type) {
          case 'h': {
            const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[b.level - 1];
            return <Tag key={key}>{renderInline(b.text, key)}</Tag>;
          }
          case 'hr':
            return <hr key={key} />;
          case 'quote':
            return (
              <blockquote key={key}>
                {b.lines.map((l, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {renderInline(l, `${key}-${li}`)}
                  </Fragment>
                ))}
              </blockquote>
            );
          case 'ol':
            return (
              <ol key={key}>
                {b.items.map((it, ii) => (
                  <li key={ii}>{renderInline(it, `${key}-${ii}`)}</li>
                ))}
              </ol>
            );
          case 'ul': {
            const isChecklist = b.items.some((x) => x.check !== undefined);
            return (
              <ul key={key} className={isChecklist ? 'checklist' : undefined}>
                {b.items.map((it, ii) => {
                  if (it.check === undefined || it.index === undefined) {
                    return <li key={ii}>{renderInline(it.text, `${key}-${ii}`)}</li>;
                  }
                  const idx = it.index;
                  const checked = state[idx] ?? it.check;
                  return (
                    <li key={ii} className={checked ? 'checked' : undefined}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!interactive}
                          onChange={(e) => toggle(idx, e.target.checked)}
                        />
                        <span>{renderInline(it.text, `${key}-${ii}`)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            );
          }
          case 'p':
            return (
              <p key={key}>
                {b.lines.map((l, li) => (
                  <Fragment key={li}>
                    {li > 0 && <br />}
                    {renderInline(l, `${key}-${li}`)}
                  </Fragment>
                ))}
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
