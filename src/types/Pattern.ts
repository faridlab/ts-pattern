import type * as symbols from '../internals/symbols';
import { MergeUnion, Primitives, WithDefault } from './helpers';
import { None, Some, SelectionType } from './FindSelected';
import { matcher } from '../patterns';
import { ExtractPreciseValue } from './ExtractPreciseValue';

export type MatcherType =
  | 'not'
  | 'optional'
  | 'or'
  | 'and'
  | 'array'
  | 'map'
  | 'set'
  | 'select'
  | 'default'
  | 'custom';

// We use a separate MatcherProtocol type to preserves
// the type level information (selections and excluded) used
// only for inference.
export type MatcherProtocol<
  input,
  narrowed,
  // Type of what this pattern selected from the input
  matcherType extends MatcherType,
  selections extends SelectionType,
  // Type to exclude from the input union because
  // it has been fully matched by this pattern
  excluded
> = {
  match: <I>(value: I | input) => MatchResult;
  getSelectionKeys?: () => string[];
  matcherType?: matcherType;
};

export type MatchResult = {
  matched: boolean;
  selections?: Record<string, any>;
};

/**
 * A `Matcher` is an object implementing the match
 * protocol. It must define a `symbols.matcher` property
 * which returns an object with a `match()` method, taking
 * the input value and returning whether the pattern matches
 * or not, along with optional selections.
 */
export interface Matcher<
  input,
  narrowed,
  // Type of what this pattern selected from the input
  matcherType extends MatcherType = 'default',
  selections extends SelectionType = None,
  // Type to exclude from the input union because
  // it has been fully matched by this pattern
  excluded = narrowed
> {
  [matcher](): MatcherProtocol<
    input,
    narrowed,
    matcherType,
    selections,
    excluded
  >;
  // only used for array matchers
  [symbols.isVariadic]?: boolean;
}

type PatternMatcher<input> = Matcher<input, unknown, any, any>;

// We fall back to `a` if we weren't able to extract anything more precise
export type MatchedValue<a, invpattern> = WithDefault<
  ExtractPreciseValue<a, invpattern>,
  a
>;

export type AnyMatcher = Matcher<any, any, any, any, any>;

type UnknownMatcher = PatternMatcher<unknown>;

export type CustomP<input, pattern, narrowedOrFn> = Matcher<
  input,
  pattern,
  //  👆
  // for the input type to be instantiated correctly
  // on subpatterns, it has to be passed through.
  'custom',
  None,
  narrowedOrFn
>;

export type ArrayP<input, p> = Matcher<input, p, 'array'>;

export type OptionalP<input, p> = Matcher<input, p, 'optional'>;

export type MapP<input, pkey, pvalue> = Matcher<input, [pkey, pvalue], 'map'>;

export type SetP<input, p> = Matcher<input, p, 'set'>;

export type AndP<input, ps> = Matcher<input, ps, 'and'>;

export type OrP<input, ps> = Matcher<input, ps, 'or'>;

export type NotP<input, p> = Matcher<input, p, 'not'>;

export type GuardP<input, narrowed> = Matcher<input, narrowed>;

export type GuardExcludeP<input, narrowed, excluded> = Matcher<
  input,
  narrowed,
  'default',
  None,
  excluded
>;

export type SelectP<
  key extends string,
  input = unknown,
  p = Matcher<unknown, unknown>
> = Matcher<input, p, 'select', Some<key>>;

export type AnonymousSelectP = SelectP<symbols.anonymousSelectKey>;

export interface Override<a> {
  [symbols.override]: a;
}

export type UnknownPattern =
  | readonly []
  | readonly [unknown, ...unknown[]]
  | readonly [...unknown[], unknown]
  | { readonly [k: string]: unknown }
  | Primitives
  | UnknownMatcher;

