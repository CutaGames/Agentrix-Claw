/**
 * Multi-Agent Collaboration v1 — `[sub-task #<id>]` markdown anchor plugin.
 *
 * Spec: multi-agent-collaboration-2026-06 W2.7
 * Design: §3.2 (sub-task anchor format) + §4.4 (chat surface integration)
 *
 * Recognized syntax (case-insensitive):
 *   [sub-task #abc12345]
 *   [sub-task #abc12345-def0-...]
 *
 * The plugin transforms each occurrence into a clickable inline element
 * (rendered by ReactMarkdown's `a` component) that, on click, dispatches
 *   window event 'agentrix:scroll-to-sub-task' with detail = { subTaskId }
 * so the host (TaskTimeline / TaskWorkbenchPanel) can scroll the matching
 * row into view.
 *
 * Implementation note: written as a remark plugin operating on `text`
 * nodes; produces `link` nodes with a custom URL scheme `subtask:<id>`.
 * MessageBubble's MarkdownSegment then catches the `subtask:` href in its
 * `a` component override and turns it into a button.
 */

import type { Root, RootContent, Text, Link, Parent } from "mdast";
import type { Plugin } from "unified";

export const SUB_TASK_ANCHOR_RE = /\[\s*sub-task\s+#\s*([a-zA-Z0-9_-]{6,64})\s*\]/g;

export const subTaskAnchorPlugin: Plugin<[], Root> = () => {
  return (tree) => {
    visitTextNodes(tree, (textNode, parent, index) => {
      if (!parent || index === undefined) return;
      const matches = [...textNode.value.matchAll(SUB_TASK_ANCHOR_RE)];
      if (matches.length === 0) return;

      const replacements: RootContent[] = [];
      let cursor = 0;
      for (const m of matches) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (start > cursor) {
          replacements.push({
            type: "text",
            value: textNode.value.slice(cursor, start),
          } as Text);
        }
        const subTaskId = m[1];
        replacements.push({
          type: "link",
          url: `subtask:${subTaskId}`,
          title: `sub-task #${subTaskId}`,
          children: [
            { type: "text", value: `sub-task #${subTaskId.slice(0, 8)}` } as Text,
          ],
        } as Link);
        cursor = end;
      }
      if (cursor < textNode.value.length) {
        replacements.push({
          type: "text",
          value: textNode.value.slice(cursor),
        } as Text);
      }

      // Splice replacements into parent.children at position `index`.
      const parentNode = parent as Parent;
      parentNode.children.splice(index, 1, ...replacements);
    });
  };
};

/**
 * Tiny visitor over text nodes — avoids pulling in `unist-util-visit`
 * to keep the plugin standalone and bundle small.
 */
function visitTextNodes(
  tree: Root,
  fn: (node: Text, parent: Parent | null, index: number | undefined) => void,
): void {
  const stack: Array<{ node: Parent; parent: Parent | null }> = [{ node: tree, parent: null }];
  while (stack.length > 0) {
    const { node } = stack.pop()!;
    const children = (node.children ?? []) as RootContent[];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.type === "text") {
        fn(child as Text, node, i);
      } else if ("children" in child && Array.isArray((child as Parent).children)) {
        stack.push({ node: child as Parent, parent: node });
      }
    }
  }
}

/**
 * Helper for the host: dispatch the scroll-to event from the link click.
 * Use as the `onClick` handler in MessageBubble's `a` override when the
 * href starts with `subtask:`.
 */
export function dispatchSubTaskAnchor(href: string): boolean {
  if (typeof window === "undefined") return false;
  if (!href.startsWith("subtask:")) return false;
  const subTaskId = href.slice("subtask:".length).trim();
  if (!subTaskId) return false;
  window.dispatchEvent(
    new CustomEvent("agentrix:scroll-to-sub-task", {
      detail: { subTaskId },
    }),
  );
  return true;
}
