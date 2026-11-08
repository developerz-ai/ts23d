import { describe, expect, test } from 'bun:test';
import { CATEGORIES, categoryOf } from './categories.ts';

describe('categoryOf', () => {
  test('an unknown kind with no tags falls through to Props, never to a themed category', () => {
    expect(categoryOf('gizmo', [])).toBe('Props');
  });

  test('a creature tagged character is a Creature (dragon), a bust is a Character', () => {
    expect(categoryOf('character', ['character', 'creature', 'dragon'])).toBe('Creatures');
    expect(categoryOf('creature', ['animal'])).toBe('Creatures');
    expect(categoryOf('character', ['bust', 'sculpt'])).toBe('Characters');
  });

  test('anything tagged rts is the Strategy kit, whatever its kind', () => {
    expect(categoryOf('vehicle', ['rts', 'tank'])).toBe('Strategy kit');
    expect(categoryOf('character', ['rts', 'character'])).toBe('Strategy kit');
  });

  test('rolling stock is a Vehicle, lineside structures are Architecture', () => {
    expect(categoryOf('vehicle', ['rail', 'steam'])).toBe('Vehicles');
    expect(categoryOf('prop', ['railroad', 'lineside'])).toBe('Architecture');
  });

  test('teaching assets: sound, parts, materials, demos', () => {
    expect(categoryOf('prop', ['demo', 'sound'])).toBe('Sound');
    expect(categoryOf('scene', ['catalogue', 'parts'])).toBe('Parts');
    expect(categoryOf('prop', ['material', 'pbr'])).toBe('Materials & finishes');
    expect(categoryOf('prop', ['svg', 'showcase'])).toBe('Tech demos');
  });

  test('untagged teaching assets are placed by name only while they have no tags', () => {
    expect(categoryOf('prop', [], 'weather_demo')).toBe('Materials & finishes');
    expect(categoryOf('prop', ['sound'], 'weather_demo')).toBe('Sound');
  });

  test('every result is a listed category', () => {
    for (const k of ['vehicle', 'building', 'terrain', 'prop'])
      expect(CATEGORIES).toContain(categoryOf(k, []));
  });
});
