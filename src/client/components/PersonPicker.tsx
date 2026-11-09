import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PublicPerson } from '../../shared/schemas';
import { normalizeText } from '../lib/schedule';
import { useData } from '../state/data';
import { useT } from '../state/prefs';
import { GroupChips } from './domain';
import { Avatar, Button, EmptyState, Modal, TextInput } from './ui';

export function PersonPicker({ open, onClose }: { open: boolean; onClose(): void }) {
  const t = useT();
  const { snapshot, meId, setMeId, role } = useData();
  const [q, setQ] = useState('');
  const people = useMemo(() => {
    const list = [...(snapshot?.people ?? [])];
    // Organizers most likely look for organizers, participants for participants.
    const preferOrganizers = role === 'organizer' || role === 'admin';
    list.sort((a, b) => {
      const ra = (a.role === 'organizer') === preferOrganizers ? 0 : 1;
      const rb = (b.role === 'organizer') === preferOrganizers ? 0 : 1;
      return ra - rb || a.name.localeCompare(b.name);
    });
    const nq = normalizeText(q.trim());
    return nq ? list.filter((p) => normalizeText(p.name).includes(nq)) : list;
  }, [snapshot, q, role]);

  const choose = (p: PublicPerson | null) => {
    setMeId(p?.id ?? null);
    setQ('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('picker.title')}>
      {snapshot?.people.length ? (
        <>
          <div className="search-box">
            <Search size={18} aria-hidden />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.search')} aria-label={t('picker.search')} autoFocus />
          </div>
          <ul className="picker-list">
            {people.map((p) => (
              <li key={p.id}>
                <button type="button" className={`picker-item${p.id === meId ? ' on' : ''}`} onClick={() => choose(p)}>
                  <Avatar name={p.name} />
                  <span className="picker-name">
                    <strong>{p.name}</strong>
                    <span className="picker-sub">
                      {p.role === 'organizer' ? p.roleTitle || t('people.roleOrganizer') : t('people.roleParticipant')}
                      <GroupChips ids={p.groupIds} groups={snapshot.groups} />
                    </span>
                  </span>
                  {p.id === meId && <Check size={20} className="accent" />}
                </button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" block onClick={() => choose(null)}>
            {t('picker.none')}
          </Button>
        </>
      ) : (
        <EmptyState title={t('picker.empty')} />
      )}
    </Modal>
  );
}
