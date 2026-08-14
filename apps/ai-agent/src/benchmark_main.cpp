#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <iomanip>
#include <iostream>
#include <limits>
#include <mutex>
#include <numeric>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <nlohmann/json.hpp>

#include "tetris/agent.hpp"
#include "tetris/game_simulator.hpp"

namespace {

struct Options {
  std::string model = "easy";
  std::size_t games = 5;
  std::uint32_t seed = 42;
  std::size_t maxPieces = 5000;
  std::size_t jobs = 1;
  std::string format = "table";
};

struct Statistics {
  double mean = 0.0;
  double median = 0.0;
  double minimum = 0.0;
  double maximum = 0.0;
  double standardDeviation = 0.0;
  double percentile95 = 0.0;
};

void printUsage(std::ostream& output) {
  output << "Usage: ai_benchmark [options]\n"
            "  --model NAME         AI model (default: easy)\n"
            "  --games N            Number of games (default: 5)\n"
            "  --seed N             First uint32 seed (default: 42)\n"
            "  --max-pieces N       Per-game safety limit (default: 5000)\n"
            "  --jobs N             Parallel games (default: 1)\n"
            "  --format table|json|csv\n"
            "  --list-models\n"
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

Options parseOptions(int argc, char** argv) {
  Options options;
  for (int index = 1; index < argc; ++index) {
    const std::string argument = argv[index];
    if (argument == "--help") {
      printUsage(std::cout);
      std::exit(0);
    }
    if (argument == "--list-models") {
      for (const std::string_view name : tetris::availableAgentNames()) {
        std::cout << name << '\n';
      }
      std::exit(0);
    }
    if (index + 1 >= argc) {
      throw std::invalid_argument("missing value for " + argument);
    }
    const std::string value = argv[++index];
    if (argument == "--model") {
      options.model = value;
    } else if (argument == "--games") {
      options.games = parseUnsigned(value, argument);
    } else if (argument == "--seed") {
      const auto seed = parseUnsigned(value, argument);
      if (seed > std::numeric_limits<std::uint32_t>::max()) {
        throw std::invalid_argument("--seed exceeds uint32");
      }
      options.seed = static_cast<std::uint32_t>(seed);
    } else if (argument == "--max-pieces") {
      options.maxPieces = parseUnsigned(value, argument);
    } else if (argument == "--jobs") {
      options.jobs = parseUnsigned(value, argument);
    } else if (argument == "--format") {
      options.format = value;
    } else {
      throw std::invalid_argument("unknown option: " + argument);
    }
  }

  if (options.games == 0) throw std::invalid_argument("--games must be positive");
  if (options.maxPieces == 0) {
    throw std::invalid_argument("--max-pieces must be positive");
  }
  if (options.jobs == 0) throw std::invalid_argument("--jobs must be positive");
  if (options.format != "table" && options.format != "json" &&
      options.format != "csv") {
    throw std::invalid_argument("--format must be table, json, or csv");
  }
  (void)tetris::createAgent(options.model);
  return options;
}

Statistics calculateStatistics(std::vector<double> values) {
  Statistics result;
  if (values.empty()) return result;
  std::sort(values.begin(), values.end());
  result.minimum = values.front();
  result.maximum = values.back();
  result.mean =
      std::accumulate(values.begin(), values.end(), 0.0) / values.size();
  const std::size_t middle = values.size() / 2;
  result.median = values.size() % 2 == 0
                      ? (values[middle - 1] + values[middle]) / 2.0
                      : values[middle];
  double variance = 0.0;
  for (const double value : values) {
    const double difference = value - result.mean;
    variance += difference * difference;
  }
  result.standardDeviation = std::sqrt(variance / values.size());
  const std::size_t percentileIndex = static_cast<std::size_t>(
      std::ceil(0.95 * static_cast<double>(values.size()))) - 1;
  result.percentile95 = values[percentileIndex];
  return result;
}

template <typename Selector>
Statistics statisticsFor(const std::vector<tetris::GameResult>& games,
                         Selector selector) {
  std::vector<double> values;
  values.reserve(games.size());
  for (const auto& game : games) values.push_back(selector(game));
  return calculateStatistics(std::move(values));
}

nlohmann::json statisticsJson(const Statistics& statistics) {
  return {
      {"mean", statistics.mean},
      {"median", statistics.median},
      {"min", statistics.minimum},
      {"max", statistics.maximum},
      {"stddev", statistics.standardDeviation},
      {"p95", statistics.percentile95},
  };
}

nlohmann::json gameJson(const tetris::GameResult& game) {
  return {
      {"seed", game.seed},
      {"pieces", game.piecesPlaced},
      {"lines", game.linesCleared},
      {"score", game.score},
      {"singles", game.singles},
      {"doubles", game.doubles},
      {"triples", game.triples},
      {"tetrises", game.tetrises},
      {"t_spins", game.tSpins},
      {"perfect_clears", game.perfectClears},
      {"game_over", game.gameOver},
      {"piece_limit_reached", game.reachedPieceLimit},
      {"invalid_decision", game.invalidDecision},
      {"elapsed_ms", game.elapsedMs},
      {"average_decision_ms", game.averageDecisionMs()},
      {"max_decision_ms", game.maxDecisionMs},
  };
}

std::vector<tetris::GameResult> runGames(const Options& options) {
  std::vector<tetris::GameResult> results(options.games);
  std::atomic<std::size_t> nextGame{0};
  const std::size_t workerCount = std::min(options.jobs, options.games);
  std::vector<std::thread> workers;
  workers.reserve(workerCount);
  std::exception_ptr workerError;
  std::mutex workerErrorMutex;

  for (std::size_t worker = 0; worker < workerCount; ++worker) {
    workers.emplace_back([&]() {
      try {
        while (true) {
          const std::size_t gameIndex = nextGame.fetch_add(1);
          if (gameIndex >= options.games) return;
          auto agent = tetris::createAgent(options.model);
          const std::uint32_t gameSeed =
              options.seed + static_cast<std::uint32_t>(gameIndex);
          results[gameIndex] =
              tetris::simulateGame(*agent, gameSeed, options.maxPieces);
        }
      } catch (...) {
        nextGame.store(options.games);
        const std::lock_guard<std::mutex> lock(workerErrorMutex);
        if (!workerError) workerError = std::current_exception();
      }
    });
  }
  for (auto& worker : workers) worker.join();
  if (workerError) std::rethrow_exception(workerError);
  return results;
}

void printTable(const Options& options,
                const std::vector<tetris::GameResult>& games) {
  std::cout << "model=" << options.model << " games=" << options.games
            << " seed=" << options.seed
            << " max_pieces=" << options.maxPieces
            << " jobs=" << options.jobs << "\n\n";
  std::cout << "game  seed        lines    score        pieces  avg_decision  result\n";
  for (std::size_t index = 0; index < games.size(); ++index) {
    const auto& game = games[index];
    const char* status = game.invalidDecision
                             ? "INVALID"
                             : game.gameOver ? "GAME_OVER" : "CAPPED";
    std::cout << std::setw(4) << index + 1 << "  " << std::setw(10)
              << game.seed << "  " << std::setw(7) << game.linesCleared << "  "
              << std::setw(12) << game.score << "  " << std::setw(6)
              << game.piecesPlaced << "  " << std::fixed << std::setprecision(3)
              << std::setw(9) << game.averageDecisionMs() << " ms  " << status
              << '\n';
  }

  const Statistics lines = statisticsFor(
      games, [](const auto& game) { return game.linesCleared; });
  const Statistics scores =
      statisticsFor(games, [](const auto& game) { return game.score; });
  const Statistics pieces = statisticsFor(
      games, [](const auto& game) { return game.piecesPlaced; });
  const Statistics decisions = statisticsFor(
      games, [](const auto& game) { return game.averageDecisionMs(); });
  const auto gameOvers = std::count_if(
      games.begin(), games.end(), [](const auto& game) { return game.gameOver; });

  std::cout << "\nsummary (mean / median / min / max / p95)\n";
  auto printStatistic = [](std::string_view label, const Statistics& value) {
    std::cout << std::left << std::setw(15) << label << std::right << std::fixed
              << std::setprecision(2) << value.mean << " / " << value.median
              << " / " << value.minimum << " / " << value.maximum << " / "
              << value.percentile95 << '\n';
  };
  printStatistic("lines", lines);
  printStatistic("score", scores);
  printStatistic("pieces", pieces);
  printStatistic("decision_ms", decisions);
  std::cout << "game_over     " << gameOvers << "/" << games.size() << '\n';
}

void printJson(const Options& options,
               const std::vector<tetris::GameResult>& games) {
  nlohmann::json output;
  output["config"] = {
      {"model", options.model},
      {"games", options.games},
      {"seed", options.seed},
      {"max_pieces", options.maxPieces},
      {"jobs", options.jobs},
  };
  output["games"] = nlohmann::json::array();
  for (const auto& game : games) output["games"].push_back(gameJson(game));

  const Statistics lines = statisticsFor(
      games, [](const auto& game) { return game.linesCleared; });
  const Statistics scores =
      statisticsFor(games, [](const auto& game) { return game.score; });
  const Statistics pieces = statisticsFor(
      games, [](const auto& game) { return game.piecesPlaced; });
  const Statistics decisions = statisticsFor(
      games, [](const auto& game) { return game.averageDecisionMs(); });
  output["summary"] = {
      {"lines", statisticsJson(lines)},
      {"score", statisticsJson(scores)},
      {"pieces", statisticsJson(pieces)},
      {"decision_ms", statisticsJson(decisions)},
      {"games_over",
       std::count_if(games.begin(), games.end(),
                     [](const auto& game) { return game.gameOver; })},
      {"capped_games",
       std::count_if(games.begin(), games.end(), [](const auto& game) {
         return game.reachedPieceLimit;
       })},
  };
  std::cout << output.dump(2) << '\n';
}

void printCsv(const std::string& model,
              const std::vector<tetris::GameResult>& games) {
  std::cout << "model,game,seed,lines,score,pieces,singles,doubles,triples,"
               "tetrises,t_spins,perfect_clears,game_over,piece_limit_reached,"
               "invalid_decision,elapsed_ms,average_decision_ms,max_decision_ms\n";
  for (std::size_t index = 0; index < games.size(); ++index) {
    const auto& game = games[index];
    std::cout << model << ',' << index + 1 << ',' << game.seed << ','
              << game.linesCleared << ',' << game.score << ','
              << game.piecesPlaced << ',' << game.singles << ',' << game.doubles
              << ',' << game.triples << ',' << game.tetrises << ','
              << game.tSpins << ',' << game.perfectClears << ','
              << (game.gameOver ? 1 : 0) << ','
              << (game.reachedPieceLimit ? 1 : 0) << ','
              << (game.invalidDecision ? 1 : 0) << ',' << std::fixed
              << std::setprecision(6) << game.elapsedMs << ','
              << game.averageDecisionMs() << ',' << game.maxDecisionMs << '\n';
  }
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parseOptions(argc, argv);
    const auto games = runGames(options);
    if (options.format == "json") {
      printJson(options, games);
    } else if (options.format == "csv") {
      printCsv(options.model, games);
    } else {
      printTable(options, games);
    }
  } catch (const std::exception& error) {
    std::cerr << "error: " << error.what() << "\n\n";
    printUsage(std::cerr);
    return 1;
  }
  return 0;
}
