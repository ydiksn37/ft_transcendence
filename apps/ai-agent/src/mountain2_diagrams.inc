// Mountainous Stacking 2, first bag and second-bag TST arrangements.
// Source: https://w.atwiki.jp/sasasa123/pages/851.html (overview diagram).
// L/l distinguish the carried L from the second bag's L; both assignments
// are explored by the solver. The mirrored opening carries J instead.
#include "mountain2_pc_diagrams.inc"
{"Mountain-2/Hold-stack", 1,
 {"is--------", "iss----t--", "ijs-zzttoo", "ijjj-zztoo"}, PieceType::L},
// Prefer residuals with registered third-bag PC solutions.
{"Mountain-2/TST-4", 2,
 {"jjoo------", "jsoo--l--i", "jss---llli", "ccstzzLLLi",
  "cccttzzcLi", "ccctcccccc", "cccc-ccccc"}, PieceType::L, true},
{"Mountain-2/TST-5", 2,
 {"--------ss", "oojj--Lssi", "ooj---Llli", "ccjtzzLLli",
  "cccttzzcli", "ccctcccccc", "cccc-ccccc"}, PieceType::L, true},
{"Mountain-2/TST-6", 2,
 {"--------ss", "iiii--Lssl", "jjj---Llll", "ccjtzzLLoo",
  "cccttzzcoo", "ccctcccccc", "cccc-ccccc"}, PieceType::L, true},
{"Mountain-2/TST-7", 2,
 {"--------LL", "iiii--lllL", "jjj---lssL", "ccjtzzssoo",
  "cccttzzcoo", "ccctcccccc", "cccc-ccccc"}, PieceType::L, true},
{"Mountain-2/TST-1", 2,
 {"ll-------i", "lL-------i", "lLjj-----i", "LLj----ssi",
  "ccjtzzssoo", "cccttzzcoo", "ccctcccccc", "cccc-ccccc"}, PieceType::L, false},
{"Mountain-2/TST-2", 2,
 {"illl------", "iloo------", "isoo------", "iss-----LL",
  "ccstzzjjjL", "cccttzzcjL", "ccctcccccc", "cccc-ccccc"}, PieceType::L, false},
{"Mountain-2/TST-3", 2,
 {"iiii------", "lLLL------", "lLjj------", "llj----ss-",
  "ccjtzzssoo", "cccttzzcoo", "ccctcccccc", "cccc-ccccc"}, PieceType::L, false},
