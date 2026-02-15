# x402に対応した自動支払い GPT App

## 構成

- mcp-server: MCPサーバーとUI
- x402-server: x402 API呼び出しロジック（クライアント）

## 動かし方

### セットアップ

```bash
bun install
```

### x402サーバー用の環境変数を設定する

pkgs/x402-server/.env.example をコピーして .env を作成します。

### x402サーバー起動

```bash
bun run x402 dev
```

### MCPサーバー起動

```bash
bun run dev
```

起動ログに表示されたURLのポートが実際の待ち受けポートです。

```
x402 auto-pay app listening on http://localhost:8787
```

### MCPインスペクター

```bash
bunx @modelcontextprotocol/inspector@latest --server-url http://localhost:<port>/mcp --transport http
```

### ChatGPT開発者画面

まず[ngrok]( https://dashboard.ngrok.com/signup) でサインアップします。

```bash
ngrok http <port>
```

ChatGPTの開発者画面で以下を設定します。

- アプリの名前
- アプリの説明
- MCPまでのURL
- 認証の有無(検証目的では無しでOK)

### 環境変数

pkgs/mcp-server/.env.example をコピーして .env を作成します。

## コード品質

```bash
bun run lint
bun run format
bun run check
```
