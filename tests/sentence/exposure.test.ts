import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExposureTracker,
  dwellTime,
} from '@/src/modules/sentence/ExposureTracker';

type Callback = (
  entries: Array<{ target: Element; isIntersecting: boolean }>,
) => void;
let trigger: Callback;

class FakeObserver {
  constructor(callback: Callback) {
    trigger = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('ExposureTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const options = { minDwellMs: 1000, dwellMsPerWord: 300 };

  it('scales dwell time with sentence length', () => {
    expect(dwellTime(2, options)).toBe(1000);
    expect(dwellTime(10, options)).toBe(3000);
  });

  function setup() {
    const onExposure = vi.fn();
    const tracker = new ExposureTracker({ ...options, onExposure });
    const element = document.createElement('span');
    tracker.track({ id: 's1', element, wordCount: 5 });
    return { tracker, element, onExposure };
  }

  it('credits a sentence once after it stays visible for the dwell time', () => {
    const { element, onExposure } = setup();
    trigger([{ target: element, isIntersecting: true }]);
    vi.advanceTimersByTime(1499);
    expect(onExposure).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExposure).toHaveBeenCalledWith('s1');

    trigger([{ target: element, isIntersecting: false }]);
    trigger([{ target: element, isIntersecting: true }]);
    vi.advanceTimersByTime(5000);
    expect(onExposure).toHaveBeenCalledTimes(1);
  });

  it('does not credit a sentence that scrolls away early', () => {
    const { element, onExposure } = setup();
    trigger([{ target: element, isIntersecting: true }]);
    vi.advanceTimersByTime(1000);
    trigger([{ target: element, isIntersecting: false }]);
    vi.advanceTimersByTime(5000);
    expect(onExposure).not.toHaveBeenCalled();
  });

  it('does not credit a hovered or revealed sentence', () => {
    const { tracker, element, onExposure } = setup();
    trigger([{ target: element, isIntersecting: true }]);
    vi.advanceTimersByTime(500);
    tracker.void('s1');
    vi.advanceTimersByTime(5000);
    trigger([{ target: element, isIntersecting: true }]);
    vi.advanceTimersByTime(5000);
    expect(onExposure).not.toHaveBeenCalled();
  });
});
