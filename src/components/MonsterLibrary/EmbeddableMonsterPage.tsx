import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MonsterStatBlock } from './MonsterStatBlock';
import { Monster, UserMonster } from '../../types/dnd';
import { getAllCustomMonsters } from '../../services/dbService';
import { getMonster, loadMonsterIndex } from '../../services/monsters';
import { isCustomMonsterId, getCustomMonsterDbId, pickCatalogSlug } from '../../utils/monsterUtils';

const EmbeddableMonsterPage: React.FC = () => {
  const { monsterId } = useParams<{ monsterId: string }>();
  const [monster, setMonster] = useState<Monster | UserMonster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    const loadMonster = async () => {
      await Promise.resolve();
      if (!live) return;
      if (!monsterId) {
        setError('No monster ID provided');
        setLoading(false);
        return;
      }

      try {
        let found: Monster | UserMonster | undefined;

        if (isCustomMonsterId(monsterId)) {
          const custom = await getAllCustomMonsters().catch(() => []);
          const dbId = getCustomMonsterDbId(monsterId);
          found = custom.find(entry => entry.id === dbId || entry.index === dbId);
        } else {
          const index = await loadMonsterIndex();
          const slug = pickCatalogSlug(index, monsterId);
          if (slug) found = await getMonster(slug);
        }

        if (!live) return;
        if (found) setMonster(found);
        else setError('Monster not found');
      } catch {
        if (live) setError('Failed to load monster data');
      } finally {
        if (live) setLoading(false);
      }
    };

    void loadMonster();
    return () => {
      live = false;
    };
  }, [monsterId]);

  if (loading) {
    return (
      <div className="iframe-embeddable min-h-screen bg-theme-primary text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-red-light mx-auto mb-4"></div>
          <p>Loading monster...</p>
        </div>
      </div>
    );
  }

  if (error || !monster) {
    return (
      <div className="iframe-embeddable min-h-screen bg-theme-primary text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-accent-red-light mb-4">Monster Not Found</h1>
          <p className="text-theme-muted">{error || 'The requested monster could not be found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="iframe-embeddable min-h-screen bg-theme-primary text-white">
      <MonsterStatBlock
        monster={monster}
        onClose={() => window.close()}
        onEdit={undefined}
      />
    </div>
  );
};

export default EmbeddableMonsterPage;
