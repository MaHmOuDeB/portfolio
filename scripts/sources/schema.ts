// Validates a site export (data/sources/*.json, data/facts/profile.json) against its JSON schema.
// Each schema is compiled once, in strict mode, so a malformed schema fails loudly here.
import { readFileSync } from 'node:fs';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { SOURCE_IDS } from '../../src/lib/facts/types.ts';
import type { SourceId } from '../../src/lib/facts/types.ts';

export { SOURCE_IDS };
export type { SourceId };

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

type SchemaId = `${SourceId}/1` | 'profile/1';

const NAMES: readonly (SourceId | 'profile')[] = [...SOURCE_IDS, 'profile'];

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validators = new Map<string, ValidateFunction>();
for (const name of NAMES) {
  const url = new URL(`../../data/schemas/${name}-1.schema.json`, import.meta.url);
  validators.set(`${name}/1`, ajv.compile(JSON.parse(readFileSync(url, 'utf8'))));
}

// "<instancePath> <message>", naming the offending property where ajv reports it separately.
function describe(e: ErrorObject): string {
  const params = e.params as { additionalProperty?: string; propertyName?: string };
  const named = params.additionalProperty ?? params.propertyName;
  return `${e.instancePath} ${e.message ?? e.keyword}${named === undefined ? '' : ` '${named}'`}`;
}

export function validateExport(json: unknown, schema: SchemaId): ValidationResult {
  const validate = validators.get(schema);
  if (!validate) throw new Error(`unknown schema ${schema}`);
  if (validate(json)) return { ok: true };
  return { ok: false, errors: (validate.errors ?? []).map(describe) };
}