/**
 * `Pattern<a>` is the generic type for patterns matching a value of type `a`. A pattern can be any (nested) javascript value.
 *
 * They can also be wildcards, like `P._`, `P.string`, `P.number`,
 * or other matchers, like `P.when(predicate)`, `P.not(pattern)`, etc.
 *
 * [Read the documentation for `P.Pattern` on GitHub](https://github.com/gvergnaud/ts-pattern#patterns)
 *
 * @example
 * const pattern: P.Pattern<User> = { name: P.string }
 */
export type Pattern<a> = unknown extends a ? UnknownPattern : KnownPattern<a>;

type KnownPattern<a> = KnownPatternInternal<a>;

type KnownPatternInternal<
  a,
  objs = Exclude<a, Primitives | Map<any, any> | Set<any> | readonly any[]>,
  arrays = Extract<a, readonly any[]>,
  primitives = Exclude<a, object>
> =
  | primitives
  | PatternMatcher<a>
  | ([objs] extends [never] ? never : ObjectPattern<Readonly<MergeUnion<objs>>>)
  | ([arrays] extends [never] ? never : ArrayPattern<arrays>);

type ObjectPattern<a> =
  | {
      readonly [k in keyof a]?: Pattern<a[k]>;
    }
  | never;

type ArrayPattern<a> = a extends readonly (infer i)[]
  ? a extends readonly [any, ...any]
    ? { readonly [index in keyof a]: Pattern<a[index]> }
    :
        | readonly []
        | readonly [Pattern<i>, ...Pattern<i>[]]
        | readonly [...Pattern<i>[], Pattern<i>]
  : never;

// These aliases could be inferred, but lead to nicer display names in IDEs.
export type AnyPattern = Chainable<GuardP<unknown, unknown>, never>;
export type StringPattern = StringChainable<GuardP<unknown, string>, never>;
export type NumberPattern = NumberChainable<GuardP<unknown, number>, never>;
export type BooleanPattern = Chainable<GuardP<unknown, boolean>, never>;
export type BigIntPattern = BigIntChainable<GuardP<unknown, bigint>, never>;
export type SymbolPattern = Chainable<GuardP<unknown, symbol>, never>;
export type NullishPattern = Chainable<
  GuardP<unknown, null | undefined>,
  never
>;

type MaybeAnd<omitted, input, p1, p2> = [omitted] extends [never]
  ? p2
  : AndP<input, [p1, p2]>;

export type Chainable<p, omitted extends string = never> = p &
  Omit<
    {
      /**
       * `.optional()` returns a pattern which matches if the
       * key is undefined or if it is defined and the previous pattern matches its value.
       *
       * [Read the documentation for `P.optional` on GitHub](https://github.com/gvergnaud/ts-pattern#Poptional-patterns)
       *
       * @example
       *  match(value)
       *   .with({ greeting: P.string.optional() }, () => 'will match { greeting?: string}')
       */
      optional<input>(): Chainable<OptionalP<input, p>, omitted | 'optional'>;
      /**
       * `pattern.and(pattern)` returns a pattern that matches
       * if the previous pattern and the next one match the input.
       *
       * [Read the documentation for `P.intersection` on GitHub](https://github.com/gvergnaud/ts-pattern#Pintersection-patterns)
       *
       * @example
       *  match(value)
       *   .with(
       *     P.string.and(P.when(isUsername)),
       *     (username) => '...'
       *   )
       */
      and<input, p2 extends Pattern<input>>(
        pattern: p2
      ): Chainable<AndP<input, [p, p2]>, omitted>;
      /**
       * `pattern.or(pattern)` returns a pattern that matches
       * if **either** the previous pattern or the next one match the input.
       *
       * [Read the documentation for `P.union` on GitHub](https://github.com/gvergnaud/ts-pattern#Punion-patterns)
       *
       * @example
       *  match(value)
       *   .with(
       *     { value: P.string.or(P.number) },
       *     ({ value }) => 'value: number | string'
       *   )
       */
      or<input, p2 extends Pattern<input>>(
        pattern: p2
      ): Chainable<OrP<input, [p, p2]>, omitted>;
      /**
       * `P.select()` will inject this property into the handler function's arguments.
       *
       * [Read the documentation for `P.select` on GitHub](https://github.com/gvergnaud/ts-pattern#Pselect-patterns)
       *
       * @example
       *  match<{ age: number }>(value)
       *   .with({ age: P.string.select() }, (age) => 'age: number')
       */
      select<input>(): Chainable<
        SelectP<symbols.anonymousSelectKey, input, p>,
        omitted | 'select' | 'or' | 'and'
      >;
      select<input, k extends string>(
        key: k
      ): Chainable<SelectP<k, input, p>, omitted | 'select' | 'or' | 'and'>;
    },
    omitted
  >;

