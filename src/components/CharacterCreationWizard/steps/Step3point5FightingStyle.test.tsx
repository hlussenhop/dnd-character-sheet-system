import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { CharacterCreationData } from '../../../types/dnd'
import { Step3point5FightingStyle } from './Step3point5FightingStyle'

const renderStep = (overrides: Partial<CharacterCreationData>) => {
  const updateData = vi.fn()
  const nextStep = vi.fn()
  render(
    <Step3point5FightingStyle
      data={{
        classSlug: 'fighter',
        edition: '2014',
        level: 1,
        optionalFeatures: [],
        ...overrides,
      } as CharacterCreationData}
      updateData={updateData}
      nextStep={nextStep}
      prevStep={vi.fn()}
      stepIndex={7}
    />,
  )
  return { updateData, nextStep }
}

describe('class options during creation', () => {
  it('lets a level 1 fighter pick a fighting style slug', () => {
    const { updateData, nextStep } = renderStep({})
    expect(screen.getByRole('button', { name: /Next:/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: name => name.trim().startsWith('Defense') }))
    expect(updateData).toHaveBeenCalledWith(expect.objectContaining({
      optionalFeatures: ['defense'],
      fightingStyle: 'defense',
      selectedFightingStyle: 'defense',
    }))
    expect(nextStep).not.toHaveBeenCalled()
  })

  it('stores a 2024 invocation slug for a level 1 warlock', () => {
    const { updateData } = renderStep({ classSlug: 'warlock', edition: '2024' })
    fireEvent.click(screen.getByRole('button', { name: name => name.trim().startsWith('Armor of Shadows') }))
    expect(updateData).toHaveBeenCalledWith(expect.objectContaining({
      optionalFeatures: ['armor-of-shadows-2024'],
      eldritchInvocations: ['armor-of-shadows-2024'],
    }))
  })

  it('advances when the class has no options at this level', () => {
    const { nextStep } = renderStep({ classSlug: 'paladin', level: 1 })
    expect(nextStep).toHaveBeenCalled()
  })
})
