cmake_minimum_required(VERSION 3.20)

project(transcendence_tetris_cli LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(AI_AGENT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../apps/ai-agent")
set(NLOHMANN_JSON_VERSION "3.11.3")
set(NLOHMANN_JSON_INCLUDE_DIR "${AI_AGENT_DIR}/third_party")
if(NOT EXISTS "${NLOHMANN_JSON_INCLUDE_DIR}/nlohmann/json.hpp")
  message(FATAL_ERROR
          "vendored nlohmann/json ${NLOHMANN_JSON_VERSION} is missing")
endif()

add_library(cli_tetris_engine
  "${AI_AGENT_DIR}/src/bag.cpp"
  "${AI_AGENT_DIR}/src/board.cpp"
  src/game.cpp
)
target_include_directories(cli_tetris_engine PUBLIC
  include
  "${AI_AGENT_DIR}/include"
)

add_executable(tetris_cli
  src/config.cpp
  src/main.cpp
  src/renderer.cpp
  src/terminal.cpp
)
target_include_directories(tetris_cli PRIVATE "${NLOHMANN_JSON_INCLUDE_DIR}")
target_compile_definitions(tetris_cli PRIVATE
  TETRIS_CLI_DEFAULT_CONFIG="${CMAKE_CURRENT_SOURCE_DIR}/config.json"
)
target_link_libraries(tetris_cli PRIVATE cli_tetris_engine)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(cli_tetris_engine PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(tetris_cli PRIVATE -Wall -Wextra -Wpedantic)
endif()

include(CTest)
if(BUILD_TESTING)
  add_executable(tetris_cli_tests tests/game_tests.cpp)
  target_include_directories(tetris_cli_tests PRIVATE
    "${NLOHMANN_JSON_INCLUDE_DIR}"
  )
  target_link_libraries(tetris_cli_tests PRIVATE cli_tetris_engine)
  if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(tetris_cli_tests PRIVATE -Wall -Wextra -Wpedantic)
  endif()
  add_test(NAME tetris_cli_tests COMMAND tetris_cli_tests)
endif()
