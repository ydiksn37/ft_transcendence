// Generates documentation only; never connects to or modifies a database.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const documentPath = path.join(root, 'docs/ER.md');
const schema = fs.readFileSync(path.join(root, 'apps/backend/prisma/schema.prisma'), 'utf8');
const blocks = [...schema.matchAll(/^(model|enum) (\w+) \{\n([\s\S]*?)^\}/gm)].map(m => ({
  kind: m[1], name: m[2], lines: m[3].split('\n').map(l => l.split('//')[0].trim()).filter(Boolean),
}));
const models = blocks.filter(b => b.kind === 'model');
const enums = blocks.filter(b => b.kind === 'enum');
const modelNames = new Set(models.map(m => m.name));
for (const model of models) {
  model.fields = model.lines.filter(l => !l.startsWith('@@')).map(line => {
    const match = line.match(/^(\w+)\s+(\w+)(\?|\[\])?(.*)$/);
    if (!match) throw Error(`Unsupported field: ${model.name}: ${line}`);
    return { name: match[1], type: match[2], suffix: match[3] || '', attrs: match[4].trim() };
  });
}
const out = [
  '# DB設計書（Prisma schema同期）', '',
  'このファイルは `node tools/schema-doc.cjs --write` の出力です。手編集せず、schema変更後に再生成してください。',
  '`node tools/schema-doc.cjs --check` で同期を検証できます。DB接続・migrationは行いません。', '',
  '正本: [schema.prisma](../apps/backend/prisma/schema.prisma)。テーブルはPrismaモデル名で表記しています。',
  `総テーブル数: **${models.length}** / enum数: **${enums.length}**。実DBへのmigration適用状況を証明する図ではありません。`, '',
  '## ER図', '',
  '属性の型はPrisma型です。nullable・listは注記、PK/FK/UKは単一フィールドの制約です。',
  '複合制約・DB固有型・default・onDeleteは後述の定義一覧を参照してください。', '',
  '```mermaid', 'erDiagram',
];
for (const model of models) {
  const relations = model.fields.filter(f => modelNames.has(f.type));
  const fks = new Set(relations.flatMap(f =>
    (f.attrs.match(/fields:\s*\[([^\]]+)\]/)?.[1] || '').split(',').map(s => s.trim()).filter(Boolean)));
  out.push(`    ${model.name} {`);
  for (const f of model.fields.filter(f => !modelNames.has(f.type))) {
    const keys = [/@id\b/.test(f.attrs) && 'PK', fks.has(f.name) && 'FK', /@unique\b/.test(f.attrs) && 'UK'].filter(Boolean);
    const note = f.suffix === '?' ? ' "nullable"' : f.suffix === '[]' ? ' "list"' : '';
    out.push(`        ${f.type} ${f.name}${keys.length ? ' ' + keys.join(',') : ''}${note}`);
  }
  out.push('    }');
}
let relationCount = 0;
for (const model of models) {
  for (const f of model.fields.filter(f => modelNames.has(f.type))) {
    const foreignKeys = f.attrs.match(/fields:\s*\[([^\]]+)\]/);
    if (!foreignKeys) continue; // Render owning side once, not both relation fields.
    const names = foreignKeys[1].split(',').map(s => s.trim());
    const unique = names.length === 1 && model.fields.some(x => x.name === names[0] && /@(unique|id)\b/.test(x.attrs));
    out.push(`    ${f.type} ${f.suffix === '?' ? '|o' : '||'}..${unique ? 'o|' : 'o{'} ${model.name} : "${f.name} (${names.join(', ')})"`);
    relationCount++;
  }
}
out.push('```', '', `FKリレーション数: **${relationCount}**。関連先が任意なら0..1、必須なら1、子側は0..多（unique FKなら0..1）です。`, '',
  '## Enum', '', '| Enum | Values |', '| --- | --- |');
for (const e of enums) out.push(`| ${e.name} | ${e.lines.join(', ')} |`);
out.push('', '## フィールド・制約・参照定義', '',
  '全scalar/enumフィールドとFK所有側のrelationを掲載します。逆参照フィールドはER図とschemaを参照してください。', '');
for (const model of models) {
  out.push(`### ${model.name}`, '', '```prisma');
  for (const f of model.fields) {
    if (!modelNames.has(f.type) || /fields:/.test(f.attrs)) out.push(`${f.name} ${f.type}${f.suffix}${f.attrs ? ' ' + f.attrs : ''}`);
  }
  out.push(...model.lines.filter(l => l.startsWith('@@')), '```', '');
}
out.push('## 解釈上の注意', '',
  '- Organization、OrgMembership、DataExportRequest、Notificationモデルは存在しません。',
  '- GameResult.tournamentMatchIdは通常のnullable文字列とindexです。実際のFKはTournamentMatch.gameResultId → GameResult.idです。',
  '- nullのplayer/winner参照だけでAI・引き分け・ユーザー削除を区別できません。isAiGame、gameMode等と合わせて扱います。',
  '- schemaのonDeleteとサービスの削除処理は別です。アカウント削除サービスはChatMessage等を明示的に削除するため、SetNullだけが行われるとは限りません。',
  '- UserStats.winRateは現在の保存処理でwins / (wins + losses) × 100（分母0なら0）。GameAnalyticはUTC日次集計です。これらはschemaの制約ではなくアプリケーションの更新規則です。', '');
const document = out.join('\n');
if (process.argv.includes('--write')) {
  fs.writeFileSync(documentPath, document);
  console.log(`docs/ER.md updated: ${models.length} tables, ${enums.length} enums, ${relationCount} relations.`);
} else if (process.argv.includes('--check')) {
  if (fs.readFileSync(documentPath, 'utf8') !== document) {
    console.error('docs/ER.md is out of date; regenerate with node tools/schema-doc.cjs --write');
    process.exitCode = 1;
  } else console.log(`docs/ER.md matches schema: ${models.length} tables, ${enums.length} enums, ${relationCount} relations.`);
} else process.stdout.write(document);
