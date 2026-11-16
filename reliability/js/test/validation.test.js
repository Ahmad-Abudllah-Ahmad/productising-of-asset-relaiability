import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTER, entryFor, isExperimental, explain, checkRegister } from '../domain/validation.js';

test('the register lists every model and score management named, all experimental to start with', () => {
  assert.deepEqual(REGISTER.map((e) => e.id), ['health_index', 'risk', 'risk_map', 'resemblance', 'finding_confidence', 'forecast']);
  for (const e of REGISTER) {
    assert.equal(e.status, 'experimental', e.id);
    assert.ok(e.why.length > 30, `${e.id} says why`);
    assert.deepEqual([e.testedAgainst, e.result, e.date, e.approvedBy], [null, null, null, null], `${e.id} has no recorded test yet`);
    assert.ok(isExperimental(e.id));
  }
});

test('the real register is consistent: nothing is validated without a recorded test', () => {
  assert.deepEqual(checkRegister(), []);
});

test('an entry marked validated without testedAgainst and result fails the check', () => {
  const base = { id: 'x', name: 'X', why: 'because', testedAgainst: null, result: null, date: null, approvedBy: null };
  assert.deepEqual(checkRegister([{ ...base, status: 'validated' }]), ['x: validated without testedAgainst', 'x: validated without a result']);
  assert.deepEqual(checkRegister([{ ...base, status: 'validated', testedAgainst: '2025 inspections, 40 towers' }]), ['x: validated without a result']);
  assert.deepEqual(checkRegister([{ ...base, status: 'validated', testedAgainst: '2025 inspections, 40 towers', result: 'agreed on 36 of 40' }]), []);
  assert.deepEqual(checkRegister([{ ...base, status: 'experimental' }]), []);
  assert.deepEqual(checkRegister([{ ...base, status: 'tested' }]), ['x: status must be experimental or validated']);
  assert.deepEqual(checkRegister([{ ...base, status: 'experimental' }, { ...base, status: 'experimental' }]), ['x: listed twice']);
});

test('the hover text says why and names the register entry; an unknown id is never silently unlabelled', () => {
  const t = explain('risk');
  assert.match(t, /^Experimental\./);
  assert.match(t, /criticality and consequence/i);
  assert.match(t, /Validation register entry: risk \(reliability\/js\/domain\/validation\.js\)/);
  assert.equal(entryFor('nope'), null);
  assert.equal(isExperimental('nope'), true);
  assert.match(explain('nope'), /no entry in the validation register/);
});
