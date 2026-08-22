#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <limits>
#include <mutex>
#include <random>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include <nlohmann/json.hpp>

#include "tetris/expert_agent.hpp"
#include "tetris/game_simulator.hpp"

namespace {

struct Options {
  std::size_t iterations = 4;
  std::size_t population = 8;
  std::size_t elite = 2;
  std::size_t games = 2;
  std::uint32_t seed = 42;
  std::size_t validationGames = 4;
  std::uint32_t validationSeed = 1000000;
  std::uint64_t optimizerSeed = 1;
  std::size_t maxPieces = 80;
  std::uint64_t maxNodes = 6000;
  std::size_t jobs = 1;
  double initialStddev = 0.35;
};

using WeightMember = double tetris::ExpertWeights::*;

struct TunedParameter {
  std::string_view name;
  WeightMember member;
};

constexpr std::array<TunedParameter, 26> kParameters{{
    {"board_stability_multiplier",
     &tetris::ExpertWeights::boardStabilityMultiplier},
    {"aggregate_height_penalty",
     &tetris::ExpertWeights::aggregateHeightPenalty},
    {"holes_penalty", &tetris::ExpertWeights::holesPenalty},
    {"holes_quadratic_penalty",
     &tetris::ExpertWeights::holesQuadraticPenalty},
    {"covered_hole_penalty", &tetris::ExpertWeights::coveredHolePenalty},
    {"bumpiness_penalty", &tetris::ExpertWeights::bumpinessPenalty},
    {"maximum_height_penalty",
     &tetris::ExpertWeights::maximumHeightPenalty},
    {"clean_board_reward", &tetris::ExpertWeights::cleanBoardReward},
    {"well_reward", &tetris::ExpertWeights::wellReward},
    {"edge_well_reward", &tetris::ExpertWeights::edgeWellReward},
    {"ready_tsd_reward", &tetris::ExpertWeights::readyTSpinDoubleReward},
    {"completed_tsd_pattern_reward",
     &tetris::ExpertWeights::completedTSpinDoublePatternReward},
    {"completed_tsd_break_penalty",
     &tetris::ExpertWeights::completedTSpinDoubleBreakPenalty},
    {"pre_tsd_reward", &tetris::ExpertWeights::preTSpinDoubleReward},
    {"well_distance_0_penalty",
     &tetris::ExpertWeights::wellDistance0Penalty},
    {"well_distance_1_penalty",
     &tetris::ExpertWeights::wellDistance1Penalty},
    {"well_distance_2_reward",
     &tetris::ExpertWeights::wellDistance2Reward},
    {"well_distance_3_reward",
     &tetris::ExpertWeights::wellDistance3Reward},
    {"well_distance_4_reward",
     &tetris::ExpertWeights::wellDistance4Reward},
    {"danger_quadratic_penalty",
     &tetris::ExpertWeights::dangerQuadraticPenalty},
    {"danger_linear_penalty",
     &tetris::ExpertWeights::dangerLinearPenalty},
    {"garbage_reward", &tetris::ExpertWeights::garbageReward},
    {"tspin_double_reward", &tetris::ExpertWeights::tSpinDoubleReward},
    {"b2b_continuation_reward",
     &tetris::ExpertWeights::backToBackContinuationReward},
    {"b2b_break_penalty", &tetris::ExpertWeights::backToBackBreakPenalty},
    {"t_wasted_penalty", &tetris::ExpertWeights::tWastedPenalty},
}};

struct Evaluation {
  double fitness = 0.0;
  double attacksPerPiece = 0.0;
  double linesPerPiece = 0.0;
  double survivalRate = 0.0;
  double averageMaxBackToBack = 0.0;
  std::size_t gamesOver = 0;
};

struct Candidate {
  std::array<double, kParameters.size()> logMultipliers{};
  tetris::ExpertWeights weights;
  Evaluation evaluation;
};

void printUsage(std::ostream& output) {
  output << "Usage: ai_tune [options]\n"
            "  --iterations N       CEM generations (default: 4)\n"
            "  --population N       Candidates per generation (default: 8)\n"
            "  --elite N            Elite candidates (default: 2)\n"
            "  --games N            Common game seeds per candidate (default: 2)\n"
            "  --seed N             First game seed (default: 42)\n"
            "  --validation-games N Holdout games (default: 4)\n"
            "  --validation-seed N  First holdout seed (default: 1000000)\n"
            "  --optimizer-seed N   Sampling seed (default: 1)\n"
            "  --max-pieces N       Pieces per game (default: 80)\n"
            "  --max-nodes N        Search nodes per decision (default: 6000)\n"
            "  --jobs N             Parallel games (default: 1)\n"
            "  --stddev X           Initial log-space stddev (default: 0.35)\n"
            "  --help\n";
}

std::uint64_t parseUnsigned(const std::string& value,
                            const std::string& option) {
  std::size_t parsedLength = 0;
  std::uint64_t parsed = 0;
  try {
    parsed = std::stoull(value, &parsedLength);
  } catch (const std::exception&) {
    throw std::invalid_argument(option + " requires a non-negative integer");
  }
  if (parsedLength != value.size()) {
    throw std::invalid_argument(option + " requires a non-negative integer");
  }
  return parsed;
}

double parsePositiveDouble(const std::string& value,
                           const std::string& option) {
  std::size_t parsedLength = 0;
  double parsed = 0.0;
  try {
    parsed = std::stod(value, &parsedLength);
  } catch (const std::exception&) {
    throw std::invalid_argument(option + " requires a positive number");
  }
  if (parsedLength != value.size() || !std::isfinite(parsed) || parsed <= 0.0) {
    throw std::invalid_argument(option + " requires a positive number");
  }
  return parsed;
}

Options parseOptions(int argc, char** argv) {
  Options options;
  for (int index = 1; index < argc; ++index) {
    const std::string argument = argv[index];
    if (argument == "--help") {
      printUsage(std::cout);
      std::exit(0);
    }
    if (index + 1 >= argc) {
      throw std::invalid_argument("missing value for " + argument);
    }
    const std::string value = argv[++index];
    if (argument == "--iterations") {
      options.iterations = parseUnsigned(value, argument);
    } else if (argument == "--population") {
      options.population = parseUnsigned(value, argument);
    } else if (argument == "--elite") {
      options.elite = parseUnsigned(value, argument);
    } else if (argument == "--games") {
      options.games = parseUnsigned(value, argument);
    } else if (argument == "--seed") {
      const std::uint64_t seed = parseUnsigned(value, argument);
      if (seed > std::numeric_limits<std::uint32_t>::max()) {
        throw std::invalid_argument("--seed exceeds uint32");
      }
      options.seed = static_cast<std::uint32_t>(seed);
    } else if (argument == "--validation-games") {
      options.validationGames = parseUnsigned(value, argument);
    } else if (argument == "--validation-seed") {
      const std::uint64_t seed = parseUnsigned(value, argument);
      if (seed > std::numeric_limits<std::uint32_t>::max()) {
        throw std::invalid_argument("--validation-seed exceeds uint32");
      }
      options.validationSeed = static_cast<std::uint32_t>(seed);
    } else if (argument == "--optimizer-seed") {
      options.optimizerSeed = parseUnsigned(value, argument);
    } else if (argument == "--max-pieces") {
      options.maxPieces = parseUnsigned(value, argument);
    } else if (argument == "--max-nodes") {
      options.maxNodes = parseUnsigned(value, argument);
    } else if (argument == "--jobs") {
      options.jobs = parseUnsigned(value, argument);
    } else if (argument == "--stddev") {
      options.initialStddev = parsePositiveDouble(value, argument);
    } else {
      throw std::invalid_argument("unknown option: " + argument);
    }
  }

  if (options.iterations == 0 || options.population == 0 ||
      options.elite == 0 || options.games == 0 ||
      options.validationGames == 0 || options.maxPieces == 0 ||
      options.maxNodes == 0 || options.jobs == 0) {
    throw std::invalid_argument("count and budget options must be positive");
  }
  if (options.elite > options.population) {
    throw std::invalid_argument("--elite cannot exceed --population");
  }
  return options;
}

tetris::ExpertWeights makeWeights(
    const std::array<double, kParameters.size()>& logMultipliers) {
  tetris::ExpertWeights weights;
  const tetris::ExpertWeights baseline;
  for (std::size_t index = 0; index < kParameters.size(); ++index) {
    weights.*(kParameters[index].member) =
        baseline.*(kParameters[index].member) *
        std::exp(logMultipliers[index]);
  }
  return weights;
}

Evaluation evaluate(const Options& options,
                    const tetris::ExpertWeights& weights) {
  std::vector<tetris::GameResult> results(options.games);
  std::atomic<std::size_t> nextGame{0};
  std::vector<std::thread> workers;
  const std::size_t workerCount = std::min(options.jobs, options.games);
  workers.reserve(workerCount);
  std::exception_ptr workerError;
  std::mutex workerErrorMutex;
  for (std::size_t worker = 0; worker < workerCount; ++worker) {
    workers.emplace_back([&]() {
      try {
        while (true) {
          const std::size_t gameIndex = nextGame.fetch_add(1);
          if (gameIndex >= options.games) return;
          tetris::ExpertAgent agent(std::chrono::milliseconds(1), weights,
                                    options.maxNodes);
          const std::uint32_t gameSeed =
              options.seed + static_cast<std::uint32_t>(gameIndex);
          results[gameIndex] =
              tetris::simulateGame(agent, gameSeed, options.maxPieces);
        }
      } catch (...) {
        nextGame.store(options.games);
        const std::lock_guard<std::mutex> lock(workerErrorMutex);
        if (!workerError) workerError = std::current_exception();
      }
    });
  }
  for (std::thread& worker : workers) worker.join();
  if (workerError) std::rethrow_exception(workerError);

  Evaluation evaluation;
  for (const tetris::GameResult& game : results) {
    const double pieces = static_cast<double>(
        std::max<std::size_t>(game.piecesPlaced, 1));
    const double survival = static_cast<double>(game.piecesPlaced) /
                            static_cast<double>(options.maxPieces);
    evaluation.attacksPerPiece += game.attacksSent / pieces;
    evaluation.linesPerPiece += game.linesCleared / pieces;
    evaluation.survivalRate += survival;
    evaluation.averageMaxBackToBack += game.maxBackToBack;
    if (game.gameOver) ++evaluation.gamesOver;
  }

  const double games = static_cast<double>(options.games);
  evaluation.attacksPerPiece /= games;
  evaluation.linesPerPiece /= games;
  evaluation.survivalRate /= games;
  evaluation.averageMaxBackToBack /= games;
  const double gameOverRate = evaluation.gamesOver / games;
  evaluation.fitness = 100.0 * evaluation.attacksPerPiece +
                       25.0 * evaluation.survivalRate +
                       2.0 * evaluation.linesPerPiece +
                       0.20 * evaluation.averageMaxBackToBack -
                       30.0 * gameOverRate;
  return evaluation;
}

nlohmann::json weightsJson(const tetris::ExpertWeights& weights) {
  nlohmann::json output;
  for (const TunedParameter& parameter : kParameters) {
    output[parameter.name] = weights.*(parameter.member);
  }
  return output;
}

nlohmann::json evaluationJson(const Evaluation& evaluation) {
  return {
      {"fitness", evaluation.fitness},
      {"attacks_per_piece", evaluation.attacksPerPiece},
      {"lines_per_piece", evaluation.linesPerPiece},
      {"survival_rate", evaluation.survivalRate},
      {"average_max_b2b", evaluation.averageMaxBackToBack},
      {"games_over", evaluation.gamesOver},
  };
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parseOptions(argc, argv);
    std::mt19937_64 random(options.optimizerSeed);
    std::normal_distribution<double> normal(0.0, 1.0);
    std::array<double, kParameters.size()> mean{};
    std::array<double, kParameters.size()> stddev{};
    stddev.fill(options.initialStddev);

    Candidate globalBest;
    globalBest.evaluation.fitness =
        -std::numeric_limits<double>::infinity();
    Evaluation baselineEvaluation;

    std::cout << "CEM Expert tuning: iterations=" << options.iterations
              << " population=" << options.population
              << " elite=" << options.elite << " games=" << options.games
              << " seed=" << options.seed
              << " max_pieces=" << options.maxPieces
              << " max_nodes=" << options.maxNodes
              << " jobs=" << options.jobs << '\n';

    for (std::size_t iteration = 0; iteration < options.iterations;
         ++iteration) {
      std::vector<Candidate> candidates(options.population);
      for (std::size_t candidateIndex = 0;
           candidateIndex < candidates.size(); ++candidateIndex) {
        Candidate& candidate = candidates[candidateIndex];
        for (std::size_t parameter = 0; parameter < kParameters.size();
             ++parameter) {
          candidate.logMultipliers[parameter] =
              candidateIndex == 0
                  ? mean[parameter]
                  : mean[parameter] + stddev[parameter] * normal(random);
        }
        candidate.weights = makeWeights(candidate.logMultipliers);
        candidate.evaluation = evaluate(options, candidate.weights);
        if (iteration == 0 && candidateIndex == 0) {
          baselineEvaluation = candidate.evaluation;
        }
        if (candidate.evaluation.fitness > globalBest.evaluation.fitness) {
          globalBest = candidate;
        }
      }

      std::stable_sort(candidates.begin(), candidates.end(),
                       [](const Candidate& left, const Candidate& right) {
                         return left.evaluation.fitness >
                                right.evaluation.fitness;
                       });

      for (std::size_t parameter = 0; parameter < kParameters.size();
           ++parameter) {
        double eliteMean = 0.0;
        for (std::size_t elite = 0; elite < options.elite; ++elite) {
          eliteMean += candidates[elite].logMultipliers[parameter];
        }
        eliteMean /= static_cast<double>(options.elite);
        double variance = 0.0;
        for (std::size_t elite = 0; elite < options.elite; ++elite) {
          const double difference =
              candidates[elite].logMultipliers[parameter] - eliteMean;
          variance += difference * difference;
        }
        variance /= static_cast<double>(options.elite);
        const double eliteStddev = std::sqrt(variance);
        mean[parameter] = 0.30 * mean[parameter] + 0.70 * eliteMean;
        stddev[parameter] = std::max(
            0.05, 0.30 * stddev[parameter] + 0.70 * eliteStddev);
      }

      const Evaluation& best = candidates.front().evaluation;
      std::cout << "iteration " << std::setw(2) << iteration + 1
                << "  fitness=" << std::fixed << std::setprecision(4)
                << best.fitness << "  attack/piece="
                << best.attacksPerPiece << "  survival=" << best.survivalRate
                << "  max_b2b=" << best.averageMaxBackToBack << '\n';
    }

    Options validationOptions = options;
    validationOptions.games = options.validationGames;
    validationOptions.seed = options.validationSeed;
    const tetris::ExpertWeights baselineWeights;
    const Evaluation baselineValidation =
        evaluate(validationOptions, baselineWeights);
    const Evaluation bestValidation =
        evaluate(validationOptions, globalBest.weights);
    const bool accepted =
        bestValidation.fitness > baselineValidation.fitness;
    const tetris::ExpertWeights& recommendedWeights =
        accepted ? globalBest.weights : baselineWeights;

    nlohmann::json output{
        {"method", "cross_entropy_method"},
        {"training",
         {{"baseline", evaluationJson(baselineEvaluation)},
          {"best", evaluationJson(globalBest.evaluation)}}},
        {"validation",
         {{"seed", options.validationSeed},
          {"games", options.validationGames},
          {"baseline", evaluationJson(baselineValidation)},
          {"best", evaluationJson(bestValidation)},
          {"accepted", accepted}}},
        {"sampled_best_weights", weightsJson(globalBest.weights)},
        {"recommended_weights", weightsJson(recommendedWeights)},
    };
    std::cout << "\n" << output.dump(2) << '\n';
  } catch (const std::exception& error) {
    std::cerr << "error: " << error.what() << "\n\n";
    printUsage(std::cerr);
    return 1;
  }
  return 0;
}
