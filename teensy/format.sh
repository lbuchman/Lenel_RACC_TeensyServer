#!/bin/sh


# .astylerrc has settings
#astyle -y -n --recursive --options=.astylerc "./src/*.cpp" | grep Formatted
#astyle -y -n --recursive --options=.astylerc "./lib/*.cpp" | grep Formatted
#astyle -y -n --recursive --options=.astylerc "./include/*.h" | grep Formatted
#astyle -y -n --recursive --options=.astylerc "./include/*.hpp" | grep Formatted
#astyle -y -n --recursive --options=.astylerc "./lib/*.h" | grep Formatted
#astyle -y -n --recursive --options=.astylerc "./lib/*.hpp" | grep Formatted


# shall have .clamg-format file
find . -regex '.*\.\(cpp\|hpp\|h\)' -exec clang-format -i {} +