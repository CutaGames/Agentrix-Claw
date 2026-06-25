import { SlidesService } from './slides.service';

describe('SlidesService', () => {
  const svc = new SlidesService();

  it('renders Marp markdown with title + section + closing', () => {
    const r = svc.generate({
      title: 'Agentrix Q3 Roadmap',
      subtitle: 'AI Agent Economy',
      author: 'CEO',
      sections: [
        { heading: 'Vision', bullets: ['Open agent economy', 'X402 payments'] },
        { heading: 'Milestones', body: 'Three pillars', bullets: ['Sandbox', 'Slides', 'Desktop'] },
      ],
      theme: 'gaia',
    });

    expect(r.slideCount).toBe(4); // title + 2 body + closing
    expect(r.theme).toBe('gaia');
    expect(r.markdown).toContain('marp: true');
    expect(r.markdown).toContain('theme: gaia');
    expect(r.markdown).toContain('# Agentrix Q3 Roadmap');
    expect(r.markdown).toContain('## Vision');
    expect(r.markdown).toContain('- Open agent economy');
    expect(r.markdown).toContain('## Milestones');
    expect(r.markdown).toContain('Three pillars');
    expect(r.markdown).toContain('## Thank You');
    expect(r.previewHtml).toContain('<title>Agentrix Q3 Roadmap</title>');
    expect(r.previewHtml).toContain('<li>Open agent economy</li>');
  });

  it('throws on missing title', () => {
    expect(() => svc.generate({ title: '', sections: [{ heading: 'x' }] })).toThrow(/title/);
  });

  it('throws on missing sections', () => {
    expect(() => svc.generate({ title: 'x', sections: [] })).toThrow(/section/);
  });

  it('escapes -- in speaker notes', () => {
    const r = svc.generate({
      title: 't',
      sections: [{ heading: 'h', notes: 'has -- inside' }],
    });
    expect(r.markdown).toContain('<!-- has – inside -->');
  });
});
