cmake_minimum_required(VERSION 3.20)

project(transcendence_ai_agent LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

# Keep this version explicit so every developer and Docker build uses the same
# JSON implementation. CMake downloads it during the configure step.
set(NLOHMANN_JSON_VERSION "3.11.3")
set(JSON_BuildTests OFF CACHE INTERNAL "Disable nlohmann/json tests")

FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG "v${NLOHMANN_JSON_VERSION}"
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

add_library(ai_engine
  src/agent.cpp
  src/bag.cpp
  src/board.cpp
  src/easy_agent.cpp
  src/game_simulator.cpp
)
target_include_directories(ai_engine PUBLIC include)

add_executable(ai_agent src/main.cpp)
target_link_libraries(ai_agent PRIVATE ai_engine nlohmann_json::nlohmann_json)

find_package(Threads REQUIRED)
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
endif()
