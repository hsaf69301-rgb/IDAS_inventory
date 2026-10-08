import { toCsv } from './export';

const report = { title: 'T', columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], rows: [] as any[] };

describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    const csv = toCsv({ ...report, rows: [{ a: 'x,y', b: 'say "hi"\nnow' }] });
    expect(csv).toContain('"x,y"');
    expect(csv).toContain('"say ""hi""\nnow"');
  });
  it('neutralises spreadsheet formula injection', () => {
    const csv = toCsv({ ...report, rows: [{ a: '=HYPERLINK("http://evil")', b: '+1+1' }, { a: '@SUM(A1)', b: '-2' }] });
    const body = csv.split('\r\n').slice(1).join('\n');
    for (const line of body.split('\n')) expect(line.startsWith("'") || line.startsWith('"\'')).toBe(true);
  });
  it('includes headers', () => { expect(toCsv(report)).toContain('A,B'); });
});
