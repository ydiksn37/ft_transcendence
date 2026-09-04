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
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <vector>

#include "tetris/agent.hpp"
#include "tetris/game_simulator.hpp"

namespace {

struct Options {
  std::size_t games = 100;
  std::uint32_t seed = 3000000;
  std::size_t maxPieces = 500;
  std::size_t jobs = 1;
  std::uint64_t thinkTimeMs = 50;
};

struct PairResult {
  tetris::GameResult hard;
  tetris::GameResult expert;
};

struct PairedStatistics {
  double hardMean = 0.0;
  double expertMean = 0.0;
  double differenceMean = 0.0;
  double confidenceLow = 0.0;
  double confidenceHigh = 0.0;
  double expertWinRate = 0.0;
};

void printUsage(std::ostream& output) {
  output << "Usage: ai_compare [options]\n"
            "  --games N          Paired seeds (default: 100)\n"
            "  --seed N           First final-test seed (default: 3000000)\n"
            "  --max-pieces N     Pieces per game (default: 500)\n"
            "  --jobs N           Parallel seed pairs (default: 1)\n"
            "  --think-ms N       Budget per decision/model (default: 50)\n"
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
    if (index + 1 >= argc) {
      throw std::invalid_argument("missing value for " + argument);
    }
    const std::string value = argv[++index];
    if (argument == "--games") {
      options.games = parseUnsigned(value, argument);
    } else if (argument == "--seed") {
      const std::uint64_t seed = parseUnsigned(value, argument);
      if (seed > std::numeric_limits<std::uint32_t>::max()) {
        throw std::invalid_argument("--seed exceeds uint32");
      }
      options.seed = static_cast<std::uint32_t>(seed);
    } else if (argument == "--max-pieces") {
      options.maxPieces = parseUnsigned(value, argument);
    } else if (argument == "--jobs") {
      options.jobs = parseUnsigned(value, argument);
    } else if (argument == "--think-ms") {
      options.thinkTimeMs = parseUnsigned(value, argument);
    } else {
      throw std::invalid_argument("unknown option: " + argument);
    }
  }
  if (options.games == 0 || options.maxPieces == 0 || options.jobs == 0 ||
      options.thinkTimeMs == 0) {
    throw std::invalid_argument("all count and budget options must be positive");
  }
  return options;
}

std::vector<PairResult> runPairs(const Options& options) {
  std::vector<PairResult> results(options.games);
  std::atomic<std::size_t> nextPair{0};
  const std::size_t workerCount = std::min(options.jobs, options.games);
  std::vector<std::thread> workers;
  workers.reserve(workerCount);
  std::exception_ptr workerError;
  std::mutex workerErrorMutex;

  for (std::size_t worker = 0; worker < workerCount; ++worker) {
    workers.emplace_back([&]() {
      try {
        while (true) {
          const std::size_t index = nextPair.fetch_add(1);
          if (index >= options.games) return;
          const std::uint32_t seed =
              options.seed + static_cast<std::uint32_t>(index);
          auto run = [&](std::string_view model) {
            std::unique_ptr<tetris::Agent> agent =
                tetris::createAgent(model, options.thinkTimeMs);
            return tetris::simulateGame(*agent, seed, options.maxPieces);
          };
          // Alternate order so warm caches and CPU frequency do not always
          // favor the same model.
          if (index % 2 == 0) {
            results[index].hard = run("hard");
            results[index].expert = run("expert");
          } else {
            results[index].expert = run("expert");
            results[index].hard = run("hard");
          }
        }
      } catch (...) {
        nextPair.store(options.games);
        const std::lock_guard<std::mutex> lock(workerErrorMutex);
        if (!workerError) workerError = std::current_exception();
      }
    });
  }
  for (std::thread& worker : workers) worker.join();
  if (workerError) std::rethrow_exception(workerError);
  return results;
}

