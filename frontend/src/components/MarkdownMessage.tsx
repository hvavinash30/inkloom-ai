import type { ReactNode } from 'react';

type Block =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function inlineNodes(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(INLINE_PATTERN);
  parts.forEach((part, index) => {
    if (!part) return;
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink-900">
          {part.slice(2, -2)}
        </strong>
      );
      return;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-ink-100 px-1 py-0.5 font-mono text-[0.85em] text-ink-800"
        >
          {part.slice(1, -1)}
        </code>
      );
      return;
    }
    nodes.push(part);
  });
  return nodes;
}

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Extract<Block, { type: 'list' }> | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      continue;
    }

    const bullet = trimmed.match(/^[•\-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (list && !list.ordered) list.items.push(bullet[1]);
      else {
        flushList();
        list = { type: 'list', ordered: false, items: [bullet[1]] };
      }
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (list && list.ordered) list.items.push(numbered[1]);
      else {
        flushList();
        list = { type: 'list', ordered: true, items: [numbered[1]] };
      }
      continue;
    }

    flushList();
    paragraph.push(line.trimEnd());
  }

  flushParagraph();
  flushList();
  return blocks;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-[15px] font-bold leading-6 text-ink-900',
  2: 'text-sm font-semibold leading-6 text-ink-900',
  3: 'text-[13px] font-semibold leading-5 text-ink-800',
};

export function MarkdownMessage({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={`min-w-0 break-words ${className || ''}`}>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'heading') {
          return (
            <p
              key={blockIndex}
              className={`${HEADING_CLASS[block.level] || HEADING_CLASS[3]} ${blockIndex > 0 ? 'mt-2.5' : ''}`}
            >
              {inlineNodes(block.text, `h-${blockIndex}`)}
            </p>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={blockIndex}
              className={`${blockIndex > 0 ? 'mt-2.5' : ''} space-y-1 pl-4 ${
                block.ordered ? 'list-decimal' : 'list-disc'
              } marker:text-ink-400`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-0.5 leading-6">
                  {inlineNodes(item, `l-${blockIndex}-${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={blockIndex} className={blockIndex > 0 ? 'mt-2.5 leading-6' : 'leading-6'}>
            {block.lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {inlineNodes(line, `p-${blockIndex}-${lineIndex}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
