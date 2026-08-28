import { describe, expect, test } from 'vitest';
import {
  assertMazeV2LevelOrdinal,
  isMazeV2LevelOrdinal,
  isMazeV2NormalizedAxis,
  isMazeV2TargetVector,
  MAZE_V2_TARGET_VECTOR_AXES
} from '../../src/domain/mazeV2/types';

describe('MazeV2LevelOrdinal validation', () => {
  test.each(['1', '7', '99', '100', '9007199254740993'])('accepts canonical positive decimal string %s', (value) => {
    expect(isMazeV2LevelOrdinal(value)).toBe(true);
  });

  test.each([
    '0',
    '-1',
    '01',
    '007',
    '1.0',
    '1e5',
    ' 1',
    '1 ',
    '',
    'seven',
    '+1'
  ])('rejects noncanonical value %s', (value) => {
    expect(isMazeV2LevelOrdinal(value)).toBe(false);
  });

  test('rejects non-string values', () => {
    expect(isMazeV2LevelOrdinal(1)).toBe(false);
    expect(isMazeV2LevelOrdinal(null)).toBe(false);
    expect(isMazeV2LevelOrdinal(undefined)).toBe(false);
  });

  test('assertMazeV2LevelOrdinal returns the value when canonical', () => {
    expect(assertMazeV2LevelOrdinal('42')).toBe('42');
  });

  test('assertMazeV2LevelOrdinal throws when not canonical', () => {
    expect(() => assertMazeV2LevelOrdinal('007')).toThrow(TypeError);
    expect(() => assertMazeV2LevelOrdinal(42)).toThrow(TypeError);
  });
});

describe('MazeV2NormalizedAxis validation', () => {
  test.each([0, 0.5, 1])('accepts %s', (value) => {
    expect(isMazeV2NormalizedAxis(value)).toBe(true);
  });

  test.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (value) => {
    expect(isMazeV2NormalizedAxis(value)).toBe(false);
  });
});

describe('MazeV2TargetVector validation', () => {
  const validVector = Object.fromEntries(MAZE_V2_TARGET_VECTOR_AXES.map((axis) => [axis, 0.5]));

  test('accepts a fully-populated vector with every axis in range', () => {
    expect(isMazeV2TargetVector(validVector)).toBe(true);
  });

  test('rejects a vector missing one axis', () => {
    const { spatialLoad: _spatialLoad, ...incomplete } = validVector;
    expect(isMazeV2TargetVector(incomplete)).toBe(false);
  });

  test('rejects a vector with one out-of-range axis', () => {
    expect(isMazeV2TargetVector({ ...validVector, wrapPressure: 1.5 })).toBe(false);
  });

  test('rejects non-object values', () => {
    expect(isMazeV2TargetVector(null)).toBe(false);
    expect(isMazeV2TargetVector('vector')).toBe(false);
  });
});
