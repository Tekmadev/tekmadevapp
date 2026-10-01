import { useRef, useState } from 'react';
import type { TextInput, TextInputChangeEvent } from 'react-native';

import { Button } from '@/components/Button';
import { DraftRestoreNotice } from '@/components/form/DraftRestoreNotice';
import { NumberField, numberRangeError } from '@/components/form/NumberField';
import { PasswordField } from '@/components/form/PasswordField';
import { SearchField } from '@/components/form/SearchField';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import type { StoredDraft } from '@/components/form/autosave';
import { formatCents } from '@/lib/money';
import { notice } from '@/lib/notice';

import { Caption, Demo } from '../../kitLayout';

/**
 * NumberField's `onChange` type is also TextInput's event handler (its props
 * keep BaseInputProps' onChange), so a plain setter does not type check. This
 * adapter accepts both and only passes numbers on. See the Kit report.
 */
function numberSetter(set: (value: number | null) => void) {
  return (value: number | null | TextInputChangeEvent) => {
    if (value === null || typeof value === 'number') set(value);
  };
}

const LONG_TITLE = 'Plumber in Toronto: emergency repairs, drains and water heaters, same week';

export function TextInputDemos() {
  const emptyRef = useRef<TextInput>(null);
  const [empty, setEmpty] = useState('');
  const [name, setName] = useState('Acme Plumbing');
  const [slug, setSlug] = useState('start');
  const [destination, setDestination] = useState('example.com');
  const [metaTitle, setMetaTitle] = useState(LONG_TITLE);

  const [notes, setNotes] = useState('');
  const [about, setAbout] = useState('Family run since 1998. Licensed and insured.\nServes Toronto, Mississauga and Brampton.');
  const [reason, setReason] = useState('');
  // A pretend draft, so the restore offer can be seen without killing the app.
  const [draft, setDraft] = useState<StoredDraft<string> | null>(() => ({ value: 'Notes typed before the app closed.', savedAt: Date.now() - 4 * 60_000 }));

  const [percent, setPercent] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(7750);
  const [tooMuch, setTooMuch] = useState<number | null>(120);

  const [password, setPassword] = useState('');
  const [shortPassword, setShortPassword] = useState('short');
  const [confirm, setConfirm] = useState('different1');
  const [filledPassword, setFilledPassword] = useState('correct horse battery');

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filledQuery, setFilledQuery] = useState('acme');

  return (
    <>
      <Demo title="Text field" note="Floating label, gold focus border, help or error, count, prefix, clear.">
        <TextField ref={emptyRef} label="Business name" value={empty} onChangeText={setEmpty} help="As it appears on invoices." />
        <Button label="Focus the empty field" variant="secondary" size="sm" onPress={() => emptyRef.current?.focus()} />
        <TextField label="Business name" value={name} onChangeText={setName} clearable />
        <TextField
          label="Slug"
          prefix="tekmadev.com/"
          monospace
          autoCapitalize="none"
          value={slug}
          onChangeText={setSlug}
          error="That slug is reserved by an existing page. Pick another."
        />
        <TextField label="Destination" value={destination} onChangeText={setDestination} autoCapitalize="none" error="Add https:// for another website." />
        <TextField label="Meta title" softLimit={60} value={metaTitle} onChangeText={setMetaTitle} help="Aim for 60 characters or fewer." />
        <TextField label="Email" value="you@tekmadev.com" disabled help="Your email is your login. To change it, ask an owner." />
      </Demo>

      <Demo title="Text area" note="Grows with the text, with an optional local autosave.">
        <DraftRestoreNotice
          draft={draft}
          onRestore={() => {
            if (draft) setNotes(draft.value);
            setDraft(null);
            notice.ok('Draft restored.');
          }}
          onDiscard={() => setDraft(null)}
        />
        <TextArea label="Notes" value={notes} onChangeText={setNotes} autosaveKey="kit.notes" help="Saved to a local draft while you type." />
        <TextArea label="About the business" value={about} onChangeText={setAbout} softLimit={300} />
        <TextArea label="Reason" value={reason} onChangeText={setReason} minLines={2} error="Say why, in a few words." />
        <TextArea label="Internal note" value="Only owners can edit this." disabled />
      </Demo>

      <Demo title="Number field" note="Integer or money. Money is typed in dollars and stored as cents.">
        <NumberField label="Percent off" suffix="%" value={percent} onChange={numberSetter(setPercent)} min={1} max={100} required />
        <NumberField label="Amount" mode="money" value={amount} onChange={numberSetter(setAmount)} min={100} />
        <Caption>{amount == null ? 'Stored: nothing' : `Stored: ${amount} cents, shown as ${formatCents(amount)}`}</Caption>
        <NumberField
          label="Percent off"
          suffix="%"
          value={tooMuch}
          onChange={numberSetter(setTooMuch)}
          error={numberRangeError(tooMuch, { mode: 'integer', min: 1, max: 100 })}
        />
        <NumberField label="Price" mode="money" value={99700} onChange={() => undefined} disabled />
      </Demo>

      <Demo title="Password field" note="Show and hide with the eye.">
        <PasswordField label="New password" newPassword value={password} onChangeText={setPassword} help="8 characters or more." />
        <PasswordField
          label="New password"
          newPassword
          value={shortPassword}
          onChangeText={setShortPassword}
          error="New password must be at least 8 characters."
        />
        <PasswordField label="Confirm password" newPassword value={confirm} onChangeText={setConfirm} error="The two passwords do not match." />
        <PasswordField label="Password" value={filledPassword} onChangeText={setFilledPassword} />
        <PasswordField label="Password" value="locked" disabled />
      </Demo>

      <Demo title="Search field" note="Pill with a clear button; the debounced value follows after a pause.">
        <SearchField placeholder="Search clients" value={query} onChangeText={setQuery} onChangeDebounced={setDebounced} />
        <Caption>{debounced ? `Debounced: ${debounced}` : 'Debounced: nothing yet'}</Caption>
        <SearchField value={filledQuery} onChangeText={setFilledQuery} />
        <SearchField placeholder="Search is off offline" disabled />
      </Demo>
    </>
  );
}
