import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/form/DateField';
import { FormSection } from '@/components/form/FormSection';
import type { FieldFill } from '@/components/form/InputChrome';
import { TextArea } from '@/components/form/TextArea';
import { TextField } from '@/components/form/TextField';
import { layout } from '@/design/tokens';
import { todayToronto } from '@/lib/dates';

import { DEMO_LIMITS, DEMO_LINK_LIMIT, type DemoForm, type DemoFormErrors } from './demoForm';

export type DemoFieldsProps = {
  form: DemoForm;
  errors: DemoFormErrors;
  onChange: <K extends keyof DemoForm>(key: K, value: DemoForm[K]) => void;
  /** Box fill: bg2 on a screen, the sheet's own on a sheet. */
  fill?: FieldFill;
  /** "Already built? Demo link" at the end ("Request a demo", for `demos.manage`). */
  withLink?: boolean;
};

/**
 * The demo request fields (contract 2026-10-05), shared by "Request a demo"
 * and the Edit sheet: the business (name, kind, area and what they sell are
 * required, marked "Required." under the field), then what the client wants
 * to see and when it is needed (a Toronto calendar date, today or later).
 * With `withLink`, an optional "Already built? Demo link": the request is
 * then saved as ready to show (the link sheet's https check and copy).
 * Field errors come from the local check or the server, under the same keys.
 */
export function DemoFields({ form, errors, onChange, fill, withLink = false }: DemoFieldsProps) {
  const text = (key: Exclude<keyof DemoForm, 'neededBy'>) => (value: string) => onChange(key, value);
  return (
    <View style={styles.sections}>
      <FormSection title="Business" description="What the builder needs to make the demo look like theirs.">
        <TextField
          label="Business name"
          help="Required."
          value={form.businessName}
          onChangeText={text('businessName')}
          error={errors.businessName}
          maxLength={DEMO_LIMITS.businessName}
          autoCapitalize="words"
          autoComplete="organization"
          fill={fill}
        />
        <TextField
          label="Kind of business"
          help='Required. For example "Plumber" or "Hair salon".'
          value={form.businessType}
          onChangeText={text('businessType')}
          error={errors.businessType}
          maxLength={DEMO_LIMITS.businessType}
          autoCapitalize="sentences"
          fill={fill}
        />
        <TextField
          label="Area they serve"
          help="Required. The city or area, for example Hamilton and Stoney Creek."
          value={form.area}
          onChangeText={text('area')}
          error={errors.area}
          maxLength={DEMO_LIMITS.area}
          autoCapitalize="words"
          fill={fill}
        />
        <TextArea
          label="What they sell or do"
          help="Required. Their main services or products."
          value={form.offer}
          onChangeText={text('offer')}
          error={errors.offer}
          maxLength={DEMO_LIMITS.offer}
          minLines={3}
          fill={fill}
        />
        <TextField
          label="Current website or socials"
          help="Optional. Links or handles, any format."
          value={form.website}
          onChangeText={text('website')}
          error={errors.website}
          maxLength={DEMO_LIMITS.website}
          autoCapitalize="none"
          autoCorrect={false}
          fill={fill}
        />
        <TextField
          label="Logo and brand colours"
          help="Optional. What they use now, or what they like."
          value={form.brand}
          onChangeText={text('brand')}
          error={errors.brand}
          maxLength={DEMO_LIMITS.brand}
          fill={fill}
        />
        <TextField
          label="Their customers"
          help="Optional. Who buys from them."
          value={form.customers}
          onChangeText={text('customers')}
          error={errors.customers}
          maxLength={DEMO_LIMITS.customers}
          fill={fill}
        />
      </FormSection>

      <FormSection title="The demo">
        <TextArea
          label="What they want to see"
          help="Optional. Pages, features, a site they like."
          value={form.wants}
          onChangeText={text('wants')}
          error={errors.wants}
          maxLength={DEMO_LIMITS.wants}
          minLines={3}
          fill={fill}
        />
        {/* An older request may carry a past date: the server accepts it, so no range error. */}
        <DateField
          label="Needed by"
          value={form.neededBy}
          onChange={(date) => onChange('neededBy', date)}
          min={todayToronto()}
          rangeError={null}
          optional
          placeholder="No date"
          help="Optional. When you plan to show it."
          error={errors.neededBy}
          fill={fill}
        />
        {withLink ? (
          <TextField
            label="Already built? Demo link"
            placeholder="https://name.vercel.app"
            help="Paste the link and it is saved as ready to show."
            value={form.demoUrl}
            onChangeText={text('demoUrl')}
            error={errors.demoUrl}
            maxLength={DEMO_LINK_LIMIT}
            showCount={false}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            clearable
            monospace
            fill={fill}
          />
        ) : null}
      </FormSection>
    </View>
  );
}

const styles = StyleSheet.create({
  sections: { gap: layout.sectionGap },
});
