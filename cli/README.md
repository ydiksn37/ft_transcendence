# Tetris CLI (C++)

TypeScript版と同じ40×10盤面、ミノ形状、7-bag、SRS/TETR.IO 180度キック、
T-Spin判定、HOLD、NEXT、ロック遅延を利用する端末版テトリスです。

## 起動

リポジトリのルートで実行します。

```sh
make cli
```

起動後、上下キー（または`1`/`2`）で`MARATHON`か`40 LINES`を選び、
Enterで開始します。直接指定する場合は次のように実行できます。

```sh
./build/cli/tetris_cli --mode 40-lines --seed 42
```

seedは通常起動時と再スタート時に毎回ランダム生成されます。`--seed`は同じ
7-bagを再現してデバッグしたい場合にだけ指定してください。

## キーバインド

[`config.json`](config.json)の`keyBindings`を編集します。指定できるキーは
1文字、`left`、`right`、`up`、`down`、`space`、`enter`、`escape`です。
端末入力ではShiftやCtrlなどの修飾キーを安定して区別できないため、単独キーを
指定してください。各操作に同じキーを重複して指定することはできません。

別の設定ファイルは`--config PATH`で指定できます。色を無効にする場合は
`"color": false`にします。

`softDropFactor`で、ソフトドロップ入力1回あたりに落とすマス数を指定できます。
TS版のSDFと同じく`0`は無限（接地位置まで即時移動し、ロックはしない）です。

```json
{
  "softDropFactor": 6
}
```

指定範囲は`0`から`40`です。

左右長押しとソフトドロップ長押しは次の値で調整できます。

```json
{
  "dasMilliseconds": 133,
  "arrMilliseconds": 33,
  "softDropIntervalMilliseconds": 33
}
```

- `dasMilliseconds`: 左右キーを押してから自動移動を始めるまでの時間
- `arrMilliseconds`: 自動移動中の1マスごとの間隔。`0`ならDAS後に壁まで移動
- `softDropIntervalMilliseconds`: ソフトドロップ長押し中の入力間隔

起動時に拡張キーボード入力へ対応している端末を自動検出します。対応時は画面に
`INPUT ENHANCED`と表示され、同時押しとキー解放を正確に扱います。`INPUT LEGACY`
の場合は端末OSのキーリピートへフォールバックするため、長押し開始時間は端末設定の
影響を受けます。

## ビルドとテスト

```sh
make cli-build
make cli-test
```

CLIは`apps/ai-agent`のC++盤面・7-bag実装を直接リンクするため、AIとCLIで
物理ルールが分岐しません。JSONはリポジトリに固定済みのnlohmann/json 3.11.3を
利用するため、追加ダウンロードはありません。
