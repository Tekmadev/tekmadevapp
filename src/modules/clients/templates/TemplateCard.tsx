import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ClientsMeta, OnboardingTemplate } from '@/api/schemas/clients';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { layout, space } from '@/design/tokens';

import { ownerLabel } from '../list/labels';
import { templateDetails, templateSpokenLabel } from './logic';

export type TemplateCardProps = {
  template: OnboardingTemplate;
  meta: ClientsMeta | undefined;
  onPress: (template: OnboardingTemplate) => void;
};

/**
 * One checklist template: title (struck through when inactive), owner badge,
 * kind, plans, "optional" and the key in mono. The card opens the edit sheet.
 */
export const TemplateCard = memo(function TemplateCard({ template: t, meta, onPress }: TemplateCardProps) {
  return (
    <View style={styles.wrap}>
      <Card onPress={() => onPress(t)} accessibilityLabel={templateSpokenLabel(meta, t)} accessibilityHint="Edits the template">
        <View style={styles.top} importantForAccessibility="no-hide-descendants">
          <Text
            variant="bodyStrong"
            color={t.active ? 'ink' : 'ink4'}
            numberOfLines={2}
            style={[styles.title, t.active ? null : styles.inactive]}
          >
            {t.title}
          </Text>
          <Badge label={ownerLabel(meta, t.owner)} tone={t.owner === 'client' ? 'gold' : 'neutral'} />
        </View>
        <View importantForAccessibility="no-hide-descendants">
          <Text variant="small" color="ink3" numberOfLines={2} style={styles.details}>
            {templateDetails(meta, t)}
          </Text>
          <Text variant="mono" color="ink4" numberOfLines={1} style={styles.key}>
            {t.key}
          </Text>
        </View>
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: layout.gutter },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  title: { flex: 1 },
  inactive: { textDecorationLine: 'line-through' },
  details: { marginTop: space[1] },
  key: { marginTop: space[2] },
});
