import * as pdfjsLib from 'pdfjs-dist';

// Vite: cria o worker manualmente via `new Worker(new URL(...), { type: 'module' })`,
// que é a forma suportada pelo bundler. Define em GlobalWorkerOptions.workerPort
// para que o pdfjs use esse worker em vez de tentar carregar dinamicamente.
pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
  new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
  { type: 'module' },
);

/**
 * Extrai o texto de um arquivo PDF no navegador, retornando uma string
 * com o conteúdo de todas as páginas concatenadas.
 */
export async function extractPdfText(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str?: string }>)
      .map((item) => (typeof item.str === 'string' ? item.str : ''))
      .join(' ');
    pages.push(text.trim());
  }

  return pages.filter(Boolean).join('\n\n');
}