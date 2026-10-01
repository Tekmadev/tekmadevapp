import { useState } from 'react';

import { Calendar } from '@/components/form/Calendar';
import { ChipsInput } from '@/components/form/ChipsInput';
import { DateField } from '@/components/form/DateField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { OptionList, Select } from '@/components/form/Select';
import { TimePicker } from '@/components/form/TimePicker';
import { formatClockTime, type ClockTime } from '@/components/form/time';
import { addDays, formatCalendarDate, parseCalendarDate, todayToronto, torontoWallTimeToInstant } from '@/lib/dates';

import { Caption, Demo } from '../../kitLayout';
import { CITY_OPTIONS, PLAN_OPTIONS } from '../../sampleData';

type Plan = (typeof PLAN_OPTIONS)[number]['value'];

/** 10:00 AM Toronto, `days` from today, as the ISO instant the API stores. */
function tenAm(days: number): string {
  const p = parseCalendarDate(addDays(todayToronto(), days));
  if (!p) return new Date().toISOString();
  return torontoWallTimeToInstant({ ...p, hour: 10, minute: 0 });
}

export function PickerDemos() {
  const [today] = useState(todayToronto);
  const tomorrow = addDays(today, 1);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [filledPlan, setFilledPlan] = useState<Plan | null>('grow');
  const [cities, setCities] = useState<string[]>(['toronto', 'ottawa']);
  const [errorPlan, setErrorPlan] = useState<Plan | null>(null);
  const [listPlan, setListPlan] = useState<Plan | null>('launch');
  const [listCities, setListCities] = useState<string[]>(['toronto']);

  const [expiry, setExpiry] = useState<string | null>(null);
  const [goLive, setGoLive] = useState<string | null>(() => addDays(todayToronto(), 14));
  const [late, setLate] = useState<string | null>(() => addDays(todayToronto(), -3));
  const [kickoff, setKickoff] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(() => tenAm(2));

  const [day, setDay] = useState<string | null>(today);
  const [time, setTime] = useState<ClockTime>({ hour: 14, minute: 30 });

  const [keywords, setKeywords] = useState<string[]>(['plumber toronto', 'emergency plumbing']);
  const [emptyKeywords, setEmptyKeywords] = useState<string[]>([]);
  const [errorKeywords, setErrorKeywords] = useState<string[]>([]);

  return (
    <>
      <Demo title="Select" note="Opens a sheet. Searchable above 8 options; multi select uses checkboxes.">
        <Select label="Plan" placeholder="No plan yet" options={PLAN_OPTIONS} value={plan} onChange={setPlan} onClear={() => setPlan(null)} />
        <Select label="Plan" options={PLAN_OPTIONS} value={filledPlan} onChange={setFilledPlan} help="Changing the plan does not bill anyone." />
        <Select<string> label="Cities" placeholder="All cities" options={CITY_OPTIONS} multiple value={cities} onChange={setCities} />
        <Select label="Plan" placeholder="No plan yet" options={PLAN_OPTIONS} value={errorPlan} onChange={setErrorPlan} error="Choose a plan." />
        <Select label="Plan" options={PLAN_OPTIONS} value="scale" onChange={() => undefined} disabled />
      </Demo>

      <Demo title="Option list" note="The same choices inline, without a sheet." padded={false} gap={0}>
        <OptionList options={PLAN_OPTIONS} value={listPlan} onChange={setListPlan} accessibilityLabel="Plan" />
        <OptionList<string> options={CITY_OPTIONS.slice(0, 4)} multiple value={listCities} onChange={setListCities} accessibilityLabel="Cities" />
      </Demo>

      <Demo title="Date field" note="A Toronto calendar date (YYYY-MM-DD), picked on a calendar in a sheet.">
        <DateField label="Expires" placeholder="No expiry" optional min={tomorrow} value={expiry} onChange={setExpiry} help="Pick a date in the future." />
        <DateField label="Target go-live" value={goLive} onChange={setGoLive} />
        <DateField label="Target go-live" min={today} value={late} onChange={setLate} />
        <DateField label="Started" value={today} onChange={() => undefined} disabled />
        <Caption>The third one is out of range, so it shows the range error by itself.</Caption>
      </Demo>

      <Demo title="Date and time field" note="Shown and picked in Toronto time, stored as an ISO instant.">
        <DateTimeField label="Kickoff" placeholder="Not booked" optional value={kickoff} onChange={setKickoff} />
        <DateTimeField label="Kickoff" value={booked} onChange={setBooked} />
        <DateTimeField label="Kickoff" value={booked} onChange={() => undefined} error="Pick a time during business hours." />
        <DateTimeField label="Kickoff" value={booked} onChange={() => undefined} disabled />
        <Caption>{booked ? `Stored: ${booked}` : 'Stored: nothing'}</Caption>
      </Demo>

      <Demo title="Calendar and time picker" note="The pieces inside the date and time sheets.">
        <Calendar value={day} onSelect={setDay} min={addDays(today, -60)} max={addDays(today, 120)} />
        <Caption>{day ? `Selected: ${formatCalendarDate(day, new Date(), true)}` : 'Selected: nothing'}</Caption>
        <TimePicker value={time} onChange={setTime} />
        <Caption>{`Selected: ${formatClockTime(time)}`}</Caption>
      </Demo>

      <Demo title="Chips input" note="Type, then comma or enter. Backspace on an empty input marks the last chip, again removes it.">
        <ChipsInput
          label="Keywords"
          value={keywords}
          onChange={setKeywords}
          maxItems={10}
          noun="keyword"
          normalize={(raw) => raw.toLowerCase()}
          autoCapitalize="none"
        />
        <ChipsInput label="Tags" value={emptyKeywords} onChange={setEmptyKeywords} noun="tag" help="Optional." />
        <ChipsInput label="Keywords" value={errorKeywords} onChange={setErrorKeywords} noun="keyword" error="Add at least one keyword." />
        <ChipsInput label="Keywords" value={['locked', 'read only']} onChange={() => undefined} noun="keyword" disabled />
      </Demo>
    </>
  );
}
