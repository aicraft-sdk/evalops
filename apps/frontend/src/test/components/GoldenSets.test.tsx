import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '../utils'
import GoldenSets from '../../pages/golden-sets'
import { server } from '../setup'
import { http, HttpResponse } from 'msw'

beforeEach(() => {
  localStorage.setItem('auth_token', 'test-token')
})

describe('GoldenSets Page', () => {
  it('renders the list of golden sets from the API', async () => {
    server.use(
      http.get('/api/evaluation/golden-sets', () => {
        return HttpResponse.json([
          { id: 'gs1', name: 'Faithfulness QA Set', description: 'Faithfulness examples' },
          { id: 'gs2', name: 'PII Detection Set', description: 'PII examples' },
        ])
      }),
    )

    render(<GoldenSets />)

    expect(await screen.findByTestId('text-golden-sets-title')).toHaveTextContent('Golden Sets')

    await waitFor(() => {
      expect(screen.getByText('Faithfulness QA Set')).toBeInTheDocument()
    })
    expect(screen.getByText('PII Detection Set')).toBeInTheDocument()
  })

  it('creates a new golden set via the create dialog', async () => {
    const user = userEvent.setup()
    let createdBody: unknown = null

    server.use(
      http.get('/api/evaluation/golden-sets', () => HttpResponse.json([])),
      http.post('/api/evaluation/golden-sets', async ({ request }) => {
        createdBody = await request.json()
        return HttpResponse.json({ id: 'gs-new', ...(createdBody as object) })
      }),
    )

    render(<GoldenSets />)

    await user.click(await screen.findByTestId('button-create-golden-set'))
    await user.type(screen.getByTestId('input-golden-set-name'), 'New Golden Set')
    await user.type(screen.getByTestId('textarea-golden-set-description'), 'A new set')
    await user.click(screen.getByTestId('button-submit-golden-set'))

    await waitFor(() => {
      expect(createdBody).toEqual({ name: 'New Golden Set', description: 'A new set' })
    })
  })
})
