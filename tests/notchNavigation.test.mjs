import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/notchNavigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
}).outputText;
const { NotchWheelGesture, panelToReopen } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const wheel = (x, y, mode = 0) => ({ deltaX: x, deltaY: y, deltaMode: mode });

test('one long trackpad swipe including tiny momentum events advances once', () => {
  const gesture = new NotchWheelGesture();
  const results = [0, 20, 40, 60, 80, 100].map(time => gesture.consume(wheel(0, 30), time));
  for (let time = 120; time <= 800; time += 20) results.push(gesture.consume(wheel(0, 0.5), time));
  assert.deepEqual(results.filter(Boolean), [1]);
  assert.equal(gesture.consume(wheel(0, -100), 1100), -1);
});
test('horizontal gesture keeps its axis despite diagonal jitter', () => {
  const gesture = new NotchWheelGesture();
  assert.equal(gesture.consume(wheel(50, 4), 0), 0);
  assert.equal(gesture.consume(wheel(10, -90), 20), 0);
  assert.equal(gesture.consume(wheel(30, 2), 40), 1);
});
test('sub-threshold motion does not accumulate across separate gestures', () => {
  const gesture = new NotchWheelGesture();
  assert.equal(gesture.consume(wheel(0, 50), 0), 0);
  assert.equal(gesture.consume(wheel(0, 50), 300), 0);
});
test('line and page deltas work and pinch events do not navigate', () => {
  assert.equal(new NotchWheelGesture().consume(wheel(0, 5, 1), 0), 1);
  assert.equal(new NotchWheelGesture().consume(wheel(-1, 0, 2), 0), -1);
  assert.equal(new NotchWheelGesture().consume({ ...wheel(0, 200), ctrlKey: true }, 0), 0);
});
test('calendar scrolling does not navigate or prematurely unlock a swipe', () => {
  const gesture = new NotchWheelGesture();
  assert.equal(gesture.consume(wheel(0, 100), 0), 1);
  assert.equal(gesture.consume(wheel(0, 100), 200, false), 0);
  assert.equal(gesture.consume(wheel(0, 100), 400), 0);
  assert.equal(gesture.consume(wheel(0, 100), 700), 1);
});
test('clock restores music, control center or calendar if still available', () => {
  const panels = ['status', 'music', 'command-center', 'calendar', 'shelf'];
  for (const panel of panels) assert.equal(panelToReopen(panel, panels), panel);
});
test('closed media or disabled panels fall back to an available menu', () => {
  assert.equal(panelToReopen('music', ['status', 'calendar']), 'calendar');
  assert.equal(panelToReopen('calendar', ['status', 'command-center']), 'command-center');
  assert.equal(panelToReopen(null, ['status']), 'status');
});
