import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Character } from '../../../types/dnd'
import type { LevelUpData } from '../../../data/classProgression'
import { StepOptionalFeatures } from './StepOptionalFeatures'

describe('class options on level-up', () => {
  it('asks a 2014 warlock for the two invocations gained at level 2', () => {
    const updateChoices = vi.fn()
    const onNext = vi.fn()
    render(
      <StepOptionalFeatures
        character={{
          class: 'Warlock',
          classSlug: 'warlock',
          edition: '2014',
          level: 1,
          optionalFeatures: [],
        } as unknown as Character}
        levelUpData={{ toLevel: 2, choices: [] } as unknown as LevelUpData}
        choices={{}}
        updateChoices={updateChoices}
        onNext={onNext}
        onPrev={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: name => name.trim().startsWith('Thirsting Blade') })).toBeNull()
    const continueButton = screen.getByRole('button', { name: 'Continue' })
    expect(continueButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: name => name.trim().startsWith('Agonizing Blast') }))
    fireEvent.click(screen.getByRole('button', { name: name => name.trim().startsWith('Armor of Shadows') }))
    expect(continueButton).toBeEnabled()
    fireEvent.click(continueButton)

    expect(updateChoices).toHaveBeenCalledWith({
      optionalFeaturesChosen: ['agonizing-blast', 'armor-of-shadows'],
    })
    expect(onNext).toHaveBeenCalled()
  })
})
