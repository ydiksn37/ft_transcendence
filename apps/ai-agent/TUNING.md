# Expert tuning report

Date: 2026-08-21

## Data split

- training: seeds 10000-10049
- validation: seeds 1000000-1000049
- final test: seeds 3000000-3000099
- training/validation game length: 300 pieces
- final-test game length: 500 pieces
- CEM search budget: 6000 nodes per decision
- final Hard/Expert budget: 50 ms per decision

The final-test seeds were not used to select weights.

## Multiple CEM runs

Three optimizer seeds were evaluated. The baseline on the validation set had
`0.213998` attacks per piece, `0.997267` survival, and 3 game overs.

| Optimizer seed | Attack/piece | Survival | Game overs | Decision |
|---:|---:|---:|---:|---|
| 11 | 0.238358 | 0.990800 | 2 | selected |
| 22 | 0.269395 | 0.979867 | 2 | rejected: attack-heavy |
| 33 | 0.249372 | 0.948133 | 6 | rejected: unstable |

Optimizer seed 11 was selected before opening the final-test results. It
improved validation attack efficiency by approximately 11.4% while preserving
the most survival among the three candidates.

## Paired final test

Hard and Expert received the same 100 seeds. The confidence interval is for the
paired difference `Expert - Hard`.

| Metric | Hard | Expert | Difference | 95% confidence interval |
|---|---:|---:|---:|---:|
| Attack/piece | 0.56803 | 0.53712 | -0.03091 | [-0.04244, -0.01937] |
| Total attack | 266.81 | 268.56 | 1.75 | [-9.58160, 13.08160] |
| Lines/piece | 0.37140 | 0.38430 | 0.01290 | [0.00819, 0.01761] |
| Survival | 0.93242 | 1.00000 | 0.06758 | [0.03416, 0.10100] |

Hard topped out in 17/100 games; Expert topped out in 0/100 games. Expert is
therefore materially safer, but Hard still has significantly higher attack
efficiency while alive. Total attack is statistically indistinguishable because
Expert survives longer.

## Reinforcement-learning gate

The CEM runs continued to find validation improvements, so the optimization is
not yet demonstrably at a plateau. The reinforcement-learning condition was not
met. Before RL, increase the fixed-node budget toward the node count reached by
the production 50 ms search and optimize the attack/survival Pareto frontier.
