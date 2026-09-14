// Transcribed from https://shiwehi.com/tetris/template/honeycup.php
// Lower/upper case distinguish the two J pieces in the carried-Hold bag.
// The page says 14 PC patterns; its HTML currently contains 15 diagrams.
static const std::vector<HoneyDiagram> kHoneyDiagrams = {
#include "mountain2_diagrams.inc"
  {"Honey-Cup/Hold-stack", 1, {"----------", "----------", "-ss-------", "ssl----t--", "lll-zzttoo", "iiii-zztoo"}},
  {"Honey-Cup/Hold-TST-1", 2, {"----------", "iiii------", "JJss--jj--", "Jss---jlll", "Jcctzzjloo", "cccttzzcoo", "ccctcccccc", "cccc-ccccc"}},
  {"Honey-Cup/Hold-TST-2", 2, {"----------", "iiii------", "JJss--lj--", "Jss---ljjj", "Jcctzzlloo", "cccttzzcoo", "ccctcccccc", "cccc-ccccc"}},
  {"Honey-Cup/Hold-TST-3", 2, {"----------", "iiii------", "jjss--oo--", "jss---oolJ", "jcctzzlllJ", "cccttzzcJJ", "ccctcccccc", "cccc-ccccc"}},
  {"Honey-Cup/Hold-TST-4", 2, {"----------", "illl------", "ilss--jj--", "iss---jooJ", "icctzzjooJ", "cccttzzcJJ", "ccctcccccc", "cccc-ccccc"}},
  {"Honey-Cup/Hold-TST-5", 2, {"----------", "ijjj------", "iooj--ls--", "ioo---lssJ", "icctzzllsJ", "cccttzzcJJ", "ccctcccccc", "cccc-ccccc"}},
  {"Honey-Cup/PC-1", 3, {"----------", "iiiillljjj", "cccclsszzj", "ccccsscczz", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-2", 3, {"----------", "iiiijjzsll", "ccccjzzssl", "ccccjzccsl", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-3", 3, {"----------", "iiiilllooj", "cccclssooj", "ccccssccjj", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-4", 3, {"----------", "iiiijjzlll", "ccccjzzloo", "ccccjzccoo", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-5", 3, {"----------", "iiiijjjsll", "ccccoojssl", "ccccooccsl", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-6", 3, {"----------", "iiiiloojjj", "ccccloozzj", "ccccllcczz", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-7", 3, {"----------", "iiiijsszzl", "ccccjjjlll", "ccccsscczz", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-8", 3, {"----------", "iiiijsslll", "ccccjjjloo", "ccccssccoo", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-9", 3, {"----------", "iiiiooljjj", "cccclllzzj", "ccccoocczz", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-10", 3, {"----------", "iiiijjjzzl", "ccccoojlll", "ccccoocczz", "ccctttcccc", "cccctccccc"}},
  {"Honey-Cup/PC-11", 3, {"----------", "iiiijjzlll", "ccccjzzloo", "ccccssccoo", "cccsszcccc", "ccccjccccc"}},
  {"Honey-Cup/PC-12", 3, {"----------", "iiiilllooj", "cccctttooj", "ccccssccjj", "cccsstcccc", "cccclccccc"}},
  {"Honey-Cup/PC-13", 3, {"----------", "iiiillljjj", "cccctttzzj", "ccccsscczz", "cccsstcccc", "cccclccccc"}},
  {"Honey-Cup/PC-14", 3, {"----------", "iiiitoojjj", "ccccsoozzj", "ccccsscczz", "cccttscccc", "cccctccccc"}},
  {"Honey-Cup/PC-15", 3, {"----------", "iiiitoozzl", "ccccsoolll", "ccccsscczz", "cccttscccc", "cccctccccc"}},
};
