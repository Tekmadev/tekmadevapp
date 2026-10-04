import { Lock, Pencil } from 'lucide-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ClientCredit } from '@/api/schemas/clients';
import { useCan } from '@/auth/permissions';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { ListRow } from '@/components/ListRow';
import { Section } from '@/components/Section';
import { Text } from '@/components/Text';
import { space } from '@/design/tokens';

import { useMeta } from '../detail/meta';
import { CreditEditSheet } from './credits/CreditEditSheet';
import { CREDIT_COPY, creditRoleLabel, sharePercent } from './credits/logic';
import type { SectionProps } from './types';

/** Rows line up their dividers with the text after the 40dp avatar. */
const ROW_TEXT_INSET = 72;

const isMine = (credit: ClientCredit, myEmail: string | null | undefined) =>
  !!myEmail && credit.email.trim().toLowerCase() === myEmail.trim().toLowerCase();

/**
 * Credit (commission credit, after Account): who gets credit for winning this
 * client (finder, booker, other) and their share of 100, from the bundle's
 * `credits`. Owners and managers (`clients.credits.view`) see every row and,
 * with `clients.credits.edit`, edit them. Everyone else (`activity.own`)
 * sees only their own rows, titled "Your credit", with a note that credit is
 * private. Hidden when the server sends no credits at all (an older server).
 */
export function CreditSection({ clientId, bundle }: SectionProps) {
  const seesAll = useCan('clients.credits.view');
  const seesOwn = useCan('activity.own');
  const canEdit = useCan('clients.credits.edit');
  const me = useMe();
  const meta = useMeta();
  const [editing, setEditing] = useState(false);
  const credits = bundle.credits;

  if (!credits || (!seesAll && !seesOwn)) return null;
  const mayEdit = seesAll && canEdit;

  let body: ReactNode;
  if (credits.length === 0) {
    body = <EmptyState compact message={seesAll ? CREDIT_COPY.empty : CREDIT_COPY.ownEmpty} />;
  } else {
    body = credits.map((credit, index) => {
      const name = credit.name?.trim() || credit.email;
      const role = creditRoleLabel(meta.data, credit.role);
      const mine = isMine(credit, me?.user.email);
      const share = sharePercent(credit.share);
      return (
        <Fragment key={`${credit.email}|${credit.role}`}>
          {index > 0 ? <Divider inset={ROW_TEXT_INSET} /> : null}
          <ListRow
            title={name}
            subtitle={[role, mine && seesAll ? 'You' : null].filter(Boolean).join(' · ')}
            avatar={{ name }}
            value={share}
            accessibilityLabel={`${name}, ${role}, ${share}${mine && seesAll ? ', you' : ''}`}
          />
        </Fragment>
      );
    });
  }

  return (
    <Section
      title={seesAll ? CREDIT_COPY.title : CREDIT_COPY.ownTitle}
      right={
        mayEdit ? (
          <Button label={CREDIT_COPY.edit} icon={Pencil} size="sm" variant="secondary" onPress={() => setEditing(true)} accessibilityLabel={CREDIT_COPY.editTitle} />
        ) : undefined
      }
    >
      <Card padded={credits.length === 0}>{body}</Card>
      {seesAll ? null : (
        <View style={styles.note}>
          <Icon icon={Lock} size={14} color="ink3" />
          <Text variant="small" color="ink3" style={styles.noteText}>
            {CREDIT_COPY.privateNote}
          </Text>
        </View>
      )}

      {editing && mayEdit ? (
        <CreditEditSheet clientId={clientId} businessName={bundle.client.businessName} credits={credits} onClose={() => setEditing(false)} />
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[2], paddingHorizontal: space[1] },
  noteText: { flex: 1 },
});
