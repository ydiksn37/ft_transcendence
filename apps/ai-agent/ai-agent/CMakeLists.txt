cmake_minimum_required(VERSION 3.20)

project(transcendence_ai_agent LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Keep this version explicit so every developer and Docker build uses the same
# JSON implementation. The pinned single-header release is vendored so Docker
# builds do not depend on GitHub being reachable.
set(NLOHMANN_JSON_VERSION "3.11.3")
set(NLOHMANN_JSON_INCLUDE_DIR
    "${CMAKE_CURRENT_SOURCE_DIR}/third_party")
if(NOT EXISTS "${NLOHMANN_JSON_INCLUDE_DIR}/nlohmann/json.hpp")
  message(FATAL_ERROR
          "vendored nlohmann/json ${NLOHMANN_JSON_VERSION} is missing")
endif()
add_library(nlohmann_json INTERFACE)
add_library(nlohmann_json::nlohmann_json ALIAS nlohmann_json)
target_include_directories(nlohmann_json INTERFACE
                           "${NLOHMANN_JSON_INCLUDE_DIR}")

add_library(ai_engine
  src/agent.cpp
  src/bag.cpp
  src/board.cpp
  src/decision_context.cpp
  src/easy_agent.cpp
  src/expert_agent.cpp
  src/game_simulator.cpp
  src/hard_agent.cpp
)
target_include_directories(ai_engine PUBLIC include)

find_package(Threads REQUIRED)

add_executable(ai_agent src/main.cpp)
target_link_libraries(ai_agent PRIVATE ai_engine nlohmann_json::nlohmann_json)

add_executable(ai_tune src/tune_main.cpp)
target_link_libraries(
  ai_tune PRIVATE ai_engine nlohmann_json::nlohmann_json Threads::Threads
)

add_executable(ai_compare src/compare_main.cpp)
target_link_libraries(ai_compare PRIVATE ai_engine Threads::Threads)

add_executable(
  ai_benchmark
  src/benchmark_main.cpp
  src/terminal_renderer.cpp
)
target_link_libraries(
  ai_benchmark PRIVATE ai_engine nlohmann_json::nlohmann_json Threads::Threads
)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(ai_engine PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(ai_agent PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(ai_tune PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(ai_compare PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(ai_benchmark PRIVATE -Wall -Wextra -Wpedantic)
endif()

include(CTest)
if(BUILD_TESTING)
  add_executable(ai_engine_tests tests/engine_tests.cpp)
  target_link_libraries(ai_engine_tests PRIVATE ai_engine)
  if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(ai_engine_tests PRIVATE -Wall -Wextra -Wpedantic)
  endif()
  add_test(NAME ai_engine_tests COMMAND ai_engine_tests)
  add_test(
    NAME ai_benchmark_smoke
    COMMAND ai_benchmark --model easy --games 1 --seed 42 --max-pieces 10
            --format json
  )
  add_test(
    NAME ai_benchmark_preview_smoke
    COMMAND ai_benchmark --model easy --games 1 --seed 42 --max-pieces 3
            --preview --delay-ms 0
  )
  add_test(
    NAME ai_tune_smoke
    COMMAND ai_tune --iterations 1 --population 2 --elite 1 --games 1
            --validation-games 1 --max-pieces 5 --max-nodes 2000
  )
  add_test(
    NAME ai_compare_smoke
    COMMAND ai_compare --games 2 --max-pieces 5 --think-ms 1
  )
endif()
