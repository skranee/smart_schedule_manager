import { describe, it, expect, beforeEach, vi } from 'vitest';
import { categorizeWithHeuristics, refineCategoryPrediction } from '../src/ai/categoryMapping.js';

describe('AI heuristics', () => {
  const scenarios = [
    { title: 'Завтрак с семьёй', expected: 'Healthcare' },
    { title: 'Домашняя работа (математика)', expected: 'Learning' },
    { title: 'Play computer games', expected: 'Games' },
    { title: 'Evening gym training', expected: 'Sport activity' },
    { title: 'Пойти в магазин за продуктами', expected: 'Admin/Errands' },
    { title: 'Гулять в парке', expected: 'Outdoor Play' }
  ] as const;

  scenarios.forEach(({ title, expected }) => {
    it(`classifies "${title}" as ${expected}`, () => {
      const result = categorizeWithHeuristics({ title });
      expect(result).not.toBeNull();
      expect(result?.label).toBe(expected);
      expect(result?.confidence ?? 0).toBeGreaterThan(0.7);
    });
  });
});

describe('AI category refinement', () => {
  it('adjusts walking tasks away from sport classification', () => {
    const result = refineCategoryPrediction(
      { title: 'Evening walk in the park', description: '' },
      'Sport activity',
      0.4,
    );
    expect(['Relaxing', 'Outdoor Play']).toContain(result.label);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('keeps clear sports as Sport activity', () => {
    const result = refineCategoryPrediction(
      { title: 'Soccer practice', description: 'Team training' },
      'Other',
      0.2,
    );
    expect(result.label).toBe('Sport activity');
  });

  it('maps yoga routines to Relaxing', () => {
    const result = refineCategoryPrediction(
      { title: 'Morning yoga nidra', description: '' },
      'Other',
      0.3,
    );
    expect(result.label).toBe('Relaxing');
  });

  it('classifies playground time as Outdoor Play', () => {
    const result = refineCategoryPrediction(
      { title: 'Playground with friends', description: 'after school fun' },
      'Other',
      0.25,
    );
    expect(result.label).toBe('Outdoor Play');
  });
});

