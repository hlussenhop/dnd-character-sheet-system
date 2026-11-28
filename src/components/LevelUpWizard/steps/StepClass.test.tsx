import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CharacterCreationData } from '../../../types/dnd'
import { BACKGROUNDS } from '../../../services/dataService'
import { calculateCharacterStats } from '../../../utils/characterCreationUtils'
import { calculateLevelUpData } from '../../../utils/levelUpUtils'
import { StepClass } from './StepClass'

const fighter = calculateCharacterStats({
  name: 'Brakka',
  level: 3,
  edition: '2014',
  classSlug: 'fighter',
  speciesSlug: 'human',
  abilities: { STR: 15, DEX: 14, CON: 14, INT: 8, WIS: 10, CHA: 10 },
  abilityScoreMethod: 'custom',
  background: BACKGROUNDS.find(b => b.edition === '2014')!.slug,
  alignment: 'Neutral',
  selectedSkills: [],
  selectedMusicalInstruments: [],
  equipmentChoices: [],
  hpCalculationMethod: 'max',
  spellSelection: { selectedCantrips: [] },
} as unknown as CharacterCreationData)

describe('StepClass', () => {
  it('lists the current class and locks classes whose prerequisites are not met', async () => {
    const onSelectClass = vi.fn()
    render(
      <StepClass
        character={fighter}
        levelUpData={calculateLevelUpData(fighter)!}
        choices={{ hpGained: 6 }}
        updateChoices={vi.fn()}
        selectedClassSlug="fighter"
        onSelectClass={onSelectClass}
        onNext={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Fighter\s*Level 3 → 4/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Wizard/ })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /^Barbarian/ }))
    expect(onSelectClass).toHaveBeenCalledWith('barbarian')
  })

  it('asks for the multiclass skill before continuing', async () => {
    const updateChoices = vi.fn()
    render(
      <StepClass
        character={fighter}
        levelUpData={calculateLevelUpData(fighter, 'rogue')!}
        choices={{ classSlug: 'rogue', hpGained: 5 }}
        updateChoices={updateChoices}
        selectedClassSlug="rogue"
        onSelectClass={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    expect(screen.getByText(/Joining Rogue/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Stealth' }))
    expect(updateChoices).toHaveBeenCalledWith({ multiclassSkills: ['Stealth'] })
  })
})
