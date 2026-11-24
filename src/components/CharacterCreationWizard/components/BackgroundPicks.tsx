import React from 'react';
import type { Background, BackgroundChoice, CharacterCreationData } from '../../../types/dnd';
import { getFeatBySlug } from '../../../services/dataService';
import {
  assignToolPicks,
  missingBackgroundPicks,
  selectedToolPackage,
  skillChoiceOptions,
} from '../../../utils/backgroundUtils';

interface BackgroundPicksProps {
  background: Background;
  data: CharacterCreationData;
  updateData: (updates: Partial<CharacterCreationData>) => void;
}

const toggle = (selected: string[], value: string, max: number): string[] => {
  if (selected.includes(value)) return selected.filter(item => item !== value);
  if (selected.length >= max) return selected;
  return [...selected, value];
};

const ChoiceButtons: React.FC<{
  options: string[];
  selected: string[];
  max: number;
  onChange: (next: string[]) => void;
}> = ({ options, selected, max, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {options.map(option => {
      const isSelected = selected.includes(option);
      const disabled = !isSelected && selected.length >= max;
      return (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(toggle(selected, option, max))}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            isSelected
              ? 'bg-accent-green-dark text-white'
              : disabled
                ? 'bg-theme-quaternary text-theme-muted cursor-not-allowed'
                : 'bg-theme-tertiary text-theme-primary hover:bg-theme-quaternary'
          }`}
        >
          {option}
        </button>
      );
    })}
  </div>
);

const ToolGroup: React.FC<{
  group: BackgroundChoice;
  index: number;
  groups: BackgroundChoice[];
  selected: string[];
  onChange: (next: string[]) => void;
}> = ({ group, index, groups, selected, onChange }) => {
  const assigned = assignToolPicks(groups, selected);
  const mine = assigned[index] ?? [];
  return (
    <div className="space-y-2">
      <div className="text-xs text-theme-muted">
        Choose {group.count} {group.count === 1 ? 'tool' : 'tools'} ({mine.length}/{group.count})
      </div>
      <ChoiceButtons
        options={group.from ?? []}
        selected={mine}
        max={group.count}
        onChange={next => {
          const others = assigned.flatMap((picks, groupIndex) => (groupIndex === index ? [] : picks));
          onChange([...others, ...next]);
        }}
      />
    </div>
  );
};

/** Skill, tool and feat picks a background asks for. Fixed grants are shown, not picked. */
export const BackgroundPicks: React.FC<BackgroundPicksProps> = ({ background, data, updateData }) => {
  const skillChoice = background.skillChoices;
  const skillOptions = skillChoice ? skillChoiceOptions(skillChoice) : [];
  const chosenSkills = (data.backgroundSkills ?? []).filter(skill => skillOptions.includes(skill));
  const pack = selectedToolPackage(background, data.backgroundToolPackage);
  const toolGroups = pack?.choices ?? background.toolChoices ?? [];
  const fixedTools = pack?.tools ?? background.tool_proficiencies ?? [];
  const missing = missingBackgroundPicks(background, data);

  return (
    <div className="space-y-3">
      {background.note && (
        <p className="text-xs text-theme-muted">{background.note}</p>
      )}

      {skillChoice && (
        <div className="bg-theme-tertiary/50 border border-theme-primary rounded-lg p-3 space-y-2">
          <h5 className="text-sm font-semibold text-yellow-200">
            Skill proficiencies ({chosenSkills.length}/{skillChoice.count})
          </h5>
          {background.skill_proficiencies.length > 0 && (
            <p className="text-xs text-theme-muted">Also granted: {background.skill_proficiencies.join(', ')}</p>
          )}
          <ChoiceButtons
            options={skillOptions}
            selected={chosenSkills}
            max={skillChoice.count}
            onChange={next => updateData({ backgroundSkills: next })}
          />
        </div>
      )}

      {background.toolPackages && background.toolPackages.length > 0 && (
        <div className="bg-theme-tertiary/50 border border-theme-primary rounded-lg p-3 space-y-2">
          <h5 className="text-sm font-semibold text-yellow-200">Tool proficiencies</h5>
          <select
            value={data.backgroundToolPackage ?? ''}
            onChange={event => updateData({ backgroundToolPackage: event.target.value, backgroundTools: [] })}
            className="w-full p-2 bg-theme-tertiary text-white rounded-lg"
          >
            <option value="">Choose one</option>
            {background.toolPackages.map(option => (
              <option key={option.label} value={option.label}>{option.label}</option>
            ))}
          </select>
          {fixedTools.length > 0 && (
            <p className="text-xs text-theme-muted">Granted: {fixedTools.join(', ')}</p>
          )}
        </div>
      )}

      {toolGroups.map((group, index) => (
        <div key={`${group.count}-${index}`} className="bg-theme-tertiary/50 border border-theme-primary rounded-lg p-3 space-y-2">
          {!background.toolPackages && index === 0 && (
            <h5 className="text-sm font-semibold text-yellow-200">Tool proficiencies</h5>
          )}
          {index === 0 && !background.toolPackages && fixedTools.length > 0 && (
            <p className="text-xs text-theme-muted">Also granted: {fixedTools.join(', ')}</p>
          )}
          <ToolGroup
            group={group}
            index={index}
            groups={toolGroups}
            selected={data.backgroundTools ?? []}
            onChange={next => updateData({ backgroundTools: next })}
          />
        </div>
      ))}

      {background.originFeatOptions && background.originFeatOptions.length > 0 && (
        <div className="bg-theme-tertiary/50 border border-theme-primary rounded-lg p-3 space-y-2">
          <h5 className="text-sm font-semibold text-yellow-200">Feat</h5>
          <select
            value={data.backgroundFeat ?? ''}
            onChange={event => updateData({ backgroundFeat: event.target.value })}
            className="w-full p-2 bg-theme-tertiary text-white rounded-lg"
          >
            <option value="">Choose a feat</option>
            {background.originFeatOptions.map(slug => (
              <option key={slug} value={slug}>{getFeatBySlug(slug, background.edition)?.name ?? slug}</option>
            ))}
          </select>
        </div>
      )}

      {missing.length > 0 && (
        <p className="text-xs text-accent-yellow-light">Still to choose: {missing.join(', ').toLowerCase()}.</p>
      )}
    </div>
  );
};
