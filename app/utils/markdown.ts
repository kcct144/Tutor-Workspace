function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderMarkdown(markdown: string) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let skippedDocumentTitle = false;

  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = null;
  };
  const openList = (type: "ul" | "ol") => {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (
      line.startsWith("|") &&
      index + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")
    ) {
      closeList();
      const headers = line.split("|").slice(1, -1);
      html.push(
        `<table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell.trim())}</th>`).join("")}</tr></thead><tbody>`,
      );
      index += 2;
      while (index < lines.length && (lines[index] ?? "").startsWith("|")) {
        const cells = (lines[index] ?? "").split("|").slice(1, -1);
        html.push(
          `<tr>${cells.map((cell) => `<td>${renderInline(cell.trim())}</td>`).join("")}</tr>`,
        );
        index += 1;
      }
      html.push("</tbody></table>");
      index -= 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1]?.length ?? 1;
      if (level === 1 && !skippedDocumentTitle) {
        skippedDocumentTitle = true;
        continue;
      }
      html.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      openList("ul");
      const checkbox = unordered[1]?.match(/^\[([ xX])\]\s+(.+)$/);
      if (checkbox) {
        const checked = checkbox[1]?.toLowerCase() === "x";
        html.push(
          `<li class="plan-check-item"><span class="plan-check ${checked ? "checked" : ""}">${checked ? "✓" : ""}</span>${renderInline(checkbox[2] ?? "")}</li>`,
        );
      } else {
        html.push(`<li>${renderInline(unordered[1] ?? "")}</li>`);
      }
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${renderInline(ordered[1] ?? "")}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();
  return html.join("");
}
