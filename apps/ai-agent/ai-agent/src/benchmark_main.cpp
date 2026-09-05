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
#include <memory>
#include <mutex>
#include <numeric>
#include <optional>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#include <nlohmann/json.hpp>

#include "tetris/agent.hpp"
#include "tetris/game_simulator.hpp"
#include "tetris/terminal_renderer.hpp"

namespace {

struct Options {
  std::string model = "easy";
  std::size_t games = 5;
  std::uint32_t seed = 42;
  std::size_t maxPieces = 5000;
  std::size_t jobs = 1;
  std::string format = "table";
  bool preview = false;
  std::uint64_t delayMs = 100;
  std::uint64_t thinkTimeMs = 50;
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
            "  --preview            Color terminal preview (requires jobs=1)\n"
            "  --delay-ms N         Preview delay per piece (default: 100)\n"
            "  --think-ms N         Hard/Expert budget per piece (default: 50)\n"
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
    if (argument == "--preview") {
      options.preview = true;
      continue;
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
    } else if (argument == "--delay-ms") {
      options.delayMs = parseUnsigned(value, argument);
    } else if (argument == "--think-ms") {
      options.thinkTimeMs = parseUnsigned(value, argument);
    } else {
      throw std::invalid_argument("unknown option: " + argument);
    }
  }

  if (options.games == 0) throw std::invalid_argument("--games must be positive");
  if (options.maxPieces == 0) {
    throw std::invalid_argument("--max-pieces must be positive");
  }
  if (options.jobs == 0) throw std::invalid_argument("--jobs must be positive");
  if (options.thinkTimeMs == 0) {
    throw std::invalid_argument("--think-ms must be positive");
  }
  if (options.format != "table" && options.format != "json" &&
      options.format != "csv") {
    throw std::invalid_argument("--format must be table, json, or csv");
  }
  if (options.preview && options.jobs != 1) {
    throw std::invalid_argument("--preview requires --jobs 1");
  }
  if (options.preview && options.format != "table") {
    throw std::invalid_argument("--preview requires --format table");
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
      {"attacks_sent", game.attacksSent},
      {"singles", game.singles},
      {"doubles", game.doubles},
      {"triples", game.triples},
      {"tetrises", game.tetrises},
      {"t_spins", game.tSpins},
      {"t_spin_minis", game.tSpinMinis},
      {"t_spin_singles", game.tSpinSingles},
      {"t_spin_doubles", game.tSpinDoubles},
      {"t_spin_triples", game.tSpinTriples},
      {"perfect_clears", game.perfectClears},
      {"holds", game.holdsUsed},
      {"b2b_clears", game.backToBackClears},
      {"b2b_continuations", game.backToBackContinuations},
      {"b2b_breaks", game.backToBackBreaks},
      {"current_b2b", game.currentBackToBack},
      {"max_b2b", game.maxBackToBack},
      {"game_over", game.gameOver},
      {"piece_limit_reached", game.reachedPieceLimit},
      {"invalid_decision", game.invalidDecision},
      {"search_nodes", game.searchNodes},
      {"average_search_depth", game.averageSearchDepth()},
      {"max_search_depth", game.maxSearchDepth},
      {"timed_out_decisions", game.timedOutDecisions},
      {"elapsed_ms", game.elapsedMs},
      {"average_decision_ms", game.averageDecisionMs()},
      {"max_decision_ms", game.maxDecisionMs},
  };
}