template <typename Selector>
PairedStatistics pairedStatistics(const std::vector<PairResult>& results,
                                  Selector selector) {
  PairedStatistics statistics;
  std::vector<double> differences;
  differences.reserve(results.size());
  std::size_t expertWins = 0;
  for (const PairResult& result : results) {
    const double hard = selector(result.hard);
    const double expert = selector(result.expert);
    statistics.hardMean += hard;
    statistics.expertMean += expert;
    differences.push_back(expert - hard);
    if (expert > hard) ++expertWins;
  }
  const double count = static_cast<double>(results.size());
  statistics.hardMean /= count;
  statistics.expertMean /= count;
  for (const double difference : differences) {
    statistics.differenceMean += difference;
  }
  statistics.differenceMean /= count;

  double squaredDifference = 0.0;
  for (const double difference : differences) {
    const double centered = difference - statistics.differenceMean;
    squaredDifference += centered * centered;
  }
  const double sampleVariance =
      results.size() > 1 ? squaredDifference / (count - 1.0) : 0.0;
  const double margin = 1.96 * std::sqrt(sampleVariance / count);
  statistics.confidenceLow = statistics.differenceMean - margin;
  statistics.confidenceHigh = statistics.differenceMean + margin;
  statistics.expertWinRate = expertWins / count;
  return statistics;
}

void printStatistic(std::string_view name,
                    const PairedStatistics& statistics) {
  std::cout << std::left << std::setw(20) << name << std::right << std::fixed
            << std::setprecision(5) << std::setw(12) << statistics.hardMean
            << std::setw(12) << statistics.expertMean << std::setw(13)
            << statistics.differenceMean << "  [" << statistics.confidenceLow
            << ", " << statistics.confidenceHigh << "]  " << std::setprecision(1)
            << std::setw(6) << statistics.expertWinRate * 100.0 << "%\n";
}

}  // namespace

int main(int argc, char** argv) {
  try {
    const Options options = parseOptions(argc, argv);
    const std::vector<PairResult> results = runPairs(options);
    std::cout << "paired Hard vs Expert: games=" << options.games
              << " seed=" << options.seed
              << " max_pieces=" << options.maxPieces
              << " think_ms=" << options.thinkTimeMs
              << " jobs=" << options.jobs << "\n\n"
              << std::left << std::setw(20) << "metric" << std::right
              << std::setw(12) << "hard" << std::setw(12) << "expert"
              << std::setw(13) << "difference" << "  95% CI"
              << "                 win%\n";

    printStatistic("attack_per_piece", pairedStatistics(
        results, [](const tetris::GameResult& game) {
          return static_cast<double>(game.attacksSent) /
                 std::max<std::size_t>(game.piecesPlaced, 1);
        }));
    printStatistic("total_attack", pairedStatistics(
        results, [](const tetris::GameResult& game) {
          return static_cast<double>(game.attacksSent);
        }));
    printStatistic("lines_per_piece", pairedStatistics(
        results, [](const tetris::GameResult& game) {
          return static_cast<double>(game.linesCleared) /
                 std::max<std::size_t>(game.piecesPlaced, 1);
        }));
    printStatistic("survival", pairedStatistics(
        results, [&](const tetris::GameResult& game) {
          return static_cast<double>(game.piecesPlaced) /
                 static_cast<double>(options.maxPieces);
        }));

    const auto hardGameOvers = std::count_if(
        results.begin(), results.end(),
        [](const PairResult& result) { return result.hard.gameOver; });
    const auto expertGameOvers = std::count_if(
        results.begin(), results.end(),
        [](const PairResult& result) { return result.expert.gameOver; });
    std::cout << "\ngame_over: hard=" << hardGameOvers
              << " expert=" << expertGameOvers << '\n';
  } catch (const std::exception& error) {
    std::cerr << "error: " << error.what() << "\n\n";
    printUsage(std::cerr);
    return 1;
  }
  return 0;
}