export type StringChainable<
  p extends Matcher<any, any, any, any, any>,
  omitted extends string = never
> = Chainable<p, omitted> &
  Omit<
    {
      /**
       * `P.string.startsWith(start)` is a pattern, matching **strings** starting with `start`.
       *
       * [Read the documentation for `P.string.startsWith` on GitHub](https://github.com/gvergnaud/ts-pattern#PstringstartsWith)
       *
       * @example
       *  match(value)
       *   .with(P.string.startsWith('A'), () => 'value starts with an A')
       */
      startsWith<input, const start extends string>(
        start: start
      ): StringChainable<
        MaybeAnd<omitted, input, p, GuardP<input, `${start}${string}`>>,
        omitted | 'startsWith'
      >;
      /**
       * `P.string.endsWith(end)` is a pattern, matching **strings** ending with `end`.
       *
       * [Read the documentation for `P.string.endsWith` on GitHub](https://github.com/gvergnaud/ts-pattern#PstringendsWith)
       *
       * @example
       *  match(value)
       *   .with(P.string.endsWith('!'), () => 'value ends with an !')
       */
      endsWith<input, const end extends string>(
        end: end
      ): StringChainable<
        MaybeAnd<omitted, input, p, GuardP<input, `${string}${end}`>>,
        omitted | 'endsWith'
      >;
      /**
       * `P.string.minLength(min)` is a pattern, matching **strings** with at least `min` characters.
       *
       * [Read the documentation for `P.string.minLength` on GitHub](https://github.com/gvergnaud/ts-pattern#PstringminLength)
       *
       * @example
       *  match(value)
       *   .with(P.string.minLength(10), () => 'string with more length <= 10')
       */
      minLength<input, const min extends number>(
        min: min
      ): StringChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, string, never>>,
        omitted | 'minLength'
      >;
      /**
       * `P.string.maxLength(max)` is a pattern, matching **strings** with at most `max` characters.
       *
       * [Read the documentation for `P.string.maxLength` on GitHub](https://github.com/gvergnaud/ts-pattern#PstringmaxLength)
       *
       * @example
       *  match(value)
       *   .with(P.string.maxLength(10), () => 'string with more length >= 10')
       */
      maxLength<input, const max extends number>(
        max: max
      ): StringChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, string, never>>,
        omitted | 'maxLength'
      >;
      /**
       * `P.string.includes(substr)` is a pattern, matching **strings** containing `substr`.
       *
       * [Read the documentation for `P.string.includes` on GitHub](https://github.com/gvergnaud/ts-pattern#Pstringincludes)
       *
       * @example
       *  match(value)
       *   .with(P.string.includes('http'), () => 'value contains http')
       */
      includes<input, const substr extends string>(
        substr: substr
      ): StringChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, string, never>>,
        omitted
      >;
      /**
       * `P.string.regex(expr)` is a pattern, matching **strings** that `expr` regular expression.
       *
       * [Read the documentation for `P.string.regex` on GitHub](https://github.com/gvergnaud/ts-pattern#Pstringregex)
       *
       * @example
       *  match(value)
       *   .with(P.string.regex(/^https?:\/\//), () => 'url')
       */
      regex<input, const expr extends string | RegExp>(
        expr: expr
      ): StringChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, string, never>>,
        omitted
      >;
    },
    omitted
  >;

