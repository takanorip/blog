# Blog Editor

`https://blog.takanorip.com/admin/` で動くブログ用の Web エディタ。DB は持たず、記事の実体は GitHub 上の `src/posts/*.md`。保存するたびに GitHub API で `master` に直接コミットする。

- GitHub OAuth でログインし、`ALLOWED_GITHUB_LOGIN` に設定したユーザーだけが使える
- 記事の新規作成とファイル名（= URL `/posts/<ファイル名>/`）の変更ができる（リネームは 1 コミットで行う）
- プレーンな textarea で front matter ごと編集し、「編集」「プレビュー」をタブで切り替える（PC でもスマホでも同じ）
- プレビューは記事ページ（`layouts/blog.njk`）と同じ HTML 構造・同じコードハイライト出力を組み立て、公開中の `/css/index.css` と `/css/prism.css` をそのまま読み込む。`.eleventy.js` の markdown-it 設定を変えたら `editor/client/markdown.ts` も合わせる
- 画面は React と [Kumo](https://kumo-ui.com/) で作っていて、ダークモードは OS の設定に従う（ブログと同じ）
- 下書きは front matter の `draft: true`。下書きのまま保存したコミットには `[skip ci]` が付くので、Cloudflare Pages のビルドは走らない
- 「公開する」で `draft: true` を外してコミットし、サイトを再ビルドする。「下書きに戻す」で非公開にできる
- 保存前の編集内容はブラウザの localStorage に退避していて、リロードや再ログインの後でも復元できる
- GitHub 上のファイルが別の場所（Cursor など）で更新されていたら、上書きせずにエラーにする

## 構成

| パス | 内容 |
| --- | --- |
| `editor/client/` | エディタの画面（React + Kumo。esbuild と Tailwind CSS でビルドして `_site/admin/` に出力） |
| `editor/server/` | Hono で書いた API（認証と GitHub API の呼び出し） |
| `editor/shared/` | client と server の両方で使う front matter 処理 |
| `functions/admin/api/[[route]].ts` | Cloudflare Pages Functions のエントリーポイント |

Eleventy 側では `.eleventy.js` のプリプロセッサが、本番ビルドのときに `draft: true` の記事を出力から外す。記事ページだけでなく、一覧、タグ、RSS、Algolia の対象からも外れる。`npm run dev` では下書きも表示される。

`npm run save-algolia` は、ビルド結果にない記事（下書きに戻した記事や削除した記事）を Algolia のインデックスから消す。そのため `ALGOLIA_API_KEY` に `addObject` に加えて `browse` と `deleteObject` の ACL が必要になる。権限が足りないときは警告を出すだけで、デプロイは止めない。

## セットアップ

### 1. GitHub OAuth App を作る

GitHub の Settings → Developer settings → OAuth Apps → New OAuth App で作成する。

- Homepage URL: `https://blog.takanorip.com/`
- Authorization callback URL: `https://blog.takanorip.com/admin/api/auth/callback`

作成後に Client ID と Client Secret を控えておく。

OAuth App のトークン（scope は `public_repo`）は、自分の public リポジトリすべてに書き込める。権限をこのリポジトリだけに絞りたい場合は、代わりに GitHub App を作る。その場合は Repository permissions の Contents を Read and write にして、`takanorip/blog` にだけインストールする。callback URL と環境変数は OAuth App と同じで、コードは変えなくてよい。GitHub App のトークンは 8 時間で失効するので、そのたびに再ログインが必要になる（App の設定で失効を無効にもできる）。

### 2. Cloudflare Pages の環境変数

Pages プロジェクトの Settings → Variables and Secrets に以下を設定する（Production）。

| 名前 | 値 |
| --- | --- |
| `GITHUB_CLIENT_ID` | OAuth App の Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App の Client Secret（Secret として登録） |
| `SESSION_SECRET` | ランダムな長い文字列（`openssl rand -base64 32` など。Secret として登録） |
| `ALLOWED_GITHUB_LOGIN` | `takanorip` |
| `GITHUB_REPO` | 省略時 `takanorip/blog` |
| `GITHUB_BRANCH` | 省略時 `master` |
| `GITHUB_OAUTH_SCOPE` | 省略時 `public_repo`（private リポジトリにする場合は `repo`） |

### 3. ビルド設定

Pages のビルドコマンドは `npm run build` にしておく。`npm run build` は Eleventy のビルドに加えて `npm run build:editor` でエディタも `_site/admin/` に出力する。出力ディレクトリは `_site` のまま。Pages はリポジトリ直下の `functions/` を自動で Functions としてデプロイするので、`/admin/api/*` だけが Functions で処理され、ブログ本体は今までどおり静的配信になる。

## ローカル開発

```sh
cp .env.example .env   # 値を埋める
npm run editor:dev     # http://localhost:8788/admin/
```

ローカル用に別の OAuth App を作り、callback URL を `http://localhost:8788/admin/api/auth/callback` にする。ローカルでも本物の `master` にコミットされるので注意。

```sh
npm run editor:test       # GitHub API をモックした API のテスト
npm run editor:typecheck
```
