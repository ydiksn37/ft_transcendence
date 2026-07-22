FROM nginx:1.27-alpine

# 自己署名 SSL 証明書を生成（評価環境用）
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/server.key \
      -out /etc/nginx/ssl/server.crt \
      -subj "/C=JP/ST=Tokyo/L=Tokyo/O=ft_transcendence/CN=localhost"

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443