export type NumberChainable<p, omitted extends string = never> = Chainable<
  p,
  omitted
> &
  Omit<
    {
      /**
       * `P.number.between(min, max)` matches **number** between `min` and `max`,
       * equal to min or equal to max.
       *
       * [Read the documentation for `P.number.between` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberbetween)
       *
       * @example
       *  match(value)
       *   .with(P.number.between(0, 10), () => '0 <= numbers <= 10')
       */
      between<input, const min extends number, const max extends number>(
        min: min,
        max: max
      ): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted
      >;
      /**
       * `P.number.lt(max)` matches **number** smaller than `max`.
       *
       * [Read the documentation for `P.number.lt` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberlt)
       *
       * @example
       *  match(value)
       *   .with(P.number.lt(10), () => 'numbers < 10')
       */
      lt<input, const max extends number>(
        max: max
      ): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted
      >;
      /**
       * `P.number.gt(min)` matches **number** greater than `min`.
       *
       * [Read the documentation for `P.number.gt` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumbergt)
       *
       * @example
       *  match(value)
       *   .with(P.number.gt(10), () => 'numbers > 10')
       */
      gt<input, const min extends number>(
        min: min
      ): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted
      >;
      /**
       * `P.number.lte(max)` matches **number** smaller than or equal to `max`.
       *
       * [Read the documentation for `P.number.lte` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberlte)
       *
       * @example
       *  match(value)
       *   .with(P.number.lte(10), () => 'numbers <= 10')
       */
      lte<input, const max extends number>(
        max: max
      ): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted
      >;
      /**
       * `P.number.gte(min)` matches **number** greater than or equal to `min`.
       *
       * [Read the documentation for `P.number.gte` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumbergte)
       *
       * @example
       *  match(value)
       *   .with(P.number.gte(10), () => 'numbers >= 10')
       */
      gte<input, const min extends number>(
        min: min
      ): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted
      >;
      /**
       * `P.number.int` matches **integer** numbers.
       *
       * [Read the documentation for `P.number.int` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberint)
       *
       * @example
       *  match(value)
       *   .with(P.number.int, () => 'an integer')
       */
      int<input>(): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted | 'int'
      >;
      /**
       * `P.number.finite` matches **finite numbers**.
       *
       * [Read the documentation for `P.number.finite` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberfinite)
       *
       * @example
       *  match(value)
       *   .with(P.number.finite, () => 'not Infinity')
       */
      finite<input>(): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted | 'finite'
      >;
      /**
       * `P.number.positive` matches **positive** numbers.
       *
       * [Read the documentation for `P.number.positive` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberpositive)
       *
       * @example
       *  match(value)
       *   .with(P.number.positive, () => 'number > 0')
       */
      positive<input>(): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted | 'positive' | 'negative'
      >;
      /**
       * `P.number.negative` matches **negative** numbers.
       *
       * [Read the documentation for `P.number.negative` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumbernegative)
       *
       * @example
       *  match(value)
       *   .with(P.number.negative, () => 'number < 0')
       */
      negative<input>(): NumberChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, number, never>>,
        omitted | 'positive' | 'negative' | 'negative'
      >;
    },
    omitted
  >;

export type BigIntChainable<p, omitted extends string = never> = Chainable<
  p,
  omitted
