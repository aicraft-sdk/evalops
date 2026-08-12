import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route } from 'wouter'
import { render } from '../utils'
import GoldenSetDetail from '../../pages/golden-set-detail'
import { server } from '../setup'
import { http, HttpResponse } from 'msw'

const goldenSet = { id: 'gs1', name: 'Faithfulness QA Set', description: 'Faithfulness examples' }

function renderDetail() {
  window.history.pushState({}, '', '/golden-sets/gs1')
  return render(<Route path="/golden-sets/:id" component={GoldenSetDetail} />)
}

beforeEach(() => {
  localStorage.setItem('auth_token', 'test-token')
  server.use(
    http.get('/api/evaluation/golden-sets', () => HttpResponse.json([goldenSet])),
    http.get('/api/evaluation/golden-sets/gs1/examples', () => HttpResponse.json([])),
    http.get('/api/evaluation/golden-sets/gs1/calibration-runs', () => HttpResponse.json([])),
  )
})

describe('GoldenSetDetail Page', () => {
  it('disables Run Calibration until a judge evaluator is selected', async () => {
    renderDetail()

    const runButton = await screen.findByTestId('button-run-calibration')
    expect(runButton).toBeDisabled()

    const user = userEvent.setup()
    await user.click(screen.getByTestId('select-judge-evaluator'))
    await user.click(await screen.findByText('Faithfulness'))

    await waitFor(() => {
      expect(screen.getByTestId('button-run-calibration')).not.toBeDisabled()
    })
  })

  it('renders the kappa value for a reliable (>=5 sample) calibration report', async () => {
    server.use(
      http.get('/api/evaluation/golden-sets/gs1/calibration-runs', () =>
        HttpResponse.json([
          {
            id: 'run1',
            judgeEvaluator: 'faithfulness',
            judgeThreshold: 0.5,
            agreementRate: 0.88,
            kappa: 0.81,
            isCalibrated: true,
            isReliable: true,
            sampleCount: 8,
            disagreements: {
              items: [
                {
                  exampleId: 'ex7',
                  humanLabel: true,
                  judgeLabel: false,
                  judgeScore: 0.4,
                  judgeReasoning: 'penalized accurate paraphrase',
                },
              ],
              excludedCount: 0,
            },
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        ]),
      ),
    )

    renderDetail()

    expect(await screen.findByTestId('text-kappa')).toHaveTextContent('κ=0.81')
    expect(screen.getByTestId('text-agreement-rate')).toHaveTextContent('Agreement: 88%')
    expect(screen.getByTestId('badge-calibration-status')).toHaveTextContent('Calibrated')
    expect(screen.queryByTestId('text-insufficient-examples')).not.toBeInTheDocument()
    expect(screen.getByTestId('row-disagreement-ex7')).toHaveTextContent(
      'penalized accurate paraphrase',
    )
  })

  it('renders "insufficient examples" instead of a kappa number for an unreliable (<5 sample) report', async () => {
    server.use(
      http.get('/api/evaluation/golden-sets/gs1/calibration-runs', () =>
        HttpResponse.json([
          {
            id: 'run2',
            judgeEvaluator: 'faithfulness',
            judgeThreshold: 0.5,
            agreementRate: 1,
            kappa: null,
            isCalibrated: false,
            isReliable: false,
            sampleCount: 3,
            disagreements: { items: [], excludedCount: 0 },
            createdAt: '2026-08-12T00:00:00.000Z',
          },
        ]),
      ),
    )

    renderDetail()

    expect(await screen.findByTestId('text-insufficient-examples')).toHaveTextContent(
      'insufficient examples (3 samples)',
    )
    expect(screen.queryByTestId('text-kappa')).not.toBeInTheDocument()
    expect(screen.getByTestId('badge-calibration-status')).toHaveTextContent('Uncalibrated')
  })
})
