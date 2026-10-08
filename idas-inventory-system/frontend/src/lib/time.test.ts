import { addDays, labParts, mondayOf, zonedToUtcIso } from './time';

describe('lab time helpers', () => {
  it('converts lab-local (Asia/Colombo, UTC+5:30) wall time to UTC', () => {
    expect(zonedToUtcIso('2030-01-07', '10:00')).toBe('2030-01-07T04:30:00.000Z');
    expect(zonedToUtcIso('2030-01-07', '02:00')).toBe('2030-01-06T20:30:00.000Z');
  });
  it('round-trips through labParts', () => {
    const iso = zonedToUtcIso('2030-03-15', '13:45');
    expect(labParts(iso)).toMatchObject({ date: '2030-03-15', time: '13:45' });
  });
  it('finds the Monday of a week and adds days', () => {
    expect(mondayOf('2030-01-10')).toBe('2030-01-07'); // Thursday → Monday
    expect(mondayOf('2030-01-07')).toBe('2030-01-07');
    expect(mondayOf('2030-01-13')).toBe('2030-01-07'); // Sunday → previous Monday
    expect(addDays('2030-01-31', 1)).toBe('2030-02-01');
  });
});
