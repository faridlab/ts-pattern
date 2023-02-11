/**
 * @module
 * @private
 * @internal
 */

import * as symbols from './symbols';
import { SelectionType } from '../types/FindSelected';
import { Pattern, Matcher, MatcherType } from '../types/Pattern';

// @internal
export const isObject = (value: unknown): value is Object =>
  Boolean(value && typeof value === 'object');

//   @internal
export const isMatcher = (
  x: unknown
): x is Matcher<unknown, unknown, MatcherType, SelectionType> => {
  const pattern = x as Matcher<unknown, unknown, MatcherType, SelectionType>;
  return pattern && !!pattern[symbols.matcher];
};

// @internal
const isOptionalPattern = (
  x: unknown
): x is Matcher<unknown, unknown, 'optional', SelectionType> => {
  return isMatcher(x) && x[symbols.matcher]().matcherType === 'optional';
};

// tells us if the value matches a given pattern.
// @internal
export const matchPattern = (
  pattern: any,
  value: any,
  select: (key: string, value: unknown) => void
): boolean => {
  if (isObject(pattern)) {
    if (isMatcher(pattern)) {
      const matcher = pattern[symbols.matcher]();
      const { matched, selections } = matcher.match(value);
      if (matched && selections) {
        Object.keys(selections).forEach((key) => select(key, selections[key]));
      }
      return matched;
    }

    if (!isObject(value)) return false;

    if (Array.isArray(pattern)) {
      if (!Array.isArray(value)) return false;
      // Tuple pattern
      return pattern.length === value.length
        ? pattern.every((subPattern, i) =>
            matchPattern(subPattern, value[i], select)
          )
        : false;
    }

    return Object.keys(pattern).every((k: string): boolean => {
      // @ts-ignore
      const subPattern = pattern[k];

      return (
        (k in value || isOptionalPattern(subPattern)) &&
        matchPattern(
          subPattern,
          // @ts-ignore
          value[k],
          select
        )
      );
    });
  }

  return Object.is(value, pattern);
};

// @internal
export const getSelectionKeys = (pattern: any): string[] => {
  if (isObject(pattern)) {
    if (isMatcher(pattern)) {
      return pattern[symbols.matcher]().getSelectionKeys?.() ?? [];
    }
    if (Array.isArray(pattern)) return flatMap(pattern, getSelectionKeys);
    return flatMap(Object.values(pattern), getSelectionKeys);
  }
  return [];
};

// @internal
export const flatMap = <a, b>(
  xs: readonly a[],
  f: (v: a) => readonly b[]
): b[] => xs.reduce<b[]>((acc, p) => acc.concat(f(p)), []);
