import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/notchNavigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
}).outputText;
const { NotchWheelGesture, panelToReopen, cyclePanel } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
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
  for (const panel of panels.filter(p => p !== 'status')) assert.equal(panelToReopen(panel, panels), panel);
  assert.equal(panelToReopen('status', panels), 'calendar');
});
test('closed media or disabled panels fall back to an available menu', () => {
  assert.equal(panelToReopen('music', ['status', 'calendar']), 'calendar');
  assert.equal(panelToReopen('calendar', ['status', 'command-center']), 'command-center');
  assert.equal(panelToReopen(null, ['status']), 'status');
});

test('carousel wraps repeatedly in both directions without the hover summary', () => {
  const panels = ['command-center', 'status', 'music', 'calendar', 'shelf'];
  let current = 'command-center';
  const forward = [];
  for (let i = 0; i < 8; i++) { current = cyclePanel(current, panels, 1); forward.push(current); }
  assert.deepEqual(forward, ['music', 'calendar', 'shelf', 'command-center', 'music', 'calendar', 'shelf', 'command-center']);
  assert.equal(cyclePanel('command-center', panels, -1), 'shelf');
  assert.equal(cyclePanel('status', panels, 1), 'command-center');
  assert.equal(cyclePanel('status', panels, -1), 'shelf');
});

test('disabled menus, single menu, and no menus are handled', () => {
  assert.equal(cyclePanel('music', ['status', 'calendar'], 1), 'calendar');
  assert.equal(cyclePanel('calendar', ['calendar'], 1), 'calendar');
  assert.equal(cyclePanel('status', ['status'], 1), null);
});

test('separate right swipes cycle forever but momentum never skips panels', () => {
  const gesture = new NotchWheelGesture();
  const panels = ['command-center', 'calendar', 'shelf'];
  let current = 'status';
  const visited = [];
  for (let swipe = 0; swipe < 9; swipe++) {
    for (let time = 0; time <= 200; time += 20) {
      const direction = gesture.consume(wheel(50, 1), swipe * 600 + time);
      if (direction) { current = cyclePanel(current, panels, direction); visited.push(current); }
    }
  }
  assert.deepEqual(visited, ['command-center', 'calendar', 'shelf', 'command-center', 'calendar', 'shelf', 'command-center', 'calendar', 'shelf']);
});
