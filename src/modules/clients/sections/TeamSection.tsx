import { UserPlus } from 'lucide-react-native';
import { Fragment, useState } from 'react';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Divider } from '@/components/Divider';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { Section } from '@/components/Section';

import { labelOf, toneOf } from './labels';
import { useClientLabels } from './sectionData';
import type { SectionProps } from './types';
import { AddMemberSheet } from './team/AddMemberSheet';
import { MemberSheet } from './team/MemberSheet';
import { memberName, memberTimeline } from './team/teamText';

/**
 * Team (brief 8.5, section 9): the client's portal users. Each row shows who,
 * their status, title and role, and when they were invited, joined and last
 * seen. Tap a person for role, status and the invite or reset link.
 */
export function TeamSection({ clientId, bundle }: SectionProps) {
  const labels = useClientLabels();
  const { members, client } = bundle;
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? (members.find((m) => m.id === openId) ?? null) : null;

  return (
    <Section
      title="Team"
      right={<Button label="Add a person" icon={UserPlus} size="sm" variant="secondary" onPress={() => setAdding(true)} />}
    >
      {members.length === 0 ? (
        <EmptyState compact message="No one has portal access yet." />
      ) : (
        <Card padded={false}>
          {members.map((m, i) => {
            const name = memberName(m);
            const role = labelOf(labels.memberRoles, m.role);
            const subtitle = [m.title?.trim() || null, role, m.name ? m.email : null].filter(Boolean).join(' · ');
            return (
              <Fragment key={m.id}>
                {i > 0 ? <Divider inset={72} /> : null}
                <ListRow
                  title={name}
                  subtitle={subtitle}
                  subtitleLines={2}
                  meta={memberTimeline(m)}
                  avatar={{ name: m.name ?? m.email }}
                  badge={{ label: labelOf(labels.memberStatuses, m.status), tone: toneOf(labels.memberStatuses, m.status) }}
                  onPress={() => setOpenId(m.id)}
                  accessibilityHint="Opens role, status and the invite link"
                />
              </Fragment>
            );
          })}
        </Card>
      )}

      {adding ? (
        <AddMemberSheet clientId={clientId} businessName={client.businessName} labels={labels} onClose={() => setAdding(false)} />
      ) : null}
      {open ? <MemberSheet key={open.id} clientId={clientId} member={open} labels={labels} onClose={() => setOpenId(null)} /> : null}
    </Section>
  );
}