std::vector<tetris::GameResult> runGames(
    const Options& options, tetris::TerminalRenderer* renderer) {
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
          auto agent =
              tetris::createAgent(options.model, options.thinkTimeMs);
          const std::uint32_t gameSeed =
              options.seed + static_cast<std::uint32_t>(gameIndex);
          tetris::FrameCallback onFrame;
          if (renderer) {
            onFrame = [&, gameIndex](const tetris::Board& board,
                                     const tetris::GameResult& result,
                                     tetris::PieceType placedPiece,
                                     int clearedThisMove,
                                     std::optional<tetris::PieceType> holdPiece) {
              renderer->render(gameIndex + 1, options.model, board, result,
                               placedPiece, clearedThisMove, holdPiece);
            };
          }
          results[gameIndex] = tetris::simulateGame(
              *agent, gameSeed, options.maxPieces, onFrame);
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
            << " jobs=" << options.jobs
            << " think_ms=" << options.thinkTimeMs << "\n\n";
  std::cout << "game  seed        lines    score        attack  pieces  holds  tetris"
               "  tspin  tsm  ts1  ts2  ts3  b2bmax  brk  depth  nodes"
               "       avg_decision  result\n";
  for (std::size_t index = 0; index < games.size(); ++index) {
    const auto& game = games[index];
    const char* status = game.invalidDecision
                             ? "INVALID"
                             : game.gameOver ? "GAME_OVER" : "CAPPED";
    std::cout << std::setw(4) << index + 1 << "  " << std::setw(10)
              << game.seed << "  " << std::setw(7) << game.linesCleared << "  "
              << std::setw(12) << game.score << "  " << std::setw(6)
              << game.attacksSent << "  " << std::setw(6)
              << game.piecesPlaced << "  " << std::setw(5) << game.holdsUsed
              << "  " << std::setw(6) << game.tetrises << "  "
              << std::setw(5) << game.tSpins << "  " << std::setw(3)
              << game.tSpinMinis << "  " << std::setw(3)
              << game.tSpinSingles << "  " << std::setw(3)
              << game.tSpinDoubles << "  " << std::setw(3)
              << game.tSpinTriples << "  " << std::setw(6)
              << game.maxBackToBack << "  " << std::setw(3)
              << game.backToBackBreaks << "  " << std::fixed
              << std::setprecision(2)
              << std::setw(5) << game.averageSearchDepth() << "  "
              << std::setw(10) << game.searchNodes << "  "
              << std::setprecision(3)
              << std::setw(9) << game.averageDecisionMs() << " ms  " << status
              << '\n';
  }

  const Statistics lines = statisticsFor(
      games, [](const auto& game) { return game.linesCleared; });
  const Statistics scores =
      statisticsFor(games, [](const auto& game) { return game.score; });
  const Statistics attacks = statisticsFor(
      games, [](const auto& game) { return game.attacksSent; });
  const Statistics pieces = statisticsFor(
      games, [](const auto& game) { return game.piecesPlaced; });
  const Statistics decisions = statisticsFor(
      games, [](const auto& game) { return game.averageDecisionMs(); });
  const Statistics depths = statisticsFor(
      games, [](const auto& game) { return game.averageSearchDepth(); });
  const Statistics tSpinMinis = statisticsFor(
      games, [](const auto& game) { return game.tSpinMinis; });
  const Statistics tSpinSingles = statisticsFor(
      games, [](const auto& game) { return game.tSpinSingles; });
  const Statistics tSpinDoubles = statisticsFor(
      games, [](const auto& game) { return game.tSpinDoubles; });
  const Statistics tSpinTriples = statisticsFor(
      games, [](const auto& game) { return game.tSpinTriples; });
  const Statistics maxBackToBack = statisticsFor(
      games, [](const auto& game) { return game.maxBackToBack; });
  const Statistics backToBackBreaks = statisticsFor(
      games, [](const auto& game) { return game.backToBackBreaks; });
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
  printStatistic("attack", attacks);
  printStatistic("pieces", pieces);
  printStatistic("decision_ms", decisions);
  printStatistic("search_depth", depths);
  printStatistic("tspin_mini", tSpinMinis);
  printStatistic("tspin_single", tSpinSingles);
  printStatistic("tspin_double", tSpinDoubles);
  printStatistic("tspin_triple", tSpinTriples);
  printStatistic("b2b_max", maxBackToBack);
  printStatistic("b2b_breaks", backToBackBreaks);
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
      {"think_ms", options.thinkTimeMs},
  };
  output["games"] = nlohmann::json::array();
  for (const auto& game : games) output["games"].push_back(gameJson(game));

  const Statistics lines = statisticsFor(
      games, [](const auto& game) { return game.linesCleared; });
  const Statistics scores =
      statisticsFor(games, [](const auto& game) { return game.score; });
  const Statistics attacks = statisticsFor(
      games, [](const auto& game) { return game.attacksSent; });
  const Statistics pieces = statisticsFor(
      games, [](const auto& game) { return game.piecesPlaced; });
  const Statistics decisions = statisticsFor(
      games, [](const auto& game) { return game.averageDecisionMs(); });
  const Statistics depths = statisticsFor(
      games, [](const auto& game) { return game.averageSearchDepth(); });
  const Statistics tSpinMinis = statisticsFor(
      games, [](const auto& game) { return game.tSpinMinis; });
  const Statistics tSpinSingles = statisticsFor(
      games, [](const auto& game) { return game.tSpinSingles; });
  const Statistics tSpinDoubles = statisticsFor(
      games, [](const auto& game) { return game.tSpinDoubles; });
  const Statistics tSpinTriples = statisticsFor(
      games, [](const auto& game) { return game.tSpinTriples; });
  const Statistics maxBackToBack = statisticsFor(
      games, [](const auto& game) { return game.maxBackToBack; });
  const Statistics backToBackBreaks = statisticsFor(
      games, [](const auto& game) { return game.backToBackBreaks; });
  output["summary"] = {
      {"lines", statisticsJson(lines)},
      {"score", statisticsJson(scores)},
      {"attacks_sent", statisticsJson(attacks)},
      {"pieces", statisticsJson(pieces)},
      {"decision_ms", statisticsJson(decisions)},
      {"search_depth", statisticsJson(depths)},
      {"t_spin_minis", statisticsJson(tSpinMinis)},
      {"t_spin_singles", statisticsJson(tSpinSingles)},
      {"t_spin_doubles", statisticsJson(tSpinDoubles)},
      {"t_spin_triples", statisticsJson(tSpinTriples)},
      {"max_b2b", statisticsJson(maxBackToBack)},
      {"b2b_breaks", statisticsJson(backToBackBreaks)},
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
  std::cout << "model,game,seed,lines,score,attacks_sent,pieces,singles,doubles,triples,"
               "tetrises,t_spins,t_spin_minis,t_spin_singles,t_spin_doubles,"
               "t_spin_triples,perfect_clears,holds,b2b_clears,"
               "b2b_continuations,b2b_breaks,current_b2b,max_b2b,game_over,"
               "piece_limit_reached,"
               "invalid_decision,search_nodes,average_search_depth,"
               "max_search_depth,timed_out_decisions,elapsed_ms,"
               "average_decision_ms,max_decision_ms\n";
  for (std::size_t index = 0; index < games.size(); ++index) {
    const auto& game = games[index];
    std::cout << model << ',' << index + 1 << ',' << game.seed << ','
              << game.linesCleared << ',' << game.score << ','
              << game.attacksSent << ',' << game.piecesPlaced << ','
              << game.singles << ',' << game.doubles
              << ',' << game.triples << ',' << game.tetrises << ','
              << game.tSpins << ',' << game.tSpinMinis << ','
              << game.tSpinSingles << ','
              << game.tSpinDoubles << ',' << game.tSpinTriples << ','
              << game.perfectClears << ','
              << game.holdsUsed << ',' << game.backToBackClears << ','
              << game.backToBackContinuations << ',' << game.backToBackBreaks
              << ',' << game.currentBackToBack << ',' << game.maxBackToBack
              << ','
              << (game.gameOver ? 1 : 0) << ','
              << (game.reachedPieceLimit ? 1 : 0) << ','
              << (game.invalidDecision ? 1 : 0) << ',' << game.searchNodes
              << ',' << game.averageSearchDepth() << ',' << game.maxSearchDepth
              << ',' << game.timedOutDecisions << ',' << std::fixed
              << std::setprecision(6) << game.elapsedMs << ','
              << game.averageDecisionMs() << ',' << game.maxDecisionMs << '\n';
  }
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parseOptions(argc, argv);
    std::unique_ptr<tetris::TerminalRenderer> renderer;
    if (options.preview) {
      renderer = std::make_unique<tetris::TerminalRenderer>(options.delayMs);
    }
    const auto games = runGames(options, renderer.get());
    if (renderer) renderer->finish();
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
