import { Prisma } from '@prisma/client';
const dec = new Prisma.Decimal(2.5);
const safeNum = (val: any) => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};
console.log(safeNum(dec));
