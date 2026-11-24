import React, { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, renderHook } from '@testing-library/react'
import { SpeciesAbilityChoiceWidget } from './SpeciesAbilityChoiceWidget'
import { useStepValidation } from '../hooks/useStepValidation'
import type { CharacterCreationData, SpeciesAbilityChoice, SpeciesAbilityChoiceSelection } from '../../../types/dnd'

const Harness: React.FC<{ choice: SpeciesAbilityChoice; fixed?: Record<string, number>; onChange?: (s: SpeciesAbilityChoiceSelection) => void }> = ({
  choice,
  fixed = {},
  onChange,
}) => {
  const [selection, setSelection] = useState<SpeciesAbilityChoiceSelection | undefined>()
  return (
    <SpeciesAbilityChoiceWidget
      choice={choice}
      fixed={fixed}
      selection={selection}
      onChange={s => {
        setSelection(s)
        onChange?.(s)
      }}
    />
  )
}

describe('SpeciesAbilityChoiceWidget', () => {
  it('renders one selector per increment and omits fixed abilities', () => {
    render(<Harness choice={{ patterns: [[1, 1]], from: ['STR', 'DEX', 'CHA'] }} fixed={{ CHA: 2 }} />)
    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    const options = Array.from((selects[0] as HTMLSelectElement).options).map(o => o.value)
    expect(options).toEqual(['', 'STR', 'DEX'])
    expect(screen.getByText(/Fixed: CHA \+2/)).toBeTruthy()
  })

  it('reports a complete selection once every slot is filled', () => {
    const onChange = vi.fn()
    render(<Harness choice={{ patterns: [[1, 1]] }} onChange={onChange} />)
    const [a, b] = screen.getAllByRole('combobox')
    fireEvent.change(a, { target: { value: 'STR' } })
    fireEvent.change(b, { target: { value: 'WIS' } })
    expect(onChange).toHaveBeenLastCalledWith({ pattern: [1, 1], bonuses: { STR: 1, WIS: 1 } })
  })

  it('moves an ability between slots instead of duplicating it', () => {
    const onChange = vi.fn()
    render(<Harness choice={{ patterns: [[2, 1]] }} onChange={onChange} />)
    const [a, b] = screen.getAllByRole('combobox')
    fireEvent.change(a, { target: { value: 'DEX' } })
    fireEvent.change(b, { target: { value: 'DEX' } })
    expect(onChange).toHaveBeenLastCalledWith({ pattern: [2, 1], bonuses: { DEX: 1 } })
  })

  it('lets the player switch pattern, which resets the picks', () => {
    const onChange = vi.fn()
    render(<Harness choice={{ patterns: [[2, 1], [1, 1, 1]] }} onChange={onChange} />)
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    fireEvent.click(screen.getByRole('radio', { name: '+1 / +1 / +1' }))
    expect(onChange).toHaveBeenLastCalledWith({ pattern: [1, 1, 1], bonuses: {} })
    expect(screen.getAllByRole('combobox')).toHaveLength(3)
  })
})

describe('Step 2 validation for species ability choices', () => {
  const base = { edition: '2014', speciesSlug: 'half-elf' } as CharacterCreationData

  it('blocks Next until the Half-Elf choice is complete', () => {
    const incomplete = renderHook(() => useStepValidation(2, base)).result.current
    expect(incomplete.canProceed).toBe(false)
    expect(incomplete.missingItems).toContain('Species ability score increases')

    const complete = renderHook(() =>
      useStepValidation(2, { ...base, speciesAbilityChoices: { pattern: [1, 1], bonuses: { STR: 1, DEX: 1 } } }),
    ).result.current
    // Half-Elf also picks two skills (Skill Versatility), so the ability choice alone is not enough
    expect(complete.canProceed).toBe(false)
    expect(complete.missingItems.some(item => item.startsWith('Species choice'))).toBe(true)

    const done = renderHook(() =>
      useStepValidation(2, {
        ...base,
        speciesAbilityChoices: { pattern: [1, 1], bonuses: { STR: 1, DEX: 1 } },
        speciesPicks: { 'skill:Skill Versatility': ['Arcana', 'History'] },
      }),
    ).result.current
    expect(done.canProceed).toBe(true)
  })

  it('does not require a choice for species without one', () => {
    const result = renderHook(() => useStepValidation(2, { ...base, speciesSlug: 'human' })).result.current
    expect(result.canProceed).toBe(true)
  })

  it('requires both +1s for Variant Human', () => {
    const variant = { ...base, speciesSlug: 'human', selectedSpeciesVariant: 'variant' } as CharacterCreationData
    expect(renderHook(() => useStepValidation(2, variant)).result.current.canProceed).toBe(false)
    expect(
      renderHook(() => useStepValidation(2, { ...variant, variantAbilityBonuses: { STR: 1, DEX: 1 } as never })).result.current.canProceed,
    ).toBe(true)
  })
})
