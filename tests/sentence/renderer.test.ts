import { describe, expect, it } from 'vitest';
import {
  SentenceRenderer,
  splitTranslation,
} from '@/src/modules/sentence/SentenceRenderer';
import {
  flattenBlock,
  splitSentences,
} from '@/src/modules/sentence/segmentation';
import { analysis, setBody, token } from './fixtures';

function targetsFor(block: Element) {
  return splitSentences(flattenBlock(block).text, 'en').map((slice) => ({
    block,
    ...slice,
  }));
}

const swedish = analysis('Läs hela guiden idag.', [
  token('Läs', 'läsa'),
  token('hela'),
  token('guiden', 'guide'),
  token('idag'),
]);

describe('SentenceRenderer', () => {
  it('replaces a sentence that spans a link and bold text', () => {
    setBody(
      '<p id="p">Read the <a href="#">full <b>guide</b></a> today. It really helps.</p>',
    );
    const block = document.getElementById('p')!;
    const [first] = targetsFor(block);
    const renderer = new SentenceRenderer('sv');

    const rendered = renderer.render(first, swedish, ['guide'])!;

    expect(rendered).not.toBeNull();
    expect(rendered.translation.textContent).toBe('Läs hela guiden idag.');
    expect(rendered.translation.lang).toBe('sv');
    expect(
      [...rendered.translation.querySelectorAll('.illa-sw')].map(
        (w) => w.textContent,
      ),
    ).toEqual(['Läs', 'hela', 'guiden', 'idag']);
    expect(rendered.originals.map((o) => o.textContent)).toEqual([
      'Read the ',
      'full ',
      'guide',
      ' today.',
    ]);
    // The link and bold elements are kept in place, not cloned or moved
    expect(block.querySelectorAll('a').length).toBe(1);
    expect(block.querySelector('a b .illa-so')?.textContent).toBe('guide');
    // The second sentence is untouched
    expect(block.lastChild?.textContent).toBe(' It really helps.');
  });

  it('restores the exact original DOM, reusing the original text nodes', () => {
    setBody(
      '<p id="p">Read the <a href="#">full <b>guide</b></a> today. It really helps a lot.</p>',
    );
    const block = document.getElementById('p')!;
    const originalHtml = block.innerHTML;
    const firstText = block.firstChild as Text;
    const lastText = block.lastChild as Text;
    const renderer = new SentenceRenderer('sv');

    for (const target of targetsFor(block)) {
      renderer.render(target, swedish, []);
    }
    expect(block.querySelectorAll('.illa-st').length).toBe(2);

    renderer.restoreAll();

    expect(block.innerHTML).toBe(originalHtml);
    expect(block.firstChild).toBe(firstText);
    expect(block.lastChild).toBe(lastText);
    expect(block.childNodes.length).toBe(3);
    expect(document.getElementById('illa-sentence-style')).toBeNull();
  });

  it('restores correctly when sentences in one text node render out of order', () => {
    setBody(
      '<p id="p">The first sentence is here. The second one follows it. A third closes the paragraph.</p>',
    );
    const block = document.getElementById('p')!;
    const originalHtml = block.innerHTML;
    const node = block.firstChild;
    const [a, b, c] = targetsFor(block);
    const renderer = new SentenceRenderer('sv');

    expect(renderer.render(c, swedish, [])).not.toBeNull();
    expect(renderer.render(a, swedish, [])).not.toBeNull();
    expect(renderer.render(b, swedish, [])).not.toBeNull();

    // Whitespace between sentences stays visible page text
    const visible = [...block.childNodes]
      .filter((n) => !(n as Element).classList?.contains('illa-so'))
      .map((n) => n.textContent)
      .join('');
    expect(visible).toBe(
      'Läs hela guiden idag. Läs hela guiden idag. Läs hela guiden idag.',
    );

    renderer.restoreAll();
    expect(block.innerHTML).toBe(originalHtml);
    expect(block.firstChild).toBe(node);
    expect(block.childNodes.length).toBe(1);
  });

  it('hoists the translation out of an inline element the sentence fully covers', () => {
    setBody(
      '<p id="p"><a href="#">Click here to open it</a> and wait a moment. Then stop.</p>',
    );
    const block = document.getElementById('p')!;
    const [first] = targetsFor(block);
    const rendered = new SentenceRenderer('sv').render(first, swedish, [])!;

    expect(rendered.translation.parentElement).toBe(block);
    expect(rendered.translation.nextSibling).toBe(block.querySelector('a'));
  });

  it('keeps the translation inside an inline element the sentence only partly covers', () => {
    setBody(
      '<p id="p"><em>Some words come first. Then a long sentence follows</em> here.</p>',
    );
    const block = document.getElementById('p')!;
    const second = targetsFor(block)[1];
    const rendered = new SentenceRenderer('sv').render(second, swedish, [])!;

    expect(rendered.translation.parentElement?.tagName).toBe('EM');
  });

  it('skips rendering when the source text changed', () => {
    setBody('<p id="p">This text will change soon.</p>');
    const block = document.getElementById('p')!;
    const [first] = targetsFor(block);
    (block.firstChild as Text).data = 'Completely different words now.';

    expect(new SentenceRenderer('sv').render(first, swedish, [])).toBeNull();
    expect(block.querySelector('.illa-st')).toBeNull();
  });

  it('toggles reveal classes', () => {
    setBody('<p id="p">Read the guide today please.</p>');
    const block = document.getElementById('p')!;
    const renderer = new SentenceRenderer('sv');
    const rendered = renderer.render(targetsFor(block)[0], swedish, [])!;

    renderer.setRevealed(rendered, true);
    expect(rendered.translation.classList.contains('illa-revealed')).toBe(true);
    expect(rendered.originals[0].classList.contains('illa-revealed')).toBe(
      true,
    );

    renderer.setRevealed(rendered, false);
    expect(rendered.translation.classList.contains('illa-revealed')).toBe(
      false,
    );
    expect(renderer.get(rendered.id)).toBe(rendered);
  });
});

describe('splitTranslation', () => {
  it('locates tokens in order and keeps the text between them', () => {
    const parts = splitTranslation('Jag tyckte inte om det.', [
      token('Jag'),
      token('tyckte', 'tycka om'),
      token('inte'),
      token('om', 'tycka om'),
      token('det'),
    ]);
    expect(parts.map((p) => [p.text, p.tokenIndex])).toEqual([
      ['Jag', 0],
      [' ', undefined],
      ['tyckte', 1],
      [' ', undefined],
      ['inte', 2],
      [' ', undefined],
      ['om', 3],
      [' ', undefined],
      ['det', 4],
      ['.', undefined],
    ]);
  });

  it('matches case-insensitively and skips tokens it cannot find', () => {
    const parts = splitTranslation('Hej världen', [
      token('hej'),
      token('saknas'),
      token('världen'),
    ]);
    expect(parts.map((p) => p.tokenIndex)).toEqual([0, undefined, 2]);
  });
});
