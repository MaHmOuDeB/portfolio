// src/lib/facts/types.ts (the facts contract; frozen: change it deliberately, with the fixture and the contract test)
export type SourceId = 'retention' | 'retail' | 'weather' | 'pulse';
export const SOURCE_IDS: readonly SourceId[] = ['retention', 'retail', 'weather', 'pulse'];
export type Unit = 'count' | 'share' | 'pp' | 'gbp' | 'decimal' | 'kmh' | 'minutes' | 'date';
export type FactDef = { id: string; value: number | string; unit: Unit; decimals: number; label: string;
  source: SourceId | 'profile'; from: string; suffix?: '+'; scale?: 'k' | 'M' };
