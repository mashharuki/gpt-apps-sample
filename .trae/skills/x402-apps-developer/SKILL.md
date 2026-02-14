---
name: "x402-apps-developer"
description: "Builds applications with x402 API, SDK, and MCP. Invoke when the user plans, implements, tests, or ships x402-integrated apps or tools."
---

# x402 Apps Developer

x402のAPI・SDK・MCPを使ったアプリケーションを、設計・実装・検証・運用まで一貫して支援するスキル。

## いつ使うべきか

- x402のAPI/SDK/MCPを使った機能要件を定義する時
- MCPツール設計やUI連携設計を進める時
- 既存システムへのx402統合や移行を行う時
- エラー/性能/セキュリティの改善が必要な時

## 重点方針

- 仕様不明点は公式ドキュメントの確認を前提に進め、実装は安全側で設計する
- 入出力の型、安全な例外処理、観測性を標準化する
- MCPのツール境界を明確にし、UI/サーバー/外部APIの責務を分離する

## 対応領域

1. 要件定義とAPI設計
2. x402 SDK組み込み
3. MCPツール/リソース設計
4. UI連携設計
5. 認証・セキュリティ・レート制御
6. テスト戦略と品質基準
7. デプロイと運用

## 標準ワークフロー

1. ユースケース分解とAPI依存関係整理
2. SDK導入とAPIクライアントの抽象化
3. MCPツール設計（入力/出力/エラー）
4. UI連携のイベント設計
5. テストと検証（単体/統合/E2E）
6. 観測性・運用設計（ログ/メトリクス/アラート）

## MCP設計ガイド

- ツールは小さく、単一責務に分割する
- 入力は明確なスキーマと型定義を持たせる
- 失敗時のエラーモデルを統一し、UIへ伝播する
- リソースは一覧・詳細の2階層を基本とする

## SDK統合の設計原則

- SDK依存はサービス層に閉じ込める
- APIレスポンスはドメインモデルへ変換する
- 認証情報は環境変数で管理する
- リトライ/バックオフ/タイムアウトを統一する

## 例: TypeScriptサービス層の骨格

```ts
export type X402ClientOptions = {
    apiBaseUrl: string;
    apiKey: string;
    timeoutMs: number;
};

export type X402Request = {
    resourceId: string;
};

export type X402Response = {
    id: string;
    status: string;
};

export type X402Service = {
    fetchResource(params: X402Request): Promise<X402Response>;
};

export const DEFAULT_TIMEOUT_MS: number = 30000;

export const createX402Service = (options: X402ClientOptions): X402Service => {
    const fetchResource = async (params: X402Request): Promise<X402Response> => {
        const requestUrl: string = `${options.apiBaseUrl}/resources/${params.resourceId}`;
        const response: Response = await fetch(requestUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${options.apiKey}`,
            },
        });

        if (!response.ok) {
            throw new Error("X402_API_REQUEST_FAILED");
        }

        const data: X402Response = await response.json();
        return data;
    };

    return { fetchResource };
};
```

## 例: MCPツールの設計指針

- ツール名は動詞で開始する
- 成功/失敗の返却フォーマットを統一する
- 依存する外部APIはサービス層に集約する

## テスト戦略

- SDKラッパーの単体テスト
- MCPツールの入出力テスト
- UI連携の統合テスト
- エラー系/レート制御/タイムアウトの検証

## 運用・品質チェックリスト

- APIキーは環境変数で管理
- ログに機密情報を含めない
- API失敗時のユーザー通知を実装
- 監視項目（成功率/遅延/失敗率）を定義

## 典型タスク

- x402 APIのクライアント実装と型定義の追加
- MCPツールの新規追加とUI連携
- SDKのバージョン更新と破壊的変更対応
- 大量データ取得時のページネーション設計

