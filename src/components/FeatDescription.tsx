import React from 'react';
import type { Feat } from '../types/dnd';
import { useFeatDescription } from '../hooks/useFeatDescription';

interface FeatDescriptionProps {
  feat: Pick<Feat, 'slug' | 'source' | 'description'>;
  className?: string;
  /** Show only the first paragraph */
  firstParagraph?: boolean;
}

/** A feat's full text (loaded lazily), one paragraph per line of the source text. */
export const FeatDescription: React.FC<FeatDescriptionProps> = ({ feat, className, firstParagraph }) => {
  const text = useFeatDescription(feat);
  if (text === undefined) {
    return <p className={className}>Loading…</p>;
  }
  const paragraphs = text.split('\n').filter(Boolean);
  if (firstParagraph) {
    const lead = paragraphs.find(p => !/^you gain the following/i.test(p)) ?? paragraphs[0];
    return <p className={className}>{lead}</p>;
  }
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
};
