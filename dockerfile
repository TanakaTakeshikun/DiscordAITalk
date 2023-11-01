# ベースイメージを指定
FROM node:19.2.0

# コンテナ内の作業ディレクトリを設定
WORKDIR /DiscordAITalk

# ローカルのpackage.jsonとpackage-lock.jsonをコンテナ内の作業ディレクトリにコピー
COPY package*.json ./

# npmパッケージのインストール
RUN npm install

# ローカルのソースコードをコンテナ内の作業ディレクトリにコピー
COPY . .

CMD [ "npm","start" ]