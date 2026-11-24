import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpeciesGrantChoices } from './SpeciesGrantChoices'
import { getAllSpecies } from '../../../services/dataService'

const find = (slug: string) => getAllSpecies().find(s => s.slug === slug)!

describe('SpeciesGrantChoices', () => {
  it('renders nothing for species without choices', () => {
    const { container } = render(
      <SpeciesGrantChoices species={find('high-elf')} data={{ edition: '2014' }} onChange={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the ten draconic ancestries and reports the pick', () => {
    const onChange = vi.fn()
    render(<SpeciesGrantChoices species={find('dragonborn')} data={{ edition: '2014' }} onChange={onChange} />)
    const group = screen.getByRole('radiogroup', { name: /draconic ancestry/i })
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(10)
    fireEvent.click(screen.getByRole('radio', { name: /black/i }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ speciesChoices: { draconicAncestry: 'black' } }))
  })

  it('toggles skill picks, caps them at the count and blocks unavailable skills', () => {
    const onChange = vi.fn()
    render(
      <SpeciesGrantChoices
        species={find('half-elf')}
        data={{ edition: '2014', speciesPicks: { 'skill:Skill Versatility': ['Arcana', 'History'] } }}
        unavailableSkills={['Stealth']}
        onChange={onChange}
      />,
    )
    expect(screen.getByText(/\(2\/2\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stealth' })).toBeDisabled()
    // A third pick replaces the oldest instead of exceeding the count
    fireEvent.click(screen.getByRole('button', { name: 'Nature' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ speciesPicks: { 'skill:Skill Versatility': ['History', 'Nature'] } }),
    )
  })
})
