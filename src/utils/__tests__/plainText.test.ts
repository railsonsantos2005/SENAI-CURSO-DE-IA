import { describe, expect, it } from 'vitest';
import { countMarkdownTokens, toPlainText } from '../plainText';

describe('plainText (respostas em texto simples)', () => {
  it('remove negrito e títulos Markdown', () => {
    const raw = '## Título\n\nIsto é **importante** e isso __também__.';
    const plain = toPlainText(raw);

    expect(plain).not.toContain('##');
    expect(plain).not.toContain('**');
    expect(plain).toContain('Título');
    expect(plain).toContain('importante');
    expect(plain).toContain('também');
  });

  it('remove crases (código inline e cercas de código)', () => {
    const plain = toPlainText('Use `npm run dev`:\n```js\nconst x = 1;\n```');

    expect(plain).not.toContain('`');
    expect(plain).toContain('npm run dev');
    expect(plain).toContain('const x = 1;');
  });

  it('converte links para o texto e marcadores em bullets', () => {
    const plain = toPlainText('[site](https://exemplo.com)\n- item');

    expect(plain).not.toContain('http');
    expect(plain).toContain('site');
    expect(plain).toContain('• item');
    expect(plain).not.toMatch(/^\s*[-*+]\s/m);
  });

  it('preserva parágrafos e quebras de linha', () => {
    const plain = toPlainText('Primeiro parágrafo.\n\nSegundo parágrafo.');
    expect(plain).toBe('Primeiro parágrafo.\n\nSegundo parágrafo.');
  });

  it('resposta normalizada tem zero tokens Markdown; o bruto, não', () => {
    const raw = '## Resposta\n\nVeja **isso** e `isso`:\n```ts\ncode\n```\n- item';
    const plain = toPlainText(raw);

    expect(countMarkdownTokens(plain)).toBe(0);
    expect(countMarkdownTokens(raw)).toBeGreaterThan(0);
  });
});
