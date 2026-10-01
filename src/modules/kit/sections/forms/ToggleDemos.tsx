import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { SegmentedControl } from '@/components/SegmentedControl';
import { Checkbox, type CheckState } from '@/components/form/Checkbox';
import { Field } from '@/components/form/Field';
import { FormSection } from '@/components/form/FormSection';
import { Slider } from '@/components/form/Slider';
import { Switch, SwitchRow } from '@/components/form/Switch';
import { TextField } from '@/components/form/TextField';
import { space } from '@/design/tokens';

import { Caption, Demo, Labeled, Wrap } from '../../kitLayout';

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const percent = (v: number) => `${Math.round(v * 100)}%`;

type Lock = 'immediately' | '1m' | '5m' | '15m';
const LOCKS = [
  { value: 'immediately', label: 'Now' },
  { value: '1m', label: '1 min' },
  { value: '5m', label: '5 min' },
  { value: '15m', label: '15 min' },
] as const;

export function ToggleDemos() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [push, setPush] = useState(true);
  const [saving, setSaving] = useState(false);

  const [terms, setTerms] = useState<CheckState>(false);
  const [done, setDone] = useState<CheckState>(true);
  const [all, setAll] = useState<CheckState>('mixed');

  const [beat, setBeat] = useState(1600);
  const [released, setReleased] = useState(1600);
  const [pullStrength, setPullStrength] = useState(0.72);
  const [fade, setFade] = useState(0.7);

  const [lock, setLock] = useState<Lock>('1m');
  const [code, setCode] = useState('SPRING25');

  return (
    <>
      <Demo title="Switch" note="On, off, disabled both ways, and saving (the thumb becomes the loader)." live>
        <Wrap gap={space[4]}>
          <Labeled label="on">
            <Switch value={on} onValueChange={setOn} accessibilityLabel="On example" />
          </Labeled>
          <Labeled label="off">
            <Switch value={off} onValueChange={setOff} accessibilityLabel="Off example" />
          </Labeled>
          <Labeled label="disabled on">
            <Switch value onValueChange={() => undefined} disabled accessibilityLabel="Disabled on example" />
          </Labeled>
          <Labeled label="disabled off">
            <Switch value={false} onValueChange={() => undefined} disabled accessibilityLabel="Disabled off example" />
          </Labeled>
          <Labeled label="saving">
            <Switch value onValueChange={() => undefined} pending accessibilityLabel="Saving example" />
          </Labeled>
        </Wrap>
      </Demo>

      <Demo title="Switch rows" note="Label, a line on what it does, the switch. The whole row toggles." padded={false} gap={0}>
        <SwitchRow label="Quiet" description="No sound or vibration for this category." value={quiet} onValueChange={setQuiet} style={styles.row} />
        <SwitchRow
          label="Push"
          description="Saving takes a moment: the switch shows the loader until the server answers."
          value={push}
          pending={saving}
          onValueChange={(next) => {
            setSaving(true);
            setTimeout(() => {
              setPush(next);
              setSaving(false);
            }, 1200);
          }}
          style={styles.row}
        />
        <SwitchRow
          label="Hide content in the recent apps screen"
          description="Owner only"
          value={false}
          onValueChange={() => undefined}
          disabled
          style={styles.row}
        />
      </Demo>

      <Demo title="Checkbox" note="Off, on, mixed (a group partly chosen), disabled.">
        <Checkbox label="Send the welcome email" checked={terms} onChange={setTerms} />
        <Checkbox label="Required" description="The client cannot go live until this is done." checked={done} onChange={setDone} />
        <Checkbox
          label="All plans"
          description="Some plans are chosen. Tap to choose all."
          checked={all}
          onChange={(next) => setAll(next)}
        />
        <Checkbox label="Archived" checked disabled onChange={() => undefined} />
        <Checkbox label="Locked" checked={false} disabled onChange={() => undefined} />
      </Demo>

      <Demo title="Slider" note="Live value while you drag, a tick per step, the value saved on release.">
        <Slider
          label="Beat"
          value={beat}
          min={800}
          max={3000}
          step={100}
          format={seconds}
          onChange={setBeat}
          onChangeEnd={setReleased}
          help="How long one pull takes."
        />
        <Caption>{`Released at ${seconds(released)}`}</Caption>
        <Slider label="Inner pull" value={pullStrength} min={0.5} max={1} step={0.01} format={percent} onChange={setPullStrength} error="That value was not saved. Try again." />
        <Slider label="Inner fade" value={fade} min={0.2} max={1} step={0.1} format={percent} onChange={setFade} disabled help="Owner only" />
      </Demo>

      <Demo title="Form section and field" note="Groups fields under an eyebrow; Field wraps any control with a label and help.">
        <FormSection title="Security" description="How the app locks when you leave it.">
          <Field label="Lock after" help="Counted from when the app goes to the background.">
            <SegmentedControl items={LOCKS} value={lock} onChange={setLock} accessibilityLabel="Lock after" />
          </Field>
          <TextField label="Coupon code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} monospace autoCapitalize="characters" />
        </FormSection>
      </Demo>
    </>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space[4] },
});
