import { modelLabel } from './ai-score-card';
import { validateCsv } from './import-leads-dialog';

describe('modelLabel', () => {
  it('names the rules scorer and humanises model names', () => {
    expect(modelLabel('rules-v1')).toBe('built-in rules');
    expect(modelLabel('gpt-4o-mini')).toBe('GPT-4o mini');
  });
});

describe('validateCsv', () => {
  it('accepts small CSV files and rejects others with friendly messages', () => {
    expect(validateCsv(new File(['a,b\n1,2'], 'leads.csv', { type: 'text/csv' }))).toBeNull();
    expect(validateCsv(new File(['x'], 'leads.xlsx'))).toMatch(/CSV file/);
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.csv', { type: 'text/csv' });
    expect(validateCsv(big)).toMatch(/larger than 2 MB/);
  });
});