> &
  Omit<
    {
      /**
       * `P.bigint.between(min, max)` matches **bigint** between `min` and `max`,
       * equal to min or equal to max.
       *
       * [Read the documentation for `P.bigint.between` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberbetween)
       *
       * @example
       *  match(value)
       *   .with(P.bigint.between(0, 10), () => '0 <= numbers <= 10')
       */
      between<input, const min extends bigint, const max extends bigint>(
        min: min,
        max: max
      ): BigIntChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, bigint, never>>,
        omitted
      >;
      /**
       * `P.bigint.lt(max)` matches **bigint** smaller than `max`.
       *
       * [Read the documentation for `P.bigint.lt` on GitHub](https://github.com/gvergnaud/ts-pattern#bigintlt)
       *
       * @example
       *  match(value)
       *   .with(P.bigint.lt(10), () => 'numbers < 10')
       */
      lt<input, const max extends bigint>(
        max: max
      ): BigIntChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, bigint, never>>,
        omitted
      >;
      /**
       * `P.bigint.gt(min)` matches **bigint** greater than `min`.
       *
       * [Read the documentation for `P.bigint.gt` on GitHub](https://github.com/gvergnaud/ts-pattern#bigintgt)
       *
       * @example
       *  match(value)
       *   .with(P.bigint.gt(10), () => 'numbers > 10')
       */
      gt<input, const min extends bigint>(
        min: min
      ): BigIntChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, bigint, never>>,
        omitted
      >;
      /**
       * `P.bigint.lte(max)` matches **bigint** smaller than or equal to `max`.
       *
       * [Read the documentation for `P.bigint.lte` on GitHub](https://github.com/gvergnaud/ts-pattern#bigintlte)
       *
       * @example
       *  match(value)
       *   .with(P.bigint.lte(10), () => 'bigints <= 10')
       */
      lte<input, const max extends bigint>(
        max: max
      ): BigIntChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, bigint, never>>,
        omitted
      >;
      /**
       * `P.bigint.gte(min)` matches **bigint** greater than or equal to `min`.
       *
       * [Read the documentation for `P.bigint.gte` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumbergte)
       *
       * @example
       *  match(value)
       *   .with(P.bigint.gte(10), () => 'bigints >= 10')
       */
      gte<input, const min extends bigint>(
        min: min
      ): BigIntChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, bigint, never>>,
        omitted
      >;
      /**
       * `P.bigint.positive` matches **positive** bigints.
       *
       * [Read the documentation for `P.bigint.positive` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumberpositive)
       *
       * @example
       *  match(value)
       *   .with(P.bigint.positive, () => 'bigint > 0')
       */
      positive<input>(): BigIntChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, bigint, never>>,
        omitted | 'positive' | 'negative'
      >;
      /**
       * `P.bigint.negative` matches **negative** bigints.
       *
       * [Read the documentation for `P.bigint.negative` on GitHub](https://github.com/gvergnaud/ts-pattern#Pnumbernegative)
       *
       * @example
       *  match(value)
       *   .with(P.bigint.negative, () => 'bigint < 0')
       */
      negative<input>(): BigIntChainable<
        MaybeAnd<omitted, input, p, GuardExcludeP<input, bigint, never>>,
        omitted | 'positive' | 'negative' | 'negative'
      >;
    },
    omitted
  >;

export type Variadic<pattern> = pattern & Iterable<pattern>;

export type ArrayChainable<
  pattern,
  omitted extends string = never
> = Variadic<pattern> &
  Omit<
    {
      /**
       * `.optional()` returns a pattern which matches if the
       * key is undefined or if it is defined and the previous pattern matches its value.
       *
       * [Read the documentation for `P.optional` on GitHub](https://github.com/gvergnaud/ts-pattern#Poptional-patterns)
       *
       * @example
       *  match(value)
       *   .with({ greeting: P.string.optional() }, () => 'will match { greeting?: string}')
       */
      optional<input>(): ArrayChainable<
        OptionalP<input, pattern>,
        omitted | 'optional'
      >;
      /**
       * `P.select()` will inject this property into the handler function's arguments.
       *
       * [Read the documentation for `P.select` on GitHub](https://github.com/gvergnaud/ts-pattern#Pselect-patterns)
       *
       * @example
       *  match<{ age: number }>(value)
       *   .with({ age: P.string.select() }, (age) => 'age: number')
       */
      select<input>(): ArrayChainable<
        SelectP<symbols.anonymousSelectKey, input, pattern>,
        omitted | 'select'
      >;
      select<input, k extends string>(
        key: k
      ): ArrayChainable<SelectP<k, input, pattern>, omitted | 'select'>;
    },
    omitted
  >;
