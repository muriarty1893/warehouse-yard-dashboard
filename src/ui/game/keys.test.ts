import { describe, expect, test } from 'vitest';
import { keyAction } from './keys';

describe('game keys', () => {
  test('1 / 2 / 3 / 4 pick the speed, Esc pauses, ` opens the admin panel', () => {
    expect(keyAction({ key: '1', target: {} })).toBe('speed1');
    expect(keyAction({ key: '2', target: {} })).toBe('speed2');
    expect(keyAction({ key: '3', target: {} })).toBe('speed4');
    expect(keyAction({ key: 'Escape', target: {} })).toBe('pause');
    expect(keyAction({ key: '4', target: {} })).toBe('speed8');
    expect(keyAction({ key: '`', target: {} })).toBe('admin');
    expect(keyAction({ key: '5', target: {} })).toBeNull();
    expect(keyAction({ key: ' ', target: {} })).toBeNull();
  });
  test('keys typed into a field are left alone', () => {
    expect(keyAction({ key: '2', target: { tagName: 'INPUT' } })).toBeNull();
    expect(keyAction({ key: 'Escape', target: { tagName: 'TEXTAREA' } })).toBeNull();
  });
});
