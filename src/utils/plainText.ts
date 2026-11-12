/**
 * Normaliza respostas do LLM para texto simples exibido pelo app.
 *
 * O backend já pede texto sem Markdown (campo `system` em server/index.js);
 * aqui garantimos que, mesmo se o modelo voltar com sintaxe Markdown, a UI
 * nunca mostre `**`, `##` ou crases.
 */

export function toPlainText(text: string): string {
  return text
    // cercas de código: preserva o conteúdo, remove ```lang
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    // títulos: "## Título" -> "Título"
    .replace(/^\s{0,3}#{1,6}[ \t]+/gm, '')
    // negrito/ênfase
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    // código inline: `x` -> x
    .replace(/`([^`\n]+)`/g, '$1')
    // links: [texto](url) -> texto
    .replace(/\[([^\]]+)\]\([^)\n]*\)/g, '$1')
    // citação: "> texto" -> "texto"
    .replace(/^\s{0,3}>[ \t]?/gm, '')
    // listas com marcador: "- item" -> "• item" (sem sintaxe Markdown)
    .replace(/^(\s*)[-*+][ \t]+/gm, '$1• ')
    .trim();
}

/** Conta ocorrências de sintaxe Markdown (usado para auditar respostas). */
export function countMarkdownTokens(text: string): number {
  const patterns = [
    /```/g, // cercas de código
    /`/g, // crases soltas
    /\*\*/g, // negrito
    /__/g, // negrito alternativo
    /~~/g, // riscado
    /^\s{0,3}#{1,6}[ \t]+/gm, // títulos
    /\[[^\]]+\]\([^)\n]*\)/g, // links
    /^(\s*)[-*+][ \t]+/gm, // listas com marcador
  ];

  let total = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}
