/**
 * FeatChoiceModal - Modal for the picks a feat asks for when it is chosen:
 * - which ability it increases, skill/tool/resistance/saving throw choices (from the feat data)
 * - Elemental Adept damage type, Metamagic Adept options
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Feat, FeatChoiceMap } from '../../../types/dnd';
import { getFeatChoiceSections, type FeatChoiceSection as ChoiceSection } from '../../../utils/featGrantUtils';

interface FeatChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  feat: Feat | null;
  onConfirm: (choices: FeatChoiceMap) => void;
}

const picked = (value: FeatChoiceMap[string] | undefined): string[] =>
  Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];

export const FeatChoiceModal: React.FC<FeatChoiceModalProps> = ({
  isOpen,
  onClose,
  feat,
  onConfirm
}) => {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const sections = getFeatChoiceSections(feat);

  if (!isOpen || !feat || sections.length === 0) return null;

  const toggle = (section: ChoiceSection, value: string) => {
    setSelections(prev => {
      const current = prev[section.key] ?? [];
      if (section.count === 1) return { ...prev, [section.key]: [value] };
      if (current.includes(value)) return { ...prev, [section.key]: current.filter(v => v !== value) };
      return current.length < section.count ? { ...prev, [section.key]: [...current, value] } : prev;
    });
  };

  const complete = sections.every(s => picked(selections[s.key]).length === Math.min(s.count, s.options.length));

  const handleConfirm = () => {
    // Single picks are stored as a string (the shape the effects code reads), multiple as a list
    const choices: FeatChoiceMap = Object.fromEntries(sections.map(s => {
      const values = selections[s.key] ?? [];
      return [s.key, s.count === 1 ? values[0] : values];
    }));
    onConfirm(choices);
    setSelections({});
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-theme-primary border border-theme-primary rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-accent-yellow-light">{feat.name}: choices</h3>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-primary"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sections.map(section => (
          <fieldset key={section.key} className="mb-4">
            <legend className="text-sm font-semibold text-theme-tertiary mb-2">{section.title}</legend>
            <div className="grid grid-cols-2 gap-1">
              {section.options.map(option => (
                <label key={option.value} className="flex items-center space-x-2">
                  <input
                    type={section.count === 1 ? 'radio' : 'checkbox'}
                    name={`${feat.slug}-${section.key}`}
                    value={option.value}
                    checked={(selections[section.key] ?? []).includes(option.value)}
                    onChange={() => toggle(section, option.value)}
                    className="text-accent-blue focus:ring-accent-blue"
                  />
                  <span className="text-sm text-theme-tertiary">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-theme-secondary text-theme-tertiary rounded-lg hover:bg-theme-quaternary"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!complete}
            className="px-4 py-2 bg-accent-blue text-white rounded-lg hover:bg-accent-blue-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
